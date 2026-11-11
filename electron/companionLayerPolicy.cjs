'use strict';

/** Passive desktop mode must never intercept input intended for desktop icons. */
function shouldIgnoreMouseEvents(settings, interactive) {
  return Boolean(settings?.companion?.desktopLayer) || !interactive;
}

/** Dragging is reserved for the normal interactive companion surface. */
function canBeginDrag(settings) {
  return !Boolean(settings?.companion?.desktopLayer);
}

module.exports = { shouldIgnoreMouseEvents, canBeginDrag };