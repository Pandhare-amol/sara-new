import { useState, useEffect, useRef, lazy, Suspense, type FormEvent } from "react";
import { SaraAudioSession, LiveState, type AudioDiagnostics, type LiveToolTaskProgress } from "./lib/saraAudio";
import { SaraCoreVisualizer, type SaraEmotion } from "./components/SaraCoreVisualizer";
import { CharacterStudio } from "./components/character/CharacterStudio";
import { 
  Power, 
  Volume2, 
  VolumeX,
  Info, 
  Sparkles, 
  MessageSquareOff, 
  Compass, 
  CircleAlert,
  MicOff,
  Mic,
  X,
  Brain,
  Monitor,
  Camera,
  Play,
  Pause,
  Square,
  RefreshCw,
  Settings as SettingsIcon,
  Send
  ,Activity
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Memory, MemoryCategory } from "./lib/memoryTypes";
import { MemoryDashboard } from "./components/MemoryDashboard";
const SystemDashboard = lazy(() => import("./components/SystemDashboard").then((module) => ({ default: module.SystemDashboard })));
import { SettingsPanel, type SettingsSection } from "./components/SettingsPanel";
import { TaskHud } from "./components/TaskHud";
import { LiveToolTaskHud } from "./components/LiveToolTaskHud";
import { ModelChip } from "./components/ModelSelector";
import { Onboarding } from "./components/Onboarding";
import { api, type AppSettings, type AppSettingsPatch } from "./lib/appApi";
import { useAppEvents } from "./lib/useAppEvents";
import { setCharacterRealism } from "./character/materials/AnimeMaterial";
import { SaraSettings, DEFAULT_SETTINGS, loadSettings, saveSettings } from "./lib/saraSettingsStore";
import { SaraWakeWordDetector } from "./lib/saraWakeWord";

