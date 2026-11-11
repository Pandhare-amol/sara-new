/**
 * Audio handling utility for Myraa Live API Voice stream.
 * Handles:
 * - 16kHz layout sampling for microphone stream.
 * - Raw Little Endian Int16 PCM translation.
 * - 24kHz layout output sampling for model voice playback.
 * - Gapless double-buffer queue scheduler.
 * - Interrupt signal immediate stop.
 * - Input & Output AnalyserNodes for real-time waveform visuals.
 */

export type LiveState = "disconnected" | "connecting" | "listening" | "speaking";
export type LiveToolTaskState = "accepted" | "waiting" | "cancelling" | "completed" | "failed" | "cancelled";
export interface LiveToolTaskProgress { taskId: string; state: LiveToolTaskState; tool: string; message: string; at: number; }
export interface AudioDiagnostics {
  state: LiveState;
  microphone: "connected" | "paused" | "disabled" | "unavailable";
  voiceConnection: "connected" | "connecting" | "disconnected";
  playback: "ready" | "speaking" | "unavailable";
  reconnectAttempt: number;
}

// PCM Conversion Helper: converts Float32Array [-1.0, 1.0] to signed Int16 Raw PCM Little Endian
function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

/**
 * Streaming pitch shifter that raises pitch by `ratio` without changing speed
 * (lip-sync and timing are kept). A single read head plays the delay line a
 * little faster than real time; when it catches up with the newest audio it
 * jumps back by the lag whose waveform matches best (pitch-period aligned)
 * and crossfades for 5 ms. Only one copy of the voice is audible at a time,
 * so there is no doubling or echo (the comb effect of two free-running heads).
 * State carries across chunks, so chunk boundaries stay seamless.
 */
export class PitchShifter {
  private readonly N = 8192;
  private readonly buf = new Float32Array(8192);
  private written = 0;
  private rp: number;
  private fadeFrom = 0;
  private fadeLeft = 0;
  private readonly W: number; // match window
  private readonly X: number; // crossfade length
  private readonly minLag: number;
  private readonly maxLag: number;
  private readonly minDelay: number;

  constructor(private readonly ratio: number, sampleRate = 24000) {
    const s = sampleRate / 24000;
    this.W = Math.round(240 * s); // 10 ms
    this.X = Math.round(120 * s); // 5 ms
    this.minLag = Math.round(240 * s);
    this.maxLag = Math.round(720 * s); // 30 ms
    this.minDelay = Math.round(400 * s);
    this.rp = -(this.minDelay + this.maxLag);
  }

  private at(pos: number): number {
    const i = Math.floor(pos);
    const f = pos - i;
    const a = i >= 0 && i < this.written ? this.buf[i % this.N] : 0;
    const b = i + 1 >= 0 && i + 1 < this.written ? this.buf[(i + 1) % this.N] : 0;
    return a + (b - a) * f;
  }

  /** Jump the head back by the best-matching lag and start a crossfade. */
  private splice(): void {
    const base = Math.floor(this.rp);
    let best = this.minLag;
    let bestScore = -Infinity;
    for (let lag = this.minLag; lag <= this.maxLag; lag += 2) {
      let dot = 0;
      let energy = 1e-9;
      for (let k = 0; k < this.W; k += 2) {
        const a = this.at(base + k);
        const b = this.at(base - lag + k);
        dot += a * b;
        energy += b * b;
      }
      const score = dot / Math.sqrt(energy);
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    this.fadeFrom = this.rp;
    this.rp -= best;
    this.fadeLeft = this.X;
  }

  process(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (let n = 0; n < input.length; n++) {
      this.buf[this.written % this.N] = input[n];
      this.written++;
      let y: number;
      if (this.fadeLeft > 0) {
        const t = 1 - this.fadeLeft / this.X;
        y = this.at(this.fadeFrom) * (1 - t) + this.at(this.rp) * t;
        this.fadeFrom += this.ratio;
        this.fadeLeft--;
      } else {
        y = this.at(this.rp);
      }
      out[n] = y;
      this.rp += this.ratio;
      if (this.fadeLeft === 0 && this.written - this.rp < this.minDelay) this.splice();
    }
    return out;
  }
}

// Float conversion helper: converts signed Int16 array buffer to Float32Array [-1.0, 1.0]
function pcm16ToFloats(uint8Array: Uint8Array): Float32Array {
  const int16 = new Int16Array(
    uint8Array.buffer,
    uint8Array.byteOffset,
    uint8Array.byteLength / 2
  );
  const floats = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    floats[i] = int16[i] / 32768.0;
  }
  return floats;
}

