import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { shouldIgnoreMouseEvents, canBeginDrag } = require("../electron/companionLayerPolicy.cjs") as {
  shouldIgnoreMouseEvents: (settings: unknown, interactive: boolean) => boolean;
  canBeginDrag: (settings: unknown) => boolean;
};

test("desktop background layer is always click-through and not draggable", () => {
  const settings = { companion: { desktopLayer: true } };
  assert.equal(shouldIgnoreMouseEvents(settings, false), true);
  assert.equal(shouldIgnoreMouseEvents(settings, true), true);
  assert.equal(canBeginDrag(settings), false);
});

test("normal companion remains interactive and draggable when hit-tested", () => {
  const settings = { companion: { desktopLayer: false } };
  assert.equal(shouldIgnoreMouseEvents(settings, false), true);
  assert.equal(shouldIgnoreMouseEvents(settings, true), false);
  assert.equal(canBeginDrag(settings), true);
});