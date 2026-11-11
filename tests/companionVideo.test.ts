import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompanionVideoState, resolveCompanionVideo } from "../src/lib/companionVideo";

test("uses the default asset set for the standard companion", () => {
  const idleUrl = resolveCompanionVideo("idle");
  assert.match(idleUrl, /assets\/idle\.mp4$/i);
});

test("switches to the custom girl animation pack for imported companions", () => {
  const talkingUrl = resolveCompanionVideo("talking", "girl");
  assert.match(talkingUrl, /ANIMA%20GIRL%20TAKING\.mp4$/i);
});

test("selects the spaceship hologram idle and talking videos", () => {
  assert.match(resolveCompanionVideo("idle", "sara-spaceship-hologram"), /\/assets\/idle2\.mp4$/i);
  assert.match(resolveCompanionVideo("thinking", "sara-spaceship-hologram"), /\/assets\/idle2\.mp4$/i);
  assert.match(resolveCompanionVideo("talking", "sara-spaceship-hologram"), /\/assets\/talking2\.mp4$/i);
});

test("normalizes live listening and speaking states before selecting video clips", () => {
  assert.equal(normalizeCompanionVideoState("speaking"), "talking");
  assert.equal(normalizeCompanionVideoState("listening"), "listening");
  assert.equal(normalizeCompanionVideoState("thinking"), "thinking");
});

test("falls back to idle when an unknown state is requested", () => {
  const unknownUrl = resolveCompanionVideo("unknown" as never);
  assert.match(unknownUrl, /assets\/idle\.mp4$/i);
});
