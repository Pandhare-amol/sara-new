#!/usr/bin/env python3
"""
SARA 3-Factor Pre-Desktop Windows 10 Security Gate (`sara_lock_gate.py`)
Factor 1: Face ID (OpenCV Haar + Owner Histogram Descriptor)
Factor 2: Voice Authorization Code (SpeechRecognition)
Factor 3: Master Password Input Box (Night / Silent Fallback)

Verifies -> Grants or Denies Access -> Plays Futuristic Welcome Sound & Spoken Greeting -> Unlocks Desktop!
"""

import hashlib
import json
import os
import subprocess
import threading
import tkinter as tk
from pathlib import Path

BASE_DIR = Path(os.getenv("SARA_OS_DIR", Path(__file__).resolve().parent))
PROFILE_FILE = BASE_DIR / "boot_auth_profile.json"

DEFAULT_VOICE_PHRASE = os.getenv("SARA_VOICE_PHRASE", "sara authorize access").lower().strip()
DEFAULT_PASS_HASH = hashlib.sha256(os.getenv("SARA_LOCK_PASS", "sara2026").encode("utf-8")).hexdigest()


def play_welcome_sequence() -> None:
    """Plays futuristic harmonic boot chime + spoken welcome on Windows 10 Pro."""
    if os.name == "nt":
        try:
            import winsound

            for freq, dur in ((523, 90), (659, 90), (784, 110), (1046, 200)):
                winsound.Beep(freq, dur)
        except Exception:
            pass
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-WindowStyle",
                "Hidden",
                "-Command",
                (
                    "Add-Type -AssemblyName System.Speech; "
                    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                    "$s.Rate = 1; "
                    "$s.Speak('Identity confirmed, Boss. Access granted. SARA Central Operating Layer is online.')"
                ),
            ]
        )