export default function App() {
  const [state, setState] = useState<LiveState>("disconnected");

  // Real-time Screen Sharing states
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isScreenSharingPaused, setIsScreenSharingPaused] = useState<boolean>(false);
  const [screenVisionMode, setScreenVisionMode] = useState<boolean>(true);
  const [showScreenSourcePicker, setShowScreenSourcePicker] = useState(false);
  const [screenSources, setScreenSources] = useState<Array<{ id: string; name: string; thumbnail?: string | null; display_id?: string | null }>>([]);
  const [screenMetrics, setScreenMetrics] = useState({ captured: 0, sent: 0, skipped: 0, dropped: 0, lastFrameAt: 0 });
  // On-demand screen-vision lifecycle (e.g. "what is on my screen?"). Distinct
  // from the manual SHARE SCREEN flow — this is Sara briefly peeking.
  const [screenVisionLiveState, setScreenVisionLiveState] = useState<"idle" | "capturing" | "ready" | "error">("idle");

  // The live user-approved stream comes from Electron getDisplayMedia;
  // Python screenshots remain a separate on-demand fallback only.
  const [screenPreviewUrl, setScreenPreviewUrl] = useState<string | null>(null);
  const isScreenSharingRef = useRef(false);
  const screenCaptureInFlightRef = useRef(false);
  const screenStartInFlightRef = useRef(false);
  const autoResumeAttemptedRef = useRef(false);
  const screenCaptureGenerationRef = useRef(0);
  const screenIntervalRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenDiffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScreenLumaRef = useRef<Uint8Array | null>(null);
  const lastScreenSentAtRef = useRef(0);

  const setNativeCaptureActive = (active: boolean) => {
    const bridgeWindow = window as unknown as {
      sara?: { setDesktopCaptureActive?: (value: boolean) => unknown };
      myraa?: { setDesktopCaptureActive?: (value: boolean) => unknown };
    };
    try { (bridgeWindow.sara ?? bridgeWindow.myraa)?.setDesktopCaptureActive?.(active); } catch { /* best effort */ }
  };

  const isPausedRef = useRef<boolean>(false);
  const screenVisionRef = useRef<boolean>(true);
  const stateRef = useRef<LiveState>("disconnected");

  // Sync state changes with refs to totally prevent stale closures in callbacks
  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    isPausedRef.current = isScreenSharingPaused;
  }, [isScreenSharingPaused]);

  useEffect(() => {
    screenVisionRef.current = screenVisionMode;
  }, [screenVisionMode]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clean up streaming intervals on unmount
  useEffect(() => {
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
      }
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
      sessionRef.current?.sendScreenSharingStopped();
      setNativeCaptureActive(false);
    };
  }, []);

  const captureFrameAndSend = async (force = false) => {
    if ((!isScreenSharingRef.current && !force) || isPausedRef.current || !screenVisionRef.current || screenCaptureInFlightRef.current) return;

    const generation = screenCaptureGenerationRef.current;
    screenCaptureInFlightRef.current = true;
    try {
      const video = screenVideoRef.current;
      const session = sessionRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = screenCanvasRef.current || document.createElement("canvas");
        screenCanvasRef.current = canvas;
        const maxDim = 1440;
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Screen canvas is unavailable.");
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Cheap local change detection prevents unchanged frames from
        // reaching Gemini. The full frame is still retained for the preview.
        const diffCanvas = screenDiffCanvasRef.current || document.createElement("canvas");
        screenDiffCanvasRef.current = diffCanvas;
        diffCanvas.width = 64;
        diffCanvas.height = 36;
        const diffContext = diffCanvas.getContext("2d", { willReadFrequently: true });
        if (!diffContext) throw new Error("Screen change detector is unavailable.");
        diffContext.drawImage(video, 0, 0, 64, 36);
        const pixels = diffContext.getImageData(0, 0, 64, 36).data;
        const luma = new Uint8Array(64 * 36);
        let totalDelta = 0;
        for (let i = 0; i < luma.length; i++) {
          const offset = i * 4;
          luma[i] = Math.round(pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722);
          if (lastScreenLumaRef.current) totalDelta += Math.abs(luma[i] - lastScreenLumaRef.current[i]);
        }
        const changeScore = lastScreenLumaRef.current ? totalDelta / luma.length : 100;
        const heartbeat = Date.now() - lastScreenSentAtRef.current >= 10_000;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
        if (generation !== screenCaptureGenerationRef.current || !screenStreamRef.current) return;
        setScreenPreviewUrl(dataUrl);
        const capturedAt = Date.now();
        setScreenMetrics((current) => ({ ...current, captured: current.captured + 1, lastFrameAt: capturedAt }));
        if (lastScreenLumaRef.current && changeScore < 1.2 && !heartbeat) {
          setScreenMetrics((current) => ({ ...current, skipped: current.skipped + 1 }));
          return;
        }
        lastScreenLumaRef.current = luma;
        lastScreenSentAtRef.current = Date.now();
        const image = dataUrl.slice(dataUrl.indexOf(",") + 1);
        if (!session || !session.sendVideoFrame(image, {
          changeScore, heartbeat, width: canvas.width, height: canvas.height, capturedAt,
        })) {
          setScreenMetrics((current) => ({ ...current, dropped: current.dropped + 1 }));
        } else {
          setScreenMetrics((current) => ({ ...current, sent: current.sent + 1 }));
        }
        return;
      }

      // An active native stream is the source of truth. Do not fall back to a
      // different full-display screenshot if its video track is not ready.
      if (screenStreamRef.current) return;

      // Fallback for a browser/dev environment or a denied native stream.
      const response = await fetch("/api/screen-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_dim: 720, keep_file: false }),
        cache: "no-store",
      });
      const payload = await response.json() as {
        ok?: boolean;
        image_base64?: string;
        image_mime?: string;
        error?: string;
      };
      if (generation !== screenCaptureGenerationRef.current || !isScreenSharingRef.current) return;
      if (!response.ok || payload.ok === false || !payload.image_base64) {
        throw new Error(payload.error || `Screen capture failed (${response.status}).`);
      }
        setScreenPreviewUrl(`data:${payload.image_mime || "image/jpeg"};base64,${payload.image_base64}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[Screen Capture] Snapshot failed:", message);
      setErrorText(`Could not capture screen: ${message}`);
    } finally {
      screenCaptureInFlightRef.current = false;
    }
  };

  const openScreenSourcePicker = async () => {
    setErrorText(null);
    try {
      const desktopWindow = window as unknown as { sara?: {
        getDesktopCaptureSources?: () => Promise<Array<{ id: string; name: string; display_id?: string | null }>>;
        setDesktopCaptureSource?: (id: string) => unknown;
        setDesktopCaptureActive?: (active: boolean) => unknown;
      }; myraa?: {
        getDesktopCaptureSources?: () => Promise<Array<{ id: string; name: string; display_id?: string | null }>>;
        setDesktopCaptureSource?: (id: string) => unknown;
        setDesktopCaptureActive?: (active: boolean) => unknown;
      } };
      const desktop = desktopWindow.sara ?? desktopWindow.myraa;
      if (desktop?.getDesktopCaptureSources && desktop.setDesktopCaptureSource) {
        const sources = await desktop.getDesktopCaptureSources();
        if (sources.length) {
          setScreenSources(sources);
          setShowScreenSourcePicker(true);
          return;
        }
      }
      // Browser/dev build: getDisplayMedia must be invoked directly from the
      // user's click so the browser's native picker can retain user activation.
      await startScreenSharing();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(`Could not list screen sources: ${message}`);
    }
  };

  async function startScreenSharing(sourceId?: string, autoResume = false) {
    if (screenStartInFlightRef.current || screenStreamRef.current) return;
    screenStartInFlightRef.current = true;
    setErrorText(null);
    try {
      const desktopWindow = window as unknown as { sara?: {
        setDesktopCaptureSource?: (id: string) => unknown;
      }; myraa?: { setDesktopCaptureSource?: (id: string) => unknown } };
      const desktop = desktopWindow.sara ?? desktopWindow.myraa;
      if (sourceId && desktop?.setDesktopCaptureSource) desktop.setDesktopCaptureSource(sourceId);
      if (sourceId && !autoResume) window.localStorage.setItem("sara.screen.source.v1", sourceId);

      // Invoke capture before the first await in this user-gesture handler.
      const captureRequest = navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 1, max: 1 } },
        audio: false,
      });
      const stream = await captureRequest;
      screenCaptureGenerationRef.current += 1;
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((item) => item.stop());
        throw new Error("No screen video track was returned.");
      }
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      screenStreamRef.current = stream;
      screenVideoRef.current = video;
      setNativeCaptureActive(true);
      track.onended = () => stopScreenSharing();
      setScreenMetrics({ captured: 0, sent: 0, skipped: 0, dropped: 0, lastFrameAt: 0 });
      isScreenSharingRef.current = true;
      isPausedRef.current = false;
      setIsScreenSharing(true);
      setIsScreenSharingPaused(false);
      setShowScreenSourcePicker(false);
      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = setInterval(() => { void captureFrameAndSend(); }, 1_000);
      void captureFrameAndSend(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (autoResume) {
        setErrorText("Saved screen source could not be resumed. Choose it again from Share Screen.");
        autoResumeAttemptedRef.current = false;
      } else if (!/cancel|denied|notallowed/i.test(message)) setErrorText(`Could not start native screen sharing: ${message}`);
    } finally {
      screenStartInFlightRef.current = false;
    }
  }

  const stopScreenSharing = () => {
    screenCaptureGenerationRef.current += 1;
    screenCaptureInFlightRef.current = false;
    isScreenSharingRef.current = false;
    isPausedRef.current = false;
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }

    setIsScreenSharing(false);
    setIsScreenSharingPaused(false);
    setScreenPreviewUrl(null);
    sessionRef.current?.sendScreenSharingStopped();
    setNativeCaptureActive(false);
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    screenVideoRef.current = null;
    setShowScreenSourcePicker(false);
    lastScreenLumaRef.current = null;
    lastScreenSentAtRef.current = 0;
  };

  const pauseScreenSharing = () => {
    isPausedRef.current = true;
    setIsScreenSharingPaused(true);
  };

  const resumeScreenSharing = () => {
    isPausedRef.current = false;
    setIsScreenSharingPaused(false);
    void captureFrameAndSend();
  };

  const switchScreenShare = async () => {
    stopScreenSharing();
    await openScreenSourcePicker();
  };

  const askCameraAboutScene = async () => {
    const session = sessionRef.current;
    if (!session || !appSettings?.privacy.cameraPresence) {
      setErrorText("Enable camera access in Settings → Privacy first.");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
      if (!image || !session.sendCameraFrame(image)) throw new Error("Sara is not connected to the visual session.");
      setScreenVisionLiveState("capturing");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/cancel|denied|notallowed/i.test(message)) setErrorText(`Camera question failed: ${message}`);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  const [activeEmotion, setActiveEmotion] = useState<SaraEmotion>("idle");
  const [themeColor, setThemeColor] = useState<string>("charcoal");
  const [userCaption, setUserCaption] = useState<string>("");
  const [liveToolTasks, setLiveToolTasks] = useState<LiveToolTaskProgress[]>([]);
  const [audioDiagnostics, setAudioDiagnostics] = useState<AudioDiagnostics | null>(null);
  const [listeningPaused, setListeningPaused] = useState(false);
  const [speechMuted, setSpeechMuted] = useState(false);
  const [characterState, setCharacterState] = useState<"idle" | "thinking" | "talking" | "listening" | "speaking">("idle");
  // Which character Sara appears as (built-in or locally imported), and the studio.
  const [activeCharacterId, setActiveCharacterId] = useState<string | undefined>(undefined);
  const [showStudio, setShowStudio] = useState(false);

  // Server-side settings (agent, presence, companion, onboarding…) and live runtime events.
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (!appSettings?.privacy.screenAutoResume || !appSettings.privacy.screenAwareness || autoResumeAttemptedRef.current || screenStreamRef.current) return;
    const rememberedSource = window.localStorage.getItem("sara.screen.source.v1");
    if (!rememberedSource) return;
    autoResumeAttemptedRef.current = true;
    void startScreenSharing(rememberedSource, true);
  }, [appSettings?.privacy.screenAutoResume, appSettings?.privacy.screenAwareness, state]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const events = useAppEvents();
  const reloadAppSettings = () =>
    api.appSettings()
      .then((s) => {
        setAppSettings(s);
        setActiveCharacterId(s.character?.activeCharacterId || undefined);
        return s;
      })
      .catch(() => null);
  useEffect(() => {
    void reloadAppSettings().then((s) => {
      if (s && !s.onboardingComplete) setShowOnboarding(true);
    });
    const bridgeWindow = window as unknown as {
      sara?: { onOpenStudio?: (cb: () => void) => () => void };
      myraa?: { onOpenStudio?: (cb: () => void) => () => void };
    };
    const bridge = bridgeWindow.sara ?? bridgeWindow.myraa;
    return bridge?.onOpenStudio?.(() => setShowStudio(true));
  }, []);
  // Realism and cloth settings apply live to the character in this window.
  const realism = appSettings?.graphics?.realism;
  useEffect(() => {
    if (typeof realism === "number") setCharacterRealism(realism);
  }, [realism]);
  const clothEnabled = appSettings?.physics?.clothEnabled;
  const clothLooseness = appSettings?.physics?.clothLooseness;
  useEffect(() => {
    if (!appSettings) return;
    window.dispatchEvent(new CustomEvent("sara:app-settings", { detail: appSettings }));
    window.dispatchEvent(new CustomEvent("myraa:app-settings", { detail: appSettings }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clothEnabled, clothLooseness]);
  const handleAppSettingsChange = (patch: AppSettingsPatch) => {
    // Optimistic shallow-per-section merge so toggles respond instantly; the
    // server's validated copy replaces it a moment later.
    setAppSettings((current) => {
      if (!current) return current;
      const next = { ...current } as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        const base = (current as unknown as Record<string, unknown>)[key];
        next[key] = value && typeof value === "object" && base && typeof base === "object" ? { ...(base as object), ...(value as object) } : value;
      }
      return next as unknown as AppSettings;
    });
    void api.updateAppSettings(patch).then(setAppSettings).catch((error) => {
      setErrorText(error instanceof Error ? error.message : "Could not save the setting.");
      void reloadAppSettings();
    });
  };

  const detectEmotionFromText = (text: string): SaraEmotion => {
    const lower = text.toLowerCase();
    if (lower.includes("haha") || lower.includes("lol") || lower.includes("funny") || lower.includes("joke") || lower.includes("hehe") || lower.includes("wink")) return "playful";
    if (lower.includes("happy") || lower.includes("harmony") || lower.includes("glad") || lower.includes("joy") || lower.includes("wonderful") || lower.includes("love") || lower.includes("smile")) return "happy";
    if (lower.includes("wow") || lower.includes("awesome") || lower.includes("excited") || lower.includes("amazing") || lower.includes("yay") || lower.includes("incredible") || lower.includes("hype")) return "excited";
    if (lower.includes("really?") || lower.includes("curious") || lower.includes("interest") || lower.includes("tell me more") || lower.includes("why") || lower.includes("how") || lower.includes("wonder")) return "curious";
    if (lower.includes("think") || lower.includes("calculat") || lower.includes("analyz") || lower.includes("hmmm") || lower.includes("process") || lower.includes("let me see") || lower.includes("conclude")) return "thinking";
    if (lower.includes("proud") || lower.includes("achieved") || lower.includes("expert") || lower.includes("skill") || lower.includes("confidence") || lower.includes("succeed")) return "proud";
    if (lower.includes("sad") || lower.includes("sorry") || lower.includes("unfortunate") || lower.includes("grief") || lower.includes("bad") || lower.includes("regret") || lower.includes("alas") || lower.includes("cry")) return "sad";
    if (lower.includes("shock") || lower.includes("surprise") || lower.includes("gasp") || lower.includes("unexpected") || lower.includes("seriously") || lower.includes("oh my")) return "surprised";
    if (lower.includes("blush") || lower.includes("shy") || lower.includes("embarrass") || lower.includes("nervous") || lower.includes("oops") || lower.includes("sorry about")) return "embarrassed";
    if (lower.includes("what?") || lower.includes("confus") || lower.includes("puzzled") || lower.includes("dont know") || lower.includes("not sure") || lower.includes("wait")) return "confused";
    return "idle";
  };
  const [modelCaption, setModelCaption] = useState<string>("");
  useEffect(() => {
    if (!modelCaption || state === "speaking") return;
    const timer = window.setTimeout(() => setModelCaption(""), 4500);
    return () => window.clearTimeout(timer);
  }, [modelCaption, state]);
  const [textMessage, setTextMessage] = useState<string>("");
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Myraa recollections database core state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [showMemoryDashboard, setShowMemoryDashboard] = useState<boolean>(false);
  const [showSystemDashboard, setShowSystemDashboard] = useState<boolean>(false);

  // V2: Settings + wake word state
  const [settings, setSettings] = useState<SaraSettings>(() => loadSettings());
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const openSettings = (section: SettingsSection = "general") => {
    setSettingsSection(section);
    setShowSettings(true);
  };
  const showSettingsRef = useRef<boolean>(false);
  useEffect(() => { showSettingsRef.current = showSettings; }, [showSettings]);

  // V2: Wake word detector instance (Web Speech API, lives for the app lifetime)
  const wakeDetectorRef = useRef<SaraWakeWordDetector | null>(null);
  // Ref indirection so the wake-word callback always calls the latest connect
  // handler, regardless of where it's declared in the component body.
  const connectHandlerRef = useRef<() => void>(() => {});

  // Initialize wake detector once on mount.
  useEffect(() => {
    const det = new SaraWakeWordDetector();
    wakeDetectorRef.current = det;
    return () => {
      det.stop();
    };
  }, []);

  // Start / stop wake word detection when the setting changes.
  useEffect(() => {
    const det = wakeDetectorRef.current;
    if (!det) return;
    if (settings.wakeWordEnabled && state === "disconnected") {
      det.start({
        phrase: settings.wakePhrase,
        sensitivity: settings.sensitivity,
        onTriggered: () => {
          // When wake word fires, stop detector and connect MYRAA.
          det.stop();
          connectHandlerRef.current();
        },
      });
    } else {
      det.stop();
    }
  }, [settings.wakeWordEnabled, settings.wakePhrase, settings.sensitivity, state]);

  // Handle settings changes: persist to localStorage + update state.
  const handleSettingsChange = (patch: Partial<SaraSettings>) => {
    const next = saveSettings(patch);
    setSettings(next);
  };

  const sessionRef = useRef<SaraAudioSession | null>(null);
  // State mirrors the ref so the 3D renderer receives new audio analysers immediately.
  const [audioSession, setAudioSession] = useState<SaraAudioSession | null>(null);

  useEffect(() => {
    const update = () => setAudioDiagnostics(sessionRef.current?.getDiagnostics() ?? null);
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep barge-in preference live while connected; changing it must not drop
  // the microphone or the current background tasks.
  useEffect(() => {
    if (appSettings) sessionRef.current?.setBargeInEnabled(appSettings.voice.bargeIn);
  }, [appSettings?.voice.bargeIn]);

  // Fetch initial recollections from backend database
  useEffect(() => {
    fetch("/api/memories")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMemories(data);
        }
      })
      .catch(err => console.error("Initial persistent recollections load failure:", err));
  }, []);

  const handleAddManualMemory = async (category: MemoryCategory, text: string) => {
    try {
      const resp = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, text })
      });
      const saved = await resp.json();
      if (saved && saved.id) {
        setMemories((prev) => [...prev, saved]);
      }
    } catch (err) {
      console.error("Manual database recollect upload error:", err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      const resp = await fetch(`/api/memories/${id}`, {
        method: "DELETE"
      });
      const resObj = await resp.json();
      if (resObj && resObj.success) {
        setMemories((prev) => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.error("Manual memory delete execution failed:", err);
    }
  };

  // Initialize the audio session handlers once on mount
  useEffect(() => {
    const session = new SaraAudioSession({
      onStateChange: (newState) => {
        setState(newState);
        if (newState === "disconnected") {
          setListeningPaused(false);
          // Reset captions on disconnect
          setUserCaption("");
          setModelCaption("");
          setActiveEmotion("idle");
          setCharacterState("idle");
        } else if (newState === "listening") {
          // Keep the companion in a receptive idle pose while the user is speaking.
          setActiveEmotion("idle");
          setCharacterState("listening");
        } else if (newState === "speaking") {
          setCharacterState("speaking");
        }
      },
      onTranscription: (role, text) => {
        if (role === "user") {
          setUserCaption(text);
          // Auto-clear the other caption when user starts talking
          setModelCaption("");
          setCharacterState("thinking");
        } else if (role === "model") {
          setModelCaption((prev) => {
            const next = prev + text;
            const newEmotion = detectEmotionFromText(next);
            setActiveEmotion(newEmotion);
            return next;
          });
          // Clear user caption when model replies
          setUserCaption("");
        }
      },
      onToolCall: (name, args, callback) => {
        console.log(`[App] Tool call triggered: ${name}`, args);
        
        if (name === "changeBackground") {
          const colorName = args.color?.toLowerCase();
          const validColors = ["violet", "crimson", "emerald", "celestial", "gold", "rose", "charcoal"];
          
          if (colorName && validColors.includes(colorName)) {
            setThemeColor(colorName);
            callback({ result: `Successfully shifted aesthetic atmosphere to ${colorName}.` });
          } else {
            callback({ error: `Unsupported color '${colorName}'. Supported themes are: ${validColors.join(", ")}` });
          }
        } else {
          callback({ error: `Tool ${name} is not implemented.` });
        }
      },
      onError: (err) => {
        setErrorText(err);
      },
      onMemorySync: (updatedMemories) => {
        console.log("[App] WebSocket memories sync triggered:", updatedMemories);
        if (Array.isArray(updatedMemories)) {
          setMemories(updatedMemories);
        }
      },
      onTaskProgress: (task) => {
        setLiveToolTasks((current) => [...current.filter((item) => item.taskId !== task.taskId), task].slice(-20));
      },
      onScreenVisionState: (visionState, info) => {
        setScreenVisionLiveState(visionState);
        if (info?.error) {
          setErrorText(`Sara couldn't see your screen: ${info.error}`);
        } else if (visionState === "ready" && info?.activeWindow) {
          console.log(`[ScreenVision] Looking at: ${info.activeWindow}`);
        }
      }
    });
    sessionRef.current = session;
    setAudioSession(session);
    // Keep the established normal-app launch behavior. A native-host view is
    // separate from Electron and must not silently open a second microphone
    // session; its existing visible voice controls still use this same session.
    const appMode = new URLSearchParams(location.search).get("mode");
    const hostOwnsVoice = appMode === "native-host" || appMode === "desktop-host-owner";
    if (!hostOwnsVoice) {
      void session.connect().catch((error) => {
        setErrorText(error instanceof Error ? error.message : "Sara could not start the microphone.");
      });
    }

    return () => {
      session.disconnect();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const bridgeWindow = window as unknown as {
      sara?: { onDesktopHostMode?: (callback: (enabled: boolean) => void) => () => void };
      myraa?: { onDesktopHostMode?: (callback: (enabled: boolean) => void) => () => void };
    };
    const bridge = bridgeWindow.sara ?? bridgeWindow.myraa;
    return bridge?.onDesktopHostMode?.((enabled) => {
      if (enabled) sessionRef.current?.disconnect();
    });
  }, []);

  useEffect(() => {
    if (new URLSearchParams(location.search).get("mode") !== "native-host") return;
    const hostWindow = window as unknown as {
      saraDesktopHost?: { onMessage?: (callback: (message: { type?: string }) => void) => () => void };
    };
    return hostWindow.saraDesktopHost?.onMessage?.((message) => {
      if (message.type === "voice.activate" && stateRef.current === "disconnected") {
        connectHandlerRef.current();
      } else if (message.type === "emergency.stop") {
        void api.emergencyStop().catch((error) => setErrorText(error instanceof Error ? error.message : "Emergency stop request failed."));
      }
      if (["host.ready", "monitor.changed", "companion.visibility", "backend.status", "shutdown"].includes(String(message.type))) {
        window.dispatchEvent(new CustomEvent("sara:native-host", { detail: message }));
      }
    });
  }, []);

  const handleToggleConnection = async () => {
    setErrorText(null);
    if (!sessionRef.current) return;

    if (state === "disconnected") {
      await sessionRef.current.connect();
    } else {
      sessionRef.current.disconnect();
    }
  };

  const handleSendText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = textMessage.trim();
    const session = sessionRef.current;
    if (!text || !session) return;

    setErrorText(null);
    setTextMessage("");
    session.sendText(text);
    if (state === "disconnected") {
      await session.connect(false);
    }
  };

  // V2: keep the ref in sync so the wake-word callback calls this exact handler.
  connectHandlerRef.current = handleToggleConnection;

  // Maps theme colors to CSS ambient light spots
  const getAmbientStyles = () => {
    switch (themeColor) {
      case "violet":
        return "from-purple-950/40 via-violet-950/20 to-slate-950";
      case "crimson":
        return "from-red-950/40 via-orange-950/20 to-slate-950";
      case "emerald":
        return "from-emerald-950/40 via-teal-950/20 to-slate-950";
      case "celestial":
        return "from-sky-950/45 via-indigo-950/25 to-slate-950";
      case "gold":
        return "from-amber-950/30 via-yellow-950/15 to-slate-950";
      case "rose":
        return "from-rose-950/40 via-pink-950/20 to-slate-950";
      case "charcoal":
      default:
        return "from-slate-900/50 via-slate-950/30 to-slate-950";
    }
  };

  const getThemeTextGlow = () => {
    switch (themeColor) {
      case "violet": return "text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.5)]";
      case "crimson": return "text-rose-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "emerald": return "text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]";
      case "celestial": return "text-sky-400 drop-shadow-[0_0_12px_rgba(14,165,233,0.5)]";
      case "gold": return "text-amber-400 drop-shadow-[0_0_12px_rgba(245,158,11,0.5)]";
      case "rose": return "text-pink-400 drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]";
      case "charcoal":
      default:
        return "text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.5)]";
    }
  };

  const getOrbRingColor = () => {
    switch (state) {
      case "listening": return "border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.3)] bg-indigo-500/10";
      case "speaking": return "border-purple-500/70 shadow-[0_0_40px_rgba(168,85,247,0.4)] bg-purple-500/10";
      case "connecting": return "border-amber-500/50 animate-pulse bg-amber-500/10";
      case "disconnected":
      default:
        return "border-white/10 hover:border-indigo-500/30 bg-white/5";
    }
  };

  return (
    <div
      id="myraa-holographic-desktop"
      className={`relative w-full h-screen overflow-hidden bg-[#020205] text-white ${getAmbientStyles()} theme-transition flex flex-col justify-between p-6 sm:p-10 select-none`}
    >
      {showStudio && (
        <CharacterStudio
          initialCharacterId={activeCharacterId}
          onClose={() => {
            setShowStudio(false);
            void reloadAppSettings();
          }}
          onActiveCharacterChange={(id) => setActiveCharacterId(id)}
        />
      )}

      {/* Ambient Background Gradients matching Frosted Glass theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-900/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[300px] h-[300px] bg-indigo-800/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Decorative grid pattern background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40" />

      {/* Cinematic command status layer; the existing SARA character remains unchanged. */}
      <div className="absolute top-6 left-6 z-20 hidden md:block rounded-lg border border-cyan-400/20 bg-slate-950/35 px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-cyan-100/70 backdrop-blur-sm">
        <div className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${state === "disconnected" ? "bg-rose-400" : state === "connecting" ? "bg-amber-300 animate-pulse" : "bg-cyan-300"}`} />SARA CORE <span className="text-white/30">//</span> {state.toUpperCase()}</div>
        <div className="mt-1 text-[9px] tracking-[0.14em] text-white/35">VOICE · MEMORY · COMPUTER CONTROL</div>
      </div>

      {/* FULL VIEWPORT HOLOGRAPHIC STAGE: Sara materializes across the entire screen */}
      <div className="absolute inset-0 z-0 pointer-events-auto select-none">
        <SaraCoreVisualizer
          session={audioSession}
          state={state}
          themeColor={themeColor}
          activeEmotion={activeEmotion}
          characterState={characterState}
          reflectionStrength={settings.characterShine / 50}
          characterId={settings.characterAppearance === "spaceship-hologram" ? "sara-spaceship-hologram" : activeCharacterId}
        />
      </div>

      {/* HEADER SECTION - Minimalist typography */}
      <header className="relative z-30 flex items-center justify-between w-full max-w-5xl mx-auto select-none">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-[0.4em] text-white/50 uppercase font-sans">
            Sara
          </span>
          <div className={`w-1.5 h-1.5 rounded-full ${
            state === "listening" || state === "speaking" 
              ? "bg-cyan-400" 
              : "bg-white/10"
          }`} />
        </div>

        <div className="flex items-center gap-5">
          {/* Faint utilities hidden in margin */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Sara themes and info"
          >
            <Compass size={14} />
            <span className="hidden sm:inline">TOPICS</span>
          </button>
          
          <button 
            onClick={() => setShowMemoryDashboard(!showMemoryDashboard)}
            className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer"
            title="Recollections Database"
          >
            <Brain size={14} />
            <span className="hidden sm:inline">RECALLS</span>
          </button>

          <button onClick={() => setShowSystemDashboard(!showSystemDashboard)} className="flex items-center gap-1 opacity-25 hover:opacity-100 text-white transition text-xs font-mono tracking-widest cursor-pointer" title="System evidence dashboard">
            <Activity size={14} /><span className="hidden sm:inline">SYSTEM</span>
          </button>

          {/* Real-time screen sharing toggler button inside Myraa glass style header */}
          <button
            onClick={isScreenSharing ? stopScreenSharing : openScreenSourcePicker}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              isScreenSharing
                ? "text-cyan-400 opacity-100 font-semibold"
                : "opacity-25 hover:opacity-100 text-white"
            }`}
            title="Share Screen with Sara"
          >
            <Monitor size={14} className={isScreenSharing && !isScreenSharingPaused ? "animate-pulse text-cyan-400" : ""} />
            <span>{isScreenSharing ? "SHARING" : "SHARE SCREEN"}</span>
            {screenVisionLiveState === "capturing" && (
              <span
                className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                title="Sara is looking at your screen"
              />
            )}
            {screenVisionLiveState === "ready" && (
              <span
                className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-cyan-400"
                title="Sara just saw your screen"
              />
            )}
            {screenVisionLiveState === "error" && (
              <span
                className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-rose-400"
                title="Could not see your screen"
              />
            )}
          </button>

          <ModelChip selection={events.selection} onOpenKeys={() => openSettings("ai")} />

          {/* V2: Settings toggler button — matches existing faint-to-hover header style */}
          <button
            onClick={() => (showSettings ? setShowSettings(false) : openSettings("general"))}
            className={`flex items-center gap-1.5 transition text-xs font-mono tracking-widest cursor-pointer ${
              showSettings
                ? "text-cyan-400 opacity-100 font-semibold"
                : "opacity-25 hover:opacity-100 text-white"
            }`}
            title="Sara Configuration"
          >
            <SettingsIcon size={14} className={showSettings ? "animate-spin [animation-duration:6s]" : ""} />
            <span>SETTINGS</span>
          </button>
        </div>
      </header>

      {/* CORE AVATAR AND VISUALS */}
      <main className="relative z-10 flex-1 w-full max-w-4xl mx-auto flex flex-col items-center justify-between py-6">
        
        {/* Space Spacer to avoid head area */}
        <div className="h-10 sm:h-20" />

        {/* Cinematic dialogue layer overlay - Smooth, delicate text transitions with soft focus blur */}
        <div id="cinematic-subtitles" className="w-full max-w-3xl flex flex-col items-center justify-center text-center px-6 relative z-25 mt-auto mb-6 pointer-events-none min-h-[6rem]">
          <AnimatePresence mode="wait">
            {(() => {
              const textType = modelCaption 
                ? "model" 
                : userCaption 
                  ? "user" 
                  : "status";

              const activeText = modelCaption 
                ? modelCaption 
                : userCaption 
                  ? userCaption 
                  : state === "listening" 
                    ? "I am listening. Speak freely..." 
                    : state === "connecting" 
                      ? "Materializing presence links..." 
                      : "Connect memory core to awaken my voice.";

              return (
                <motion.div
                  key={textType}
                  initial={{ opacity: 0, y: 15, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -15, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center justify-center w-full"
                >
                  {textType === "model" && (
                    <h2 className="text-xl sm:text-2xl font-light text-white leading-relaxed tracking-wide font-display max-w-2xl drop-shadow-[0_2px_20px_rgba(0,0,0,0.9)]">
                      {activeText}
                    </h2>
                  )}

                  {textType === "user" && (
                    <p className="text-cyan-300 font-mono text-sm sm:text-base tracking-wider flex items-center justify-center gap-2 drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>&ldquo;{activeText}&rdquo;</span>
                    </p>
                  )}

                  {textType === "status" && (
                    <span className="text-xs sm:text-sm uppercase tracking-[0.3em] font-medium text-white/30 font-sans tracking-widest drop-shadow-[0_1px_4px_rgba(0, 0, 0, 0.5)]">
                      {activeText}
                    </span>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>
        </div>

        {/* Interactive suggestions prompt guide */}
        <AnimatePresence>
          {showGuide && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="mt-6 p-5 rounded-2xl border border-white/10 bg-slate-900/85 backdrop-blur-2xl max-w-md text-left w-full absolute z-40 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wide">
                  <Compass size={16} className="text-indigo-400" />
                  <span>PLAYFUL CORE SUGGESTIONS</span>
                </div>
                <button 
                  onClick={() => setShowGuide(false)}
                  className="text-slate-400 hover:text-white transition"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4 font-mono leading-relaxed">
                Sara controls your real Windows apps and default PC browser. Here are useful triggers to try speaking aloud:
              </p>
              <div className="space-y-2 text-xs font-serif italic text-indigo-300">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Sara, change atmosphere of your core to crimson&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Shifts theme color background</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Search YouTube for MrBeast and play the first video&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Uses your real PC browser and mouse</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition cursor-pointer font-sans normal-case text-slate-200">
                  ⚡ &quot;Tell me a witty joke and change background to gold&quot; <span className="text-[10px] font-mono text-indigo-400 block mt-0.5 font-medium">Combines tools & voice</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Banner */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="mt-6 flex items-start gap-3 p-4 rounded-2xl border border-rose-500/20 bg-rose-950/40 backdrop-blur-xl max-w-md w-full text-left"
            >
              <CircleAlert className="text-rose-400 shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-rose-300 font-mono">Core Error Protocol</h4>
                <p className="text-xs text-rose-200 mt-1 leading-relaxed">{errorText}</p>
                <button
                  onClick={() => setErrorText(null)}
                  className="mt-2 text-[10px] font-bold text-rose-400 underline font-mono uppercase"
                >
                  Dismiss Code
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* FOOTER INTERFACE WITH WAVEFORM AND CONTROLS */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto flex flex-col items-center gap-5 mt-auto">
        
        {/* Reliable typed fallback: works even when no microphone is available. */}
        <form
          onSubmit={handleSendText}
          className="flex w-full max-w-xl items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 shadow-lg backdrop-blur-xl"
        >
          <input
            value={textMessage}
            onChange={(event) => setTextMessage(event.target.value)}
            aria-label="Message Sara"
            placeholder="Type a message to Sara..."
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!textMessage.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Send size={16} />
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-wider text-slate-500" aria-label="Sara service status">
          <span className={audioDiagnostics?.microphone === "connected" ? "text-emerald-300" : "text-amber-300"}>Mic: {audioDiagnostics?.microphone ?? "starting"}</span>
          <span className={audioDiagnostics?.voiceConnection === "connected" ? "text-emerald-300" : audioDiagnostics?.voiceConnection === "connecting" ? "text-amber-300" : "text-rose-300"}>Voice: {audioDiagnostics?.voiceConnection ?? "starting"}</span>
          <span className={audioDiagnostics?.playback === "unavailable" ? "text-rose-300" : "text-slate-400"}>Audio: {audioDiagnostics?.playback ?? "starting"}</span>
          {Boolean(audioDiagnostics?.reconnectAttempt) && <span className="text-amber-300">Reconnect {audioDiagnostics?.reconnectAttempt}/5</span>}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const next = !listeningPaused; setListeningPaused(next); sessionRef.current?.setListeningPaused(next); }} disabled={state === "disconnected"} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-300 hover:bg-white/10 disabled:opacity-40" title={listeningPaused ? "Resume microphone" : "Pause microphone"}>
            {listeningPaused ? <Play size={12} /> : <Pause size={12} />} {listeningPaused ? "Resume listening" : "Pause listening"}
          </button>
          <button type="button" onClick={() => { const next = !speechMuted; setSpeechMuted(next); sessionRef.current?.setSpeechMuted(next); }} disabled={state === "disconnected"} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-300 hover:bg-white/10 disabled:opacity-40" title={speechMuted ? "Unmute Sara" : "Mute Sara's speech"}>
            {speechMuted ? <VolumeX size={12} /> : <Volume2 size={12} />} {speechMuted ? "Unmute speech" : "Mute speech"}
          </button>
        </div>

        {/* Dynamic Minimalist Waveform Visualizer */}
        <div className="flex items-center justify-center gap-1 h-8 w-44">
          {[12, 28, 16, 32, 20, 8].map((baseHeight, idx) => {
            let heightFactor = 0.35;
            if (state === "speaking") {
              heightFactor = 0.35 + Math.sin(Date.now() * 0.02 + idx * 0.9) * 0.65;
            } else if (state === "listening") {
              heightFactor = 0.2 + Math.sin(Date.now() * 0.01 + idx * 0.5) * 0.4;
            } else {
              heightFactor = idx % 2 === 0 ? 0.25 : 0.12;
            }
            const calculatedHeight = Math.max(3, baseHeight * heightFactor);

            return (
              <div
                key={idx}
                className={`w-0.5 rounded-full transition-all duration-300 ${
                  state === "speaking" ? "bg-purple-400" : state === "listening" ? "bg-cyan-400" : "bg-white/10"
                }`}
                style={{ height: `${calculatedHeight}px` }}
              />
            );
          })}
        </div>

        {/* Glossy Beautiful Primary Connector Core Node */}
        <div className="flex items-center justify-center relative mb-4">
          <button 
            onClick={handleToggleConnection}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 cursor-pointer ${
              state === "disconnected"
                ? "bg-white/10 hover:bg-white/15 border border-white/15 text-white shadow-[0_0_20px_rgba(255,255,255,0.02)] hover:scale-105 active:scale-95"
                : state === "listening"
                ? "bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/80 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.3)] animate-pulse scale-105"
                : state === "speaking"
                ? "bg-purple-500/90 hover:bg-purple-600 border border-purple-400/95 text-white shadow-[0_0_35px_rgba(168,85,247,0.4)] scale-105"
                : "bg-amber-600 border border-amber-300 text-white animate-spin"
            }`}
            title={state === "disconnected" ? "Awake Sara" : "Sleep core"}
          >
            {state === "disconnected" ? (
              <Power className="opacity-80" size={24} />
            ) : state === "connecting" ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : state === "listening" ? (
              <Mic size={24} className="text-cyan-200" />
            ) : (
              <Volume2 size={24} className="text-white" />
            )}
          </button>

          {/* Quiet error reset anchor */}
          {errorText && (
            <button 
              onClick={() => {
                setErrorText(null);
              }}
              className="absolute right-[-60px] p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition duration-150 cursor-pointer"
              title="Dismiss Error"
            >
              <X size={16} />
            </button>
          )}
        </div>

      </footer>

      <AnimatePresence>
        {showScreenSourcePicker && !isScreenSharing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
            role="dialog" aria-modal="true" aria-labelledby="screen-source-title"
          >
            <motion.div
              initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8, scale: 0.98 }}
              className="w-full max-w-xl rounded-2xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-2xl"
            >
              <div className="mb-1 flex items-center gap-2 text-cyan-300">
                <Monitor size={17} />
                <h2 id="screen-source-title" className="font-mono text-sm tracking-widest">CHOOSE WHAT SARA CAN SEE</h2>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                Sharing starts only after you choose a source. Changed frames may be sent to the connected Gemini session for live understanding. Stop or pause sharing at any time.
              </p>
              <div className="grid max-h-[55vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {screenSources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => void startScreenSharing(source.id)}
                    className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] text-left transition hover:border-cyan-400/50 hover:bg-cyan-400/[0.06]"
                  >
                    {source.thumbnail ? (
                      <img src={source.thumbnail} alt="" className="aspect-video w-full bg-black object-contain" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center bg-black/50 text-slate-500"><Monitor size={28} /></div>
                    )}
                    <span className="block truncate px-3 py-2 text-xs text-slate-200 group-hover:text-cyan-200">{source.name}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setShowScreenSourcePicker(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-300 hover:bg-white/5">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Floating Glassmorphic Screen Sharing Control Hub */}
      <AnimatePresence>
        {isScreenSharing && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.85, x: 50 }}
            className={`absolute bottom-6 md:bottom-10 right-6 md:right-10 z-50 w-72 p-4 rounded-2xl border ${
              isScreenSharingPaused 
                ? "border-amber-500/20 bg-slate-950/70" 
                : "border-cyan-500/20 bg-slate-950/70"
            } backdrop-blur-2xl shadow-2xl overflow-hidden`}
          >
            {/* Header / Indicator */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isScreenSharingPaused ? "bg-amber-400" : "bg-cyan-400 animate-pulse"}`} />
                <span className="text-[10px] font-bold font-mono tracking-widest text-slate-200">
                  {isScreenSharingPaused ? "SCREEN VISION PAUSED" : "SCREEN VISION ACTIVE"}
                </span>
              </div>
              <button 
                onClick={stopScreenSharing}
                className="text-slate-400 hover:text-white transition-colors duration-150 p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                title="Stop Sharing"
              >
                <X size={14} />
              </button>
            </div>

            {/* Smart Video PIP Preview Holder */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 border border-white/5 mb-3 flex items-center justify-center group select-none">
              {screenPreviewUrl ? (
                <img
                  src={screenPreviewUrl}
                  alt="Current shared screen"
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    isScreenSharingPaused ? "opacity-30 blur-sm" : "opacity-90"
                  }`}
                />
              ) : (
                <div className="px-4 text-center text-[10px] font-mono text-slate-400">
                  Waiting for the first screen capture…
                </div>
              )}

              {isScreenSharingPaused && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] uppercase tracking-widest font-mono text-amber-400 font-bold px-2 py-1 bg-amber-950/40 border border-amber-500/20 rounded-md">
                    Transmission Paused
                  </span>
                </div>
              )}
              
              {!isScreenSharingPaused && screenVisionMode && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950/50 border border-cyan-400/20 text-[9px] font-mono text-cyan-300">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                  <span>Live capture: up to 1 FPS</span>
                </div>
              )}
            </div>

            <div className="mb-2 text-[9px] font-mono text-slate-400" aria-live="polite">
              Captured {screenMetrics.captured} · sent to Sara {screenMetrics.sent} · unchanged {screenMetrics.skipped} · dropped {screenMetrics.dropped}
              <span className={`ml-1 ${state === "listening" || state === "speaking" ? "text-emerald-300" : "text-amber-300"}`}>
                · Gemini {state === "listening" || state === "speaking" ? "connected" : "not connected"}
              </span>
            </div>

            {/* Quick Action Control Strip */}
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              {isScreenSharingPaused ? (
                <button
                  onClick={resumeScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-xs font-mono font-medium text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Resume Streaming Feed"
                >
                  <Play size={10} />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={pauseScreenSharing}
                  className="flex-1 py-1.5 px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-xs font-mono font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  title="Pause Streaming Feed"
                >
                  <Pause size={10} />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={switchScreenShare}
                className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Choose Another Screen or Window"
              >
                <RefreshCw size={11} />
                <span>Switch</span>
              </button>

              <button
                onClick={() => void askCameraAboutScene()}
                className="py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center gap-1 transition-all cursor-pointer"
                title="Ask Sara about one camera frame"
              >
                <Camera size={11} />
                <span>Camera</span>
              </button>

              <button
                onClick={stopScreenSharing}
                className="py-1.5 px-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-mono text-rose-400 flex items-center justify-center gap-1 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                title="Terminate Stream"
              >
                <Square size={9} />
                <span>Stop</span>
              </button>
            </div>

            {/* Core Mode Configuration Toggle */}
            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-left">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold font-mono text-slate-200">SCREEN VISION MODE</span>
                <span className="text-[8px] text-slate-400 uppercase font-mono max-w-[150px]">Gemini Auto-Analysis</span>
              </div>
              <button
                onClick={() => setScreenVisionMode(!screenVisionMode)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer ${
                  screenVisionMode ? "bg-cyan-500" : "bg-white/10"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-200 ease-in-out ${
                    screenVisionMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recollections sliding core panel */}
      <MemoryDashboard
        isOpen={showMemoryDashboard}
        onClose={() => setShowMemoryDashboard(false)}
        memories={memories}
        onAddMemory={handleAddManualMemory}
        onDeleteMemory={handleDeleteMemory}
        themeColor={themeColor}
      />
      <Suspense fallback={showSystemDashboard ? <div className="absolute inset-y-0 left-0 w-full max-w-lg z-50 bg-[#020206]/95 p-5 text-xs text-slate-400">Loading system dashboard…</div> : null}>
        <SystemDashboard isOpen={showSystemDashboard} onClose={() => setShowSystemDashboard(false)} />
      </Suspense>

      {/* What Sara is doing on the PC, plus approval requests (always shown). */}
      <TaskHud
        events={events}
        showHud={appSettings?.autonomy.showTaskHud ?? true}
        emergencyShortcut={appSettings?.autonomy.emergencyShortcut}
      />
      <LiveToolTaskHud tasks={liveToolTasks} onCancel={(taskId) => {
        if (!sessionRef.current?.cancelToolTask(taskId)) {
          setErrorText("Sara could not reach the active voice connection to cancel that operation.");
          return;
        }
        setLiveToolTasks((current) => current.map((task) => task.taskId === taskId ? { ...task, state: "cancelling", message: "Cancellation requested.", at: Date.now() } : task));
      }} />

      {/* V2: Settings sliding core panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onChange={handleSettingsChange}
        appSettings={appSettings}
        onAppSettingsChange={handleAppSettingsChange}
        initialSection={settingsSection}
        onOpenStudio={() => {
          setShowSettings(false);
          setShowStudio(true);
        }}
        onRestartOnboarding={() => {
          setShowSettings(false);
          setShowOnboarding(true);
        }}
        themeColor={themeColor}
      />

      <AnimatePresence>
        {showOnboarding && appSettings && (
          <Onboarding
            appSettings={appSettings}
            onAppSettingsChange={handleAppSettingsChange}
            settings={settings}
            onChange={handleSettingsChange}
            onActiveCharacterChange={(id) => setActiveCharacterId(id)}
            onFinish={() => setShowOnboarding(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
