# auth/session.py
# Shared in-memory session state for the running Nova process. Not persisted
# to disk on purpose — every fresh launch starts locked.

import threading
import time

_lock = threading.Lock()

_state = {
    "authenticated": False,
    "current_user": None,      # username, or None if visitor
    "visitor_mode": False,
    "last_activity": time.time(),
    "unknown_streak": 0,       # consecutive "unknown face" presence samples
    "absence_streak": 0,       # consecutive "no face at all" presence samples
}

# --- tunables ---
IDLE_LOCK_SECONDS = 10 * 60      # re-auth after 10 min with no interaction
ABSENCE_LOCK_SAMPLES = 12        # e.g. 12 samples * 5s poll = ~60s away from the desk
UNKNOWN_FACE_LOCK_SAMPLES = 3    # 3 consecutive unknown-face sightings triggers a lock


def unlock(username: str = None, visitor: bool = False):
    with _lock:
        _state["authenticated"] = True
        _state["current_user"] = username
        _state["visitor_mode"] = visitor
        _state["last_activity"] = time.time()
        _state["unknown_streak"] = 0
        _state["absence_streak"] = 0


def lock(reason: str = "manual"):
    with _lock:
        _state["authenticated"] = False
        _state["current_user"] = None
        _state["visitor_mode"] = False
        _state["last_lock_reason"] = reason


def is_authenticated() -> bool:
    return _state["authenticated"]


def is_visitor() -> bool:
    return _state["visitor_mode"]


def current_user():
    return _state["current_user"]


def touch_activity():
    """Call this whenever the user interacts (voice, text, tool call) to reset the idle clock."""
    with _lock:
        _state["last_activity"] = time.time()


def idle_seconds() -> float:
    return time.time() - _state["last_activity"]


def should_idle_lock() -> bool:
    return _state["authenticated"] and idle_seconds() > IDLE_LOCK_SECONDS


def note_face_presence(matched_username):
    """
    Feed the result of a periodic background presence check.
    matched_username: the recognized user, "UNKNOWN" if a face was seen but
    didn't match anyone, or None if no face was seen at all.
    Returns a string reason if this sample should trigger a lock, else None.
    """
    with _lock:
        if matched_username == "UNKNOWN":
            _state["unknown_streak"] += 1
            _state["absence_streak"] = 0
            if _state["unknown_streak"] >= UNKNOWN_FACE_LOCK_SAMPLES:
                return "unknown_face"
        elif matched_username is None:
            _state["absence_streak"] += 1
            _state["unknown_streak"] = 0
            if _state["absence_streak"] >= ABSENCE_LOCK_SAMPLES:
                return "user_left"
        else:
            _state["unknown_streak"] = 0
            _state["absence_streak"] = 0
        return None
