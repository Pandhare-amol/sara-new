"""
Privacy-Preserving Behavioral Cadence & Pattern Helper
- Tracks ONLY cadence timestamps & counts (NEVER logs raw keystroke characters or passwords)
- Persists hourly work-pattern digests strictly to local JSON (zero Supabase)
"""

from __future__ import annotations

import json
import os
import time
from collections import deque
from typing import Callable, Deque, Optional, Tuple


class UserPatternAnalyzer:
    def __init__(
        self,
        local_store_path: str = "data/learning/python_work_patterns.json",
        cooldown_sec: float = 45.0,
        on_pattern: Optional[Callable[[dict], None]] = None,
    ) -> None:
        self.local_store_path = local_store_path
        self.cooldown_sec = cooldown_sec
        self.on_pattern = on_pattern

        self.keystroke_timestamps: Deque[float] = deque()
        self.backspace_timestamps: Deque[float] = deque()
        self.window_switches: Deque[Tuple[float, str]] = deque()
        self.error_snippets: Deque[Tuple[float, str]] = deque()
        self.last_window = ""
        self.last_reaction_time = 0.0

    def record_cadence(
        self,
        key_count: int = 0,
        backspace_count: int = 0,
        active_window: Optional[str] = None,
        clipboard_hint: Optional[str] = None,
        now: Optional[float] = None,
    ) -> Optional[dict]:
        ts = now if now is not None else time.time()
        for _ in range(max(0, int(key_count))):
            self.keystroke_timestamps.append(ts)
        for _ in range(max(0, int(backspace_count))):
            self.backspace_timestamps.append(ts)

        if active_window and active_window != self.last_window:
            self.last_window = active_window
            self.window_switches.append((ts, active_window[:120]))

        if clipboard_hint:
            lowered = clipboard_hint.lower()
            if any(tok in lowered for tok in ("traceback", "error:", "exception", "failed", "undefined", "syntaxerror", "typeerror")):
                self.error_snippets.append((ts, clipboard_hint[:500]))

        self._prune(ts)
        if (ts - self.last_reaction_time) >= self.cooldown_sec:
            return self.evaluate(ts)
        return None

    def _prune(self, now: float, window_sec: float = 60.0) -> None:
        while self.keystroke_timestamps and (now - self.keystroke_timestamps[0]) > window_sec:
            self.keystroke_timestamps.popleft()
        while self.backspace_timestamps and (now - self.backspace_timestamps[0]) > window_sec:
            self.backspace_timestamps.popleft()
        while self.window_switches and (now - self.window_switches[0][0]) > window_sec:
            self.window_switches.popleft()
        while self.error_snippets and (now - self.error_snippets[0][0]) > window_sec:
            self.error_snippets.popleft()

    def evaluate(self, now: Optional[float] = None) -> Optional[dict]:
        ts = now if now is not None else time.time()
        self._prune(ts)
        total_keys = len(self.keystroke_timestamps)
        total_backspaces = len(self.backspace_timestamps)
        switches = len(self.window_switches)

        detected: Optional[dict] = None
        if switches >= 8 and self.error_snippets:
            detected = {
                "pattern": "DEBUG_LOOP",
                "windowSwitchesPerMin": switches,
                "errorSnippet": self.error_snippets[-1][1],
                "activeWindow": self.last_window,
            }
        elif total_keys > 40 and (total_backspaces / max(1, total_keys)) > 0.35:
            detected = {
                "pattern": "FATIGUE_HIGH_CORRECTION",
                "totalKeys": total_keys,
                "backspaceRatio": round(total_backspaces / total_keys, 3),
                "activeWindow": self.last_window,
            }
        elif total_keys == 0 and switches == 0 and self.last_window:
            detected = {
                "pattern": "DEEP_FOCUS",
                "activeWindow": self.last_window,
            }

        if detected:
            self.last_reaction_time = ts
            self._append_local_digest(detected, ts)
            if self.on_pattern:
                self.on_pattern(detected)
        return detected

    def _append_local_digest(self, event: dict, ts: float) -> None:
        os.makedirs(os.path.dirname(self.local_store_path) or ".", exist_ok=True)
        existing = []
        if os.path.exists(self.local_store_path):
            try:
                with open(self.local_store_path, "r", encoding="utf-8") as fh:
                    existing = json.load(fh)
            except Exception:
                existing = []
        existing.append({**event, "timestamp": ts})
        with open(self.local_store_path, "w", encoding="utf-8") as fh:
            json.dump(existing[-200:], fh, indent=2)