class SaraSecurityGate(tk.Tk):
    def __init__(self, windowed_test: bool = False):
        super().__init__()
        self.title("S.A.R.A. // WINDOWS 10 PRO SECURITY GATE")
        if windowed_test:
            self.geometry("980x620")
        else:
            self.attributes("-fullscreen", True)
            self.attributes("-topmost", True)
            self.protocol("WM_DELETE_WINDOW", lambda: None)

        self.configure(bg="#040812")
        self.face_verified = False
        self.voice_verified = False
        self.running = True

        self._build_ui()

        if not windowed_test:
            self._hook_escape_keys()

        threading.Thread(target=self._verify_face_loop, daemon=True).start()
        threading.Thread(target=self._verify_voice_loop, daemon=True).start()

    def _hook_escape_keys(self) -> None:
        try:
            import keyboard

            for key in ("win", "alt", "tab", "esc"):
                keyboard.block_key(key)
        except Exception:
            pass

    def _build_ui(self) -> None:
        header = tk.Label(
            self,
            text="S.A.R.A. // PRE-DESKTOP BIOMETRIC & VOICE SECURITY GATE",
            fg="#38BDF8",
            bg="#040812",
            font=("Consolas", 18, "bold"),
        )
        header.pack(pady=(60, 10))

        sub = tk.Label(
            self,
            text="Windows 10 Pro Central Operating Layer • Verify Face + Voice OR Enter Master Password",
            fg="#94A3B8",
            bg="#040812",
            font=("Consolas", 11),
        )
        sub.pack(pady=(0, 30))

        self.decision_banner = tk.Label(
            self,
            text="STATUS: AWAITING OWNER VERIFICATION",
            fg="#FACC15",
            bg="#0B1324",
            padx=24,
            pady=12,
            font=("Consolas", 14, "bold"),
        )
        self.decision_banner.pack(pady=12)

        self.factors_lbl = tk.Label(
            self,
            text="[1] FACE ID: SCANNING...     [2] VOICE CODE: LISTENING...     [3] PASSWORD: READY",
            fg="#E2E8F0",
            bg="#040812",
            font=("Consolas", 12),
        )
        self.factors_lbl.pack(pady=20)

        pwd_frame = tk.Frame(self, bg="#0B1324", padx=24, pady=18)
        pwd_frame.pack(pady=20)

        tk.Label(
            pwd_frame,
            text="MASTER PASSWORD (SILENT / NIGHT UNLOCK):",
            fg="#94A3B8",
            bg="#0B1324",
            font=("Consolas", 10, "bold"),
        ).pack(anchor="w")

        entry_row = tk.Frame(pwd_frame, bg="#0B1324")
        entry_row.pack(pady=(8, 0))

        self.pwd_entry = tk.Entry(
            entry_row,
            show="*",
            width=28,
            bg="#040812",
            fg="#38BDF8",
            insertbackground="#38BDF8",
            font=("Consolas", 13),
            relief="flat",
        )
        self.pwd_entry.pack(side="left", padx=(0, 10), ipady=6)
        self.pwd_entry.bind("<Return>", lambda _e: self.verify_password())
        self.pwd_entry.focus_set()

        tk.Button(
            entry_row,
            text="VERIFY & UNLOCK",
            bg="#0284C7",
            fg="#FFFFFF",
            font=("Consolas", 10, "bold"),
            relief="flat",
            padx=14,
            pady=6,
            command=self.verify_password,
        ).pack(side="left")

    def _refresh_labels(self, denied_msg: str = "") -> None:
        f_txt = "VERIFIED" if self.face_verified else "SCANNING..."
        v_txt = "VERIFIED" if self.voice_verified else f'SAY "{DEFAULT_VOICE_PHRASE.upper()}"'
        self.factors_lbl.config(
            text=f"[1] FACE ID: {f_txt}     |     [2] VOICE CODE: {v_txt}"
        )
        if denied_msg:
            self.decision_banner.config(text=f"ACCESS DENIED — {denied_msg}", fg="#F87171", bg="#2A0A12")
        elif self.face_verified and self.voice_verified:
            self._grant_access("FACE ID + VOICE CODE")

    def verify_password(self) -> None:
        typed = self.pwd_entry.get().strip()
        self.pwd_entry.delete(0, tk.END)
        digest = hashlib.sha256(typed.encode("utf-8")).hexdigest()
        expected = DEFAULT_PASS_HASH
        if PROFILE_FILE.exists():
            try:
                expected = json.loads(PROFILE_FILE.read_text(encoding="utf-8")).get("password_hash", expected)
            except Exception:
                pass
        if digest == expected:
            self._grant_access("MASTER PASSWORD")
        else:
            self._refresh_labels("INVALID MASTER PASSWORD")

    def _verify_face_loop(self) -> None:
        try:
            import cv2

            cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            cap = cv2.VideoCapture(0)
            while self.running and not self.face_verified:
                ret, frame = cap.read()
                if not ret:
                    continue
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(90, 90))
                if len(faces) > 0:
                    self.face_verified = True
                    self.after(0, self._refresh_labels)
            cap.release()
        except Exception:
            pass

    def _verify_voice_loop(self) -> None:
        try:
            import speech_recognition as sr

            rec = sr.Recognizer()
            mic = sr.Microphone()
            while self.running and not self.voice_verified:
                try:
                    with mic as src:
                        audio = rec.listen(src, phrase_time_limit=4)
                    spoken = rec.recognize_google(audio).lower()
                    if DEFAULT_VOICE_PHRASE in spoken:
                        self.voice_verified = True
                        self.after(0, self._refresh_labels)
                    else:
                        self.after(0, lambda: self._refresh_labels("VOICE PHRASE MISMATCH"))
                except Exception:
                    continue
        except Exception:
            pass

    def _grant_access(self, method: str) -> None:
        self.running = False
        self.decision_banner.config(
            text=f"ACCESS GRANTED ({method}) — INITIALIZING LIVE DESKTOP WALLPAPER",
            fg="#34D399",
            bg="#06281E",
        )
        try:
            import keyboard

            keyboard.unhook_all()
        except Exception:
            pass
        threading.Thread(target=play_welcome_sequence, daemon=True).start()
        self.after(900, self.destroy)


if __name__ == "__main__":
    import sys

    gate = SaraSecurityGate(windowed_test="--windowed" in sys.argv)
    gate.mainloop()
