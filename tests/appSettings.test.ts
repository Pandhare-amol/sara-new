import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_APP_SETTINGS, normalizeSettings } from "../settings/appSettings";

test("background mode is opt-in and survives app-settings normalization", () => {
  assert.equal(DEFAULT_APP_SETTINGS.autonomy.keepRunningInBackground, false);
  assert.equal(normalizeSettings({ autonomy: { keepRunningInBackground: true } }).autonomy.keepRunningInBackground, true);
  assert.equal(normalizeSettings({ autonomy: { keepRunningInBackground: false } }).autonomy.keepRunningInBackground, false);
  // Older persisted settings remain valid and retain the safe pre-feature behavior.
  assert.equal(normalizeSettings({ autonomy: { showTaskHud: true } }).autonomy.keepRunningInBackground, false);
});

test("global assistant shortcut has a safe default and rejects malformed persisted values", () => {
  assert.equal(DEFAULT_APP_SETTINGS.autonomy.assistantShortcut, "Control+Alt+Space");
  assert.equal(normalizeSettings({ autonomy: { assistantShortcut: "Control+Alt+J" } }).autonomy.assistantShortcut, "Control+Alt+J");
  assert.equal(normalizeSettings({ autonomy: { assistantShortcut: "not a shortcut" } }).autonomy.assistantShortcut, "Control+Alt+Space");
});

test("native desktop host is opt-in and selected monitor input is bounded", () => {
  assert.equal(DEFAULT_APP_SETTINGS.desktopHost.enabled, false);
  assert.deepEqual(DEFAULT_APP_SETTINGS.desktopHost, { enabled: false, monitorDevice: "" });
  assert.deepEqual(normalizeSettings({ desktopHost: { enabled: true, monitorDevice: "\\\\.\\DISPLAY2" } }).desktopHost, { enabled: true, monitorDevice: "\\\\.\\DISPLAY2" });
  assert.equal(normalizeSettings({ desktopHost: { enabled: "yes", monitorDevice: "x".repeat(129) } }).desktopHost.enabled, false);
  assert.equal(normalizeSettings({ desktopHost: { monitorDevice: "x".repeat(129) } }).desktopHost.monitorDevice, "");
});

test("advanced modules are independently disabled by default and safely normalized", () => {
  assert.equal(DEFAULT_APP_SETTINGS.advancedFeatures.skillAcquisition, false);
  assert.equal(DEFAULT_APP_SETTINGS.advancedFeatures.deviceSync, false);
  assert.equal(normalizeSettings({ advancedFeatures: { skillAcquisition: true, deviceSync: true } }).advancedFeatures.skillAcquisition, true);
  assert.equal(normalizeSettings({ advancedFeatures: { skillAcquisition: "yes" } }).advancedFeatures.skillAcquisition, false);
});

test("human-like behavior is opt-in where it changes presentation and bounded safely", () => {
  assert.equal(DEFAULT_APP_SETTINGS.humanLike.observeVerifyActions, true);
  assert.equal(DEFAULT_APP_SETTINGS.humanLike.pauseOnUserInput, true);
  assert.equal(normalizeSettings({ humanLike: { smoothMouseMovement: false, stuckActionLimit: 99 } }).humanLike.smoothMouseMovement, false);
  assert.equal(normalizeSettings({ humanLike: { stuckActionLimit: 99 } }).humanLike.stuckActionLimit, 5);
  assert.equal(normalizeSettings({ humanLike: { stuckActionLimit: 1 } }).humanLike.stuckActionLimit, 2);
  assert.equal(normalizeSettings({ humanLike: { naturalTypingPauses: "yes" } }).humanLike.naturalTypingPauses, false);
});
