import assert from "node:assert/strict";
import test from "node:test";
import { SaraAudioSession } from "../src/lib/saraAudio";

function makeSamplesWithRms(rms: number, length = 1024): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = rms;
  }
  return samples;
}

test("quiet microphone frames reach Gemini without being classified as speech", () => {
  const session = new SaraAudioSession({
    onStateChange() {},
    onTranscription() {},
    onToolCall() {},
    onError() {},
  });

  session["currentState"] = "listening";
  session["userSpeaking"] = false;
  session["voiceFrames"] = 0;
  session["noiseFloorRms"] = 0.015;

  const forwarded = session["updateVoiceActivity"](makeSamplesWithRms(0.004));
  assert.equal(forwarded, true, "quiet frames must reach Gemini's server-side VAD");
  assert.equal(session["userSpeaking"], false, "quiet frames must not trigger local speech events");
});

test("modest human speech is not dropped by the room-noise baseline", () => {
  const session = new SaraAudioSession({
    onStateChange() {},
    onTranscription() {},
    onToolCall() {},
    onError() {},
  });

  session["currentState"] = "listening";
  session["userSpeaking"] = false;
  session["voiceFrames"] = 0;
  session["noiseFloorRms"] = 0.008;

  let detected = false;
  for (let i = 0; i < 8; i += 1) {
    const result = session["updateVoiceActivity"](makeSamplesWithRms(0.024));
    if (result) detected = true;
  }

  assert.equal(detected, true, "a normal speaking volume should pass through the local VAD");
});

test("normal-volume speech interrupts Sara promptly during playback", () => {
  let state = "speaking";
  const session = new SaraAudioSession({
    onStateChange(value) { state = value; },
    onTranscription() {},
    onToolCall() {},
    onError() {},
  });

  session["currentState"] = "speaking";
  session["outputSpeechStartedAt"] = performance.now() - 200;
  session["noiseFloorRms"] = 0.006;
  session["readOutputRms"] = () => 0;

  let forwarded = false;
  for (let i = 0; i < 4; i += 1) {
    forwarded = session["updateVoiceActivity"](makeSamplesWithRms(0.04));
  }

  assert.equal(forwarded, true, "ordinary speech should pass the barge-in gate");
  assert.equal(state, "listening", "playback should be stopped when speech is detected");
  assert.equal(session["userSpeaking"], true);
});

test("the configured barge-in preference is honored without disconnecting", () => {
  const session = new SaraAudioSession({
    onStateChange() {},
    onTranscription() {},
    onToolCall() {},
    onError() {},
  });
  session["currentState"] = "speaking";
  session["outputSpeechStartedAt"] = performance.now() - 2_000;
  session.setBargeInEnabled(false);

  for (let i = 0; i < 12; i += 1) {
    assert.equal(session["updateVoiceActivity"](makeSamplesWithRms(0.1)), false);
  }

  assert.equal(session.getState(), "speaking");
  assert.equal(session["userSpeaking"], false);
});

test("audio diagnostics distinguish disconnected microphone and playback", () => {
  const session = new SaraAudioSession({
    onStateChange() {},
    onTranscription() {},
    onToolCall() {},
    onError() {},
  });
  const diagnostics = session.getDiagnostics();
  assert.equal(diagnostics.state, "disconnected");
  assert.equal(diagnostics.microphone, "unavailable");
  assert.equal(diagnostics.voiceConnection, "disconnected");
  assert.equal(diagnostics.playback, "unavailable");
});

test("pausing listening is independent from the voice connection", () => {
  const session = new SaraAudioSession({ onStateChange() {}, onTranscription() {}, onToolCall() {}, onError() {} });
  session["currentState"] = "listening";
  session["useMicrophone"] = true;
  session["micStream"] = {} as MediaStream;
  session.setListeningPaused(true);
  assert.equal(session.getDiagnostics().microphone, "paused");
  assert.equal(session.getDiagnostics().voiceConnection, "disconnected");
  session.setListeningPaused(false);
  assert.equal(session.getDiagnostics().microphone, "connected");
});
