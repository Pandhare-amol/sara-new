import assert from "node:assert/strict";
import test from "node:test";
import { prepareMediaLearning } from "../mediaLearning";

test("prepares YouTube media for explicit approval without downloading it", () => {
  const draft = prepareMediaLearning({ locator: "https://www.youtube.com/watch?v=abc", title: "Lesson", transcript: "A lesson transcript." });
  assert.equal(draft.source.kind, "web");
  assert.equal(draft.approved, false);
});

test("rejects unsupported or empty media input", () => {
  assert.throws(() => prepareMediaLearning({ locator: "http://example.com/video", transcript: "x" }));
  assert.throws(() => prepareMediaLearning({ locator: "https://youtu.be/x", transcript: "" }));
});

test("normalizes caption timestamps without downloading or executing media", () => {
  const draft = prepareMediaLearning({
    locator: "https://www.youtube.com/watch?v=abc",
    transcript: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nOpen the editor.\n\n[00:04] Save the file.",
  });
  assert.equal(draft.segments.length, 2);
  assert.equal(draft.segments[0].startSeconds, 1);
  assert.equal(draft.segments[0].endSeconds, 3);
  assert.equal(draft.segments[1].startSeconds, 4);
});