// Convert ArrayBuffer to Base64 String
function base64ArrayBuffer(arrayBuffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Convert Base64 string to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class SaraAudioSession {
  private ws: WebSocket | null = null;
  
  // Audios contexts (separate to match exact required sample rates)
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  
  // Audio sources & processors
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;
  
  // Visualisers
  public inputAnalyser: AnalyserNode | null = null;
  public outputAnalyser: AnalyserNode | null = null;
  private outputGainNode: GainNode | null = null;
  private pitchShifter: PitchShifter | null = null;
  
  // Buffering / Playback details
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private userSpeaking = false;
  private voiceFrames = 0;
  private lastVoiceAt = 0;
  private outputSpeechStartedAt = 0;
  private noiseFloorRms = 0.006;
  private readonly voiceThreshold = 0.024;
  private readonly voiceStartFrames = 6;
  private readonly voiceStopDelayMs = 900;
  private readonly bargeInGuardMs = 180;
  private readonly bargeInStartFrames = 4;
  private readonly bargeInVoiceThreshold = 0.035;
  private bargeInEnabled = true;
  private listeningPaused = false;
  private speechMuted = false;
  
  // State Callbacks
  private onStateChange: (state: LiveState) => void;
  private onTranscription: (role: "user" | "model", text: string) => void;
  private onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
  private onError: (error: string) => void;
  private onMemorySync?: (memories: any[]) => void;
  private onTaskProgress?: (task: LiveToolTaskProgress) => void;
  private onScreenVisionState?: (state: "idle" | "capturing" | "ready" | "error", info: { activeWindow?: string | null; error?: string | null }) => void;
  
  private currentState: LiveState = "disconnected";
  private isActivated = false;
  private useMicrophone = true;
  private liveReady = false;
  private outputReady = false;
  private pendingTextMessages: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private lastInterruptionAt = 0;

  constructor(handlers: {
    onStateChange: (state: LiveState) => void;
    onTranscription: (role: "user" | "model", text: string) => void;
    onToolCall: (name: string, args: any, callback: (result: any) => void) => void;
    onError: (error: string) => void;
    onMemorySync?: (memories: any[]) => void;
    onTaskProgress?: (task: LiveToolTaskProgress) => void;
    onScreenVisionState?: (state: "idle" | "capturing" | "ready" | "error", info: { activeWindow?: string | null; error?: string | null }) => void;
  }) {
    this.onStateChange = handlers.onStateChange;
    this.onTranscription = handlers.onTranscription;
    this.onToolCall = handlers.onToolCall;
    this.onError = handlers.onError;
    this.onMemorySync = handlers.onMemorySync;
    this.onTaskProgress = handlers.onTaskProgress;
    this.onScreenVisionState = handlers.onScreenVisionState;
  }

  private setState(state: LiveState) {
    this.currentState = state;
    this.onStateChange(state);
  }

  public getState(): LiveState {
    return this.currentState;
  }

  /** A truthful snapshot for the UI; this never claims a service is ready from state alone. */
  public getDiagnostics(): AudioDiagnostics {
    const socketOpen = this.ws?.readyState === WebSocket.OPEN;
    return {
      state: this.currentState,
      microphone: !this.useMicrophone ? "disabled" : this.listeningPaused ? "paused" : this.micStream ? "connected" : "unavailable",
      voiceConnection: socketOpen && this.liveReady ? "connected" : this.currentState === "connecting" ? "connecting" : "disconnected",
      playback: this.outputReady ? (this.activeSources.length ? "speaking" : "ready") : "unavailable",
      reconnectAttempt: this.reconnectAttempts,
    };
  }

  /** Apply the user's interruption preference without restarting the live connection. */
  public setBargeInEnabled(enabled: boolean): void {
    this.bargeInEnabled = enabled;
  }

  /** Pause microphone forwarding while keeping the live connection and tasks alive. */
  public setListeningPaused(paused: boolean): void {
    this.listeningPaused = paused;
    this.voiceFrames = 0;
    this.userSpeaking = false;
  }

  /** Mute local playback only; model responses and background tasks continue. */
  public setSpeechMuted(muted: boolean): void {
    this.speechMuted = muted;
    if (this.outputGainNode) this.outputGainNode.gain.value = muted ? 0 : 1;
  }

  /** Cancel one backend tool operation without disconnecting voice or other work. */
  public cancelToolTask(taskId: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !taskId) return false;
    this.ws.send(JSON.stringify({ type: "cancelToolTask", taskId }));
    return true;
  }

  /**
   * Pushes a compressed JPEG base64 screenshot frame directly to the live WebSocket server.
   */
  public sendVideoFrame(
    base64Data: string,
    metadata: { changeScore?: number; heartbeat?: boolean; width?: number; height?: number; capturedAt?: number } = {},
  ): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.currentState !== "disconnected") {
      // Keep only the newest live view. Never let a slow network queue stale
      // desktop frames behind the current screen state.
      if (this.ws.bufferedAmount > 2_000_000) return false;
      this.ws.send(JSON.stringify({ type: "video", video: base64Data, ...metadata }));
      return true;
    }
    return false;
  }

  /** Tell the backend to discard the selected screen's in-memory visual context. */
  public sendScreenSharingStopped(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "screenSharingStopped" }));
    }
  }

  /** Send one explicitly requested local camera frame for a visual question. */
  public sendCameraFrame(base64Data: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.currentState === "disconnected") return false;
    if (this.ws.bufferedAmount > 2_000_000) return false;
    this.ws.send(JSON.stringify({ type: "camera", camera: base64Data }));
    return true;
  }

  /** Queue typed input; it is flushed once Gemini Live is ready. */
  public sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (this.currentState === "speaking") {
      this.emitConversationEvent("user_interrupted_myraa");
      this.handleInterruption();
    }

    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.liveReady &&
      this.outputReady &&
      this.currentState !== "disconnected"
    ) {
      this.ws.send(JSON.stringify({ type: "text", text: trimmed }));
      return;
    }
    this.pendingTextMessages.push(trimmed);
  }

  private flushPendingTextMessages() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.liveReady || !this.outputReady) return;
    for (const text of this.pendingTextMessages.splice(0)) {
      this.ws.send(JSON.stringify({ type: "text", text }));
    }
  }

  // Voice mode requests a microphone; typed mode keeps audio responses without one.
  public async connect(useMicrophone = true) {
    if (this.isActivated) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isActivated = true;
    this.useMicrophone = useMicrophone;
    this.setState("connecting");

    try {
      // 1. Establish custom WebSocket server bridge
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      this.ws = new WebSocket(`${protocol}//${window.location.host}/live`);
      this.ws.binaryType = "blob";

      this.ws.onopen = async () => {
        console.log("[Myraa] Connected to server side WS bridge");
        try {
          // Guard against early user disconnect during connection setup
          if (!this.isActivated) return;

          // Safe, cross-browser AudioContext initialization
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) {
            throw new Error("Holographic audio link unsupported: Web Audio API missing in browser.");
          }

          this.inputAudioCtx = new AudioContextClass({ sampleRate: 16000 });
          this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 });

          // Ensure Audio Contexts are active and resumed to bypass browser security blocks
          if (this.inputAudioCtx.state === "suspended") {
            await this.inputAudioCtx.resume().catch(() => {});
          }
          if (this.outputAudioCtx.state === "suspended") {
            await this.outputAudioCtx.resume().catch(() => {});
          }
          
          // Setup custom output Analyser & Volume Gains
          this.outputGainNode = this.outputAudioCtx.createGain();
          this.outputGainNode.gain.value = this.speechMuted ? 0 : 1;
          this.outputAnalyser = this.outputAudioCtx.createAnalyser();
          this.outputAnalyser.fftSize = 256;
          this.outputAnalyser.smoothingTimeConstant = 0.8;
          
          this.outputGainNode.connect(this.outputAnalyser);
          this.outputAnalyser.connect(this.outputAudioCtx.destination);
          this.outputReady = true;
          this.flushPendingTextMessages();
          // Optional pitch lift (Settings → Voice → Voice pitch).
          this.pitchShifter = null;
          void fetch("/api/app-settings")
            .then((r) => (r.ok ? r.json() : null))
            .then((s) => {
              const semitones = Number(s?.voice?.pitch) || 0;
              this.pitchShifter = semitones > 0 ? new PitchShifter(Math.pow(2, Math.min(5, semitones) / 12)) : null;
              this.bargeInEnabled = s?.voice?.bargeIn !== false;
            })
            .catch(() => undefined);

          if (!this.useMicrophone) {
            this.setState("listening");
            this.flushPendingTextMessages();
            return;
          }

          // Obtain the user microphone. Some embedded preview browsers do not
          // expose getUserMedia even though the main UI itself renders normally.
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(
              "Microphone access is unavailable in this browser. Open MYRAA in Chrome at http://localhost:3000 and allow microphone access.",
            );
          }
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              // AGC boosts quiet room/fan noise, which otherwise trips the
              // local voice detector and causes false barge-ins.
              autoGainControl: false,
            }
          });

          // Safeguard: Check if we disconnected while waiting for user to grant mic permissions
          if (!this.isActivated || !this.inputAudioCtx || !this.outputAudioCtx) {
            stream.getTracks().forEach((track) => {
              try {
                track.stop();
              } catch (e) {}
            });
            return;
          }

          this.micStream = stream;

          // Setup custom input Analyser
          this.inputAnalyser = this.inputAudioCtx.createAnalyser();
          this.inputAnalyser.fftSize = 256;
          
          this.micSourceNode = this.inputAudioCtx.createMediaStreamSource(this.micStream);
          this.micSourceNode.connect(this.inputAnalyser);

          // Stream input PCM 16-bit to WS
          // A smaller buffer cuts microphone-to-live-stream latency while
          // remaining stable on ordinary Windows audio devices.
          this.micProcessorNode = this.inputAudioCtx.createScriptProcessor(1024, 1, 1);
          this.micSourceNode.connect(this.micProcessorNode);
          this.micProcessorNode.connect(this.inputAudioCtx.destination);

          this.micProcessorNode.onaudioprocess = (e) => {
            if (this.currentState === "disconnected" || this.currentState === "connecting") return;
            if (this.listeningPaused) return;
            
            const channelData = e.inputBuffer.getChannelData(0);
            const shouldForwardMicrophone = this.updateVoiceActivity(channelData);
            if (!shouldForwardMicrophone) return;
            
            // Convert to base64 Int16 Little Endian PCM
            const pcmBuffer = floatTo16BitPCM(channelData);
            const base64 = base64ArrayBuffer(pcmBuffer);
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ audio: base64 }));
            }
          };

          // Sound setups are fully functional
          this.setState("listening");

        } catch (audioError: any) {
          console.error("Audio Context or Microphone Initialization Failed:", audioError);
          this.onError(`Permission error: ${audioError.message || "Microphone required for holographic Live link."}`);
          this.disconnect();
        }
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Root Error Handler message
          if (data.type === "error") {
            this.onError(data.error);
            this.disconnect();
            if (data.code === "INVALID_API_KEY") {
              // Keep the current screen stable so the user can read the error.
              // The key gate will be shown naturally on the next app launch.
              console.warn("[Myraa] Gemini rejected the configured API key.");
            }
            return;
          }

          // Handle server-side states
          if (data.type === "status") {
            console.log("[Myraa WS Status]:", data.status);
            if (data.status === "connecting_gemini") {
              // Wait for Gemini Live connection
            } else if (data.status === "connected") {
              this.liveReady = true;
              this.reconnectAttempts = 0;
              this.setState("listening");
              this.flushPendingTextMessages();
            } else if (data.status === "session_closed") {
              this.disconnect();
            }
            return;
          }

          // Handle audio payload (24kHzPCM model response)
          if (data.type === "audio" && data.audio) {
            this.playAudioPCMChunk(data.audio);
          }

          // Handle interruption signal (e.g. user talked over Myraa)
          if (data.type === "interrupted") {
            this.handleInterruption();
          }

          // Turn complete
          if (data.type === "turnComplete") {
            // Once Myraa completes speaking, change visual state back to listening
            setTimeout(() => {
              if (this.activeSources.length === 0 && this.currentState === "speaking") {
                this.setState("listening");
              }
            }, 100);
          }

          // Handle live captions transcription
          if (data.type === "transcription") {
            this.onTranscription(data.role, data.text);
          }

          if (data.type === "taskProgress" && this.onTaskProgress && typeof data.taskId === "string") {
            const states: LiveToolTaskState[] = ["accepted", "waiting", "cancelling", "completed", "failed", "cancelled"];
            if (states.includes(data.state)) {
              this.onTaskProgress({
                taskId: data.taskId,
                state: data.state,
                tool: typeof data.tool === "string" ? data.tool : "Background task",
                message: typeof data.message === "string" ? data.message : "",
                at: Date.now(),
              });
            }
          }

          // Handle memory synchronization
          if (data.type === "memory_sync" && data.memories) {
            if (this.onMemorySync) {
              this.onMemorySync(data.memories);
            }
          }

          // Handle Tool Calling
          if (data.type === "toolCall") {
            const { callId, name, args } = data;
            this.onToolCall(name, args, (result) => {
              // Send back execution result to server bridge
              if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                  type: "toolResponse",
                  id: callId,
                  name: name,
                  output: result
                }));
              }
            });
          }

          // Screen-vision lifecycle events from the server.
          if (data.type === "screenVisionState") {
            if (this.onScreenVisionState) {
              this.onScreenVisionState(data.state, {
                activeWindow: data.activeWindow ?? null,
                error: data.error ?? null,
              });
            }
          }

        } catch (parseError) {
          console.error("Error reading server packet:", parseError);
        }
      };

      this.ws.onerror = (wsError) => {
        console.error("WebSocket transport error:", wsError);
        this.onError("Holographic network link lost. Please check connection.");
        this.scheduleReconnect();
      };

      this.ws.onclose = () => {
        console.log("WebSocket connection closed");
        this.scheduleReconnect();
      };

    } catch (e: any) {
      console.error("Connection establish sequence failed:", e);
      this.onError(e.message || "Failed to initialize active channel.");
      this.disconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.isActivated || this.reconnectTimer) return;
    if (this.reconnectAttempts >= 5) {
      this.disconnect();
      this.onError("Voice connection could not be restored. Tap the core to reconnect.");
      return;
    }
    const pending = [...this.pendingTextMessages];
    this.disconnect();
    this.pendingTextMessages = pending;
    this.isActivated = true;
    this.reconnectAttempts += 1;
    const delay = Math.min(8000, 1000 * 2 ** (this.reconnectAttempts - 1));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.isActivated = false;
      void this.connect(this.useMicrophone);
    }, delay);
  }

  // Interruption triggers: stops all active audio players immediately
  private handleInterruption() {
    const now = performance.now();
    if (now - this.lastInterruptionAt < 300) return;
    this.lastInterruptionAt = now;
    console.log("[Audio] Interruption signal received; flushing play logs.");
    
    // Stop all playing nodes
    this.activeSources.forEach((source) => {
      try {
        source.stop();
      } catch (err) {
        // Already finished or stopped
      }
    });
    this.activeSources = [];
    this.nextStartTime = 0;
    this.outputSpeechStartedAt = 0;
    
    // Set state back to user listening
    this.setState("listening");
  }

  /**
   * Lightweight local VAD for turn-taking. It never calls a model: it only
   * emits start/stop events and flushes buffered TTS immediately on barge-in.
   */
  private updateVoiceActivity(samples: Float32Array): boolean {
    let energy = 0;
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
    const rms = Math.sqrt(energy / Math.max(1, samples.length));
    const timestamp = performance.now();
    const myraaOutputActive = this.currentState === "speaking" || this.activeSources.length > 0;

    if (myraaOutputActive && !this.bargeInEnabled) {
      this.voiceFrames = 0;
      return false;
    }

    // Learn the room floor only from samples still below the speech gate.
    // Otherwise a quiet user can be mislearned as ambient noise, raising the
    // threshold until their voice is dropped.
    if (!myraaOutputActive && !this.userSpeaking) {
      const currentAmbientThreshold = Math.max(this.voiceThreshold * 0.75, this.noiseFloorRms * 1.6 + 0.008);
      if (rms < currentAmbientThreshold) {
        const adaptation = rms < this.noiseFloorRms ? 0.12 : 0.025;
        this.noiseFloorRms = Math.min(0.025, this.noiseFloorRms + (rms - this.noiseFloorRms) * adaptation);
      }
    }

    // Full-duplex speaker playback can leak back into the microphone even with
    // browser echo cancellation enabled. Do not feed that echo to Gemini. A
    // short guard protects the opening words; after it, a louder sustained
    // signal is still accepted as a genuine human barge-in.
    if (
      myraaOutputActive
      && this.outputSpeechStartedAt > 0
      && timestamp - this.outputSpeechStartedAt < this.bargeInGuardMs
    ) {
      this.voiceFrames = 0;
      return false;
    }

    const outputRms = myraaOutputActive ? this.readOutputRms() : 0;
    // Keep the local gate sensitive to ordinary speech volume rather than only
    // loud bursts. A room baseline that is slightly below the user’s voice must
    // not block the mic from reaching Sara. We still guard against fan/echo
    // noise by scaling from the learned floor and capping the final threshold.
    const ambientThreshold = Math.min(
      0.065,
      Math.max(this.voiceThreshold * 0.75, this.noiseFloorRms * 1.6 + 0.008),
    );
    const threshold = myraaOutputActive
      ? Math.max(this.bargeInVoiceThreshold, ambientThreshold, Math.min(0.09, outputRms * 0.38 + 0.012))
      : ambientThreshold;
    const requiredFrames = myraaOutputActive ? this.bargeInStartFrames : this.voiceStartFrames;

    if (rms >= threshold) {
      this.lastVoiceAt = timestamp;
      this.voiceFrames += 1;
      if (!this.userSpeaking && this.voiceFrames >= requiredFrames) {
        const interruptedMyraa = myraaOutputActive;
        this.userSpeaking = true;
        if (interruptedMyraa) {
          this.emitConversationEvent("user_interrupted_myraa", rms);
          this.handleInterruption();
        }
        this.emitConversationEvent("user_started_speaking", rms);
      }
      return this.userSpeaking;
    }

    this.voiceFrames = 0;
    if (this.userSpeaking && timestamp - this.lastVoiceAt >= this.voiceStopDelayMs) {
      this.userSpeaking = false;
      this.emitConversationEvent("user_stopped_speaking", rms);
    }
    // Keep sending microphone PCM whenever Sara is not speaking. Gemini Live
    // performs server-side voice activity detection; making the local VAD a
    // hard gate here can discard quiet/soft-spoken users before Gemini hears
    // them. During Sara's playback, only locally detected barge-in audio is
    // forwarded so background noise does not cut her off.
    return !myraaOutputActive || this.userSpeaking;
  }

  private readOutputRms(): number {
    if (!this.outputAnalyser) return 0;
    const samples = new Uint8Array(this.outputAnalyser.fftSize);
    this.outputAnalyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      const normalized = (samples[i] - 128) / 128;
      energy += normalized * normalized;
    }
    return Math.sqrt(energy / Math.max(1, samples.length));
  }

  private emitConversationEvent(event: string, rms?: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "conversationEvent", event, rms }));
  }

  // Direct raw PCM chunk scheduled playback at 24kHz
  private playAudioPCMChunk(base64Audio: string) {
    if (!this.outputAudioCtx || !this.outputGainNode) return;

    try {
      if (this.currentState !== "speaking" || this.activeSources.length === 0) {
        this.outputSpeechStartedAt = performance.now();
      }
      this.setState("speaking");
      const uint8Array = base64ToUint8Array(base64Audio);
      const raw = pcm16ToFloats(uint8Array);
      const floats = this.pitchShifter ? this.pitchShifter.process(raw) : raw;

      // Create AudioBuffer of 24000Hz (the exact playback sample rate of Gemini outputs)
      const buffer = this.outputAudioCtx.createBuffer(1, floats.length, 24000);
      buffer.getChannelData(0).set(floats);

      // Create Buffer source
      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = buffer;

      // Connect source to gain which is routed to analyser & speakers
      source.connect(this.outputGainNode);

      const currentTime = this.outputAudioCtx.currentTime;
      
      // Gapless scheduler sync
      if (this.nextStartTime < currentTime) {
        // Start fresh: 30ms ahead to bridge schedule timing
        this.nextStartTime = currentTime + 0.03;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;

      // Keep reference to handle real-time interruptions
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
        
        // If there are no more active play nodes, revert state back to listening
        if (this.activeSources.length === 0 && this.currentState === "speaking") {
          this.outputSpeechStartedAt = 0;
          this.setState("listening");
        }
      };

      this.activeSources.push(source);

    } catch (playbackError) {
      console.error("PCM Chunk buffering/playback failed:", playbackError);
    }
  }

  // Fully cleanup and release microphones & connection sockets
  public disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isActivated = false;
    this.liveReady = false;
    this.outputReady = false;
    this.setState("disconnected");

    // Close WS socket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }

    // Stop and release user microphone streams
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      this.micStream = null;
    }

    // Disconnect routing nodes
    if (this.micProcessorNode) {
      try {
        this.micProcessorNode.disconnect();
      } catch (e) {}
      this.micProcessorNode = null;
    }

    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
    }

    // Close Audio contexts
    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
      } catch (e) {}
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
      } catch (e) {}
      this.outputAudioCtx = null;
    }

    this.activeSources = [];
    this.nextStartTime = 0;
    this.userSpeaking = false;
    this.listeningPaused = false;
    this.voiceFrames = 0;
    this.lastVoiceAt = 0;
    this.outputSpeechStartedAt = 0;
    this.pendingTextMessages = [];
    this.inputAnalyser = null;
    this.outputAnalyser = null;
    this.outputGainNode = null;
  }
}

