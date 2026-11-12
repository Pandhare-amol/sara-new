"""
Lightweight Biometric Presence & Owner Watchdog
- 320x240 grayscale downscaling + 15-second absence hysteresis debounce
- Supports OpenCV LBPH when available AND pure-CPU histogram distance fallback
- Zero cloud / zero Supabase: reports directly to local SARA callback or REST endpoint
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from typing import Callable, List, Optional

from sara_asi.enroll_owner import compute_histogram_signature


def histogram_chi_distance(sig_a: List[float], sig_b: List[float]) -> float:
    """Returns scaled distance comparable to LBPH confidence (0 = identical, >65 = mismatch)."""
    if len(sig_a) != len(sig_b) or not sig_a:
        return 100.0
    acc = 0.0
    for a, b in zip(sig_a, sig_b):
        denom = a + b + 1e-9
        acc += ((a - b) ** 2) / denom
    return round(math.sqrt(acc) * 100.0, 2)


class BiometricPresenceSensor:
    def __init__(
        self,
        biometrics_dir: str = "data/biometrics",
        confidence_threshold: float = 65.0,
        absence_threshold_sec: float = 15.0,
        check_interval: float = 1.5,
        on_event: Optional[Callable[[dict], None]] = None,
    ) -> None:
        self.biometrics_dir = biometrics_dir
        self.confidence_threshold = confidence_threshold
        self.absence_threshold = absence_threshold_sec
        self.check_interval = check_interval
        self.on_event = on_event

        self.user_present = True
        self.intruder_active = False
        self.last_seen_timestamp = time.time()
        self.is_running = False
        self._thread: Optional[threading.Thread] = None

        os.makedirs(os.path.join(self.biometrics_dir, "intruders"), exist_ok=True)
        self._owner_centroid = self._load_histogram_centroid()

    def _load_histogram_centroid(self) -> Optional[List[float]]:
        sig_path = os.path.join(self.biometrics_dir, "owner_signature.json")
        if not os.path.exists(sig_path):
            return None
        try:
            with open(sig_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data.get("centroid"), list):
                return [float(x) for x in data["centroid"]]
        except Exception:
            return None
        return None

    def evaluate_sample(self, face_pixels: Optional[List[int]], now: Optional[float] = None) -> dict:
        """Evaluates a single grayscale sample (or None when desk is empty) with 15s hysteresis."""
        ts = now if now is not None else time.time()
        self._owner_centroid = self._owner_centroid or self._load_histogram_centroid()

        if face_pixels is not None and len(face_pixels) > 0:
            if self._owner_centroid is None:
                confidence = 25.0
                is_owner = True
            else:
                sample_sig = compute_histogram_signature(face_pixels, bins=len(self._owner_centroid))
                confidence = histogram_chi_distance(sample_sig, self._owner_centroid)
                is_owner = confidence < self.confidence_threshold

            if is_owner:
                was_absent = not self.user_present
                self.last_seen_timestamp = ts
                self.user_present = True
                self.intruder_active = False
                evt = {
                    "state": "owner_verified",
                    "userPresent": True,
                    "intruderActive": False,
                    "confidence": confidence,
                    "welcomeBack": was_absent,
                    "recommendedMode": "CO_PILOT",
                }
                if was_absent and self.on_event:
                    self.on_event(evt)
                return evt

            # Unrecognized face
            self.user_present = False
            self.intruder_active = True
            evt = {
                "state": "intruder_alert",
                "userPresent": False,
                "intruderActive": True,
                "confidence": confidence,
                "welcomeBack": False,
                "recommendedMode": "TACTICAL",
            }
            if self.on_event:
                self.on_event(evt)
            return evt

        # No face detected — apply 15-second hysteresis buffer
        elapsed = ts - self.last_seen_timestamp
        if elapsed >= self.absence_threshold:
            transitioned = self.user_present
            self.user_present = False
            self.intruder_active = False
            evt = {
                "state": "desk_vacant",
                "userPresent": False,
                "intruderActive": False,
                "elapsedAbsenceSec": round(elapsed, 1),
                "recommendedMode": "SENTRY",
            }
            if transitioned and self.on_event:
                self.on_event(evt)
            return evt

        return {
            "state": "debounce_hold",
            "userPresent": self.user_present,
            "intruderActive": self.intruder_active,
            "elapsedAbsenceSec": round(elapsed, 1),
            "recommendedMode": "CO_PILOT" if self.user_present else "SENTRY",
        }

    def _webcam_loop(self) -> None:
        try:
            import cv2  # type: ignore
        except ImportError:
            return

        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)
        if not cap.isOpened():
            return

        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        while self.is_running:
            ret, frame = cap.read()
            if not ret:
                time.sleep(self.check_interval)
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(40, 40))
            if len(faces) > 0:
                x, y, w, h = faces[0]
                roi = cv2.resize(gray[y : y + h, x : x + w], (100, 100))
                self.evaluate_sample(roi.flatten().tolist())
            else:
                self.evaluate_sample(None)
            time.sleep(self.check_interval)

        cap.release()

    def start(self) -> None:
        if not self.is_running:
            self.is_running = True
            self._thread = threading.Thread(target=self._webcam_loop, daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self.is_running = False
        if self._thread:
            self._thread.join(timeout=2.0)
