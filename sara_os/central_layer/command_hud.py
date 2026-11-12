#!/usr/bin/env python3
"""
SARA Live Desktop Wallpaper HUD + Alt+Space Instant Text Command Bar (`command_hud.py`)
Designed for Windows 10 Pro (Intel Core i5 / 8 GB RAM).
Mounts cleanly behind desktop icons via `wallpaper_embed.py` and binds `Alt + Space`
for instant Spotlight-style text commands alongside always-on `"Hey SARA"` voice control.
"""

import json
import os
import threading
import tkinter as tk
import urllib.request

import psutil

KERNEL_HTTP = os.getenv("SARA_KERNEL_HTTP", "http://127.0.0.1:8765/command")
WINDOW_TITLE = "S.A.R.A. // LOCAL COMMAND HUD"


def post_kernel_command(text: str) -> str:
    try:
        req = urllib.request.Request(
            KERNEL_HTTP,
            data=json.dumps({"text": text}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return str(body.get("reply", "Done."))
    except Exception as exc:
        return f"Kernel unreachable: {exc}"


class SaraCommandHud(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(WINDOW_TITLE)
        self.geometry("1920x1080")
        self.configure(bg="#030712")

        self.spotlight: tk.Toplevel | None = None
        self._build_wallpaper_hud()
        self._bind_alt_space()
        self._tick_telemetry()

    def _build_wallpaper_hud(self) -> None:
        top = tk.Frame(self, bg="#030712")
        top.pack(fill="x", padx=48, pady=36)

        tk.Label(
            top,
            text="S.A.R.A. // CENTRAL OPERATING LAYER (WINDOWS 10 PRO)",
            fg="#38BDF8",
            bg="#030712",
            font=("Consolas", 16, "bold"),
        ).pack(side="left")

        self.telemetry_lbl = tk.Label(
            top,
            text="CPU: --%   |   RAM: -- / -- GB   |   ALT+SPACE OR 'HEY SARA' READY",
            fg="#94A3B8",
            bg="#030712",
            font=("Consolas", 11),
        )
        self.telemetry_lbl.pack(side="right")

        center = tk.Frame(self, bg="#030712")
        center.pack(expand=True)

        self.core_lbl = tk.Label(
            center,
            text="◉  S.A.R.A. LIVE WALLPAPER CORE ONLINE",
            fg="#22D3EE",
            bg="#030712",
            font=("Consolas", 22, "bold"),
        )
        self.core_lbl.pack(pady=10)

        self.reply_lbl = tk.Label(
            center,
            text="Press Alt + Space or speak 'Hey SARA' to control apps, files, screen vision & hardware.",
            fg="#E2E8F0",
            bg="#071022",
            wraplength=920,
            padx=24,
            pady=16,
            font=("Consolas", 12),
        )
        self.reply_lbl.pack(pady=16)

    def _bind_alt_space(self) -> None:
        self.bind_all("<Alt-space>", lambda _e: self.toggle_spotlight())
        try:
            import keyboard

            keyboard.add_hotkey("alt+space", lambda: self.after(0, self.toggle_spotlight))
        except Exception:
            pass

    def toggle_spotlight(self) -> None:
        if self.spotlight and self.spotlight.winfo_exists():
            self.spotlight.destroy()
            self.spotlight = None
            return

        bar = tk.Toplevel(self)
        bar.overrideredirect(True)
        bar.attributes("-topmost", True)
        bar.configure(bg="#0B162C")
        w, h = 680, 64
        sw = self.winfo_screenwidth()
        sh = self.winfo_screenheight()
        bar.geometry(f"{w}x{h}+{(sw - w) // 2}+{sh // 4}")

        entry = tk.Entry(
            bar,
            bg="#0B162C",
            fg="#F8FAFC",
            insertbackground="#38BDF8",
            font=("Consolas", 14),
            relief="flat",
        )
        entry.pack(fill="both", expand=True, padx=18, pady=14)
        entry.focus_force()

        def submit(_ev=None):
            cmd = entry.get().strip()
            bar.destroy()
            self.spotlight = None
            if cmd:
                self.reply_lbl.config(text=f"Executing: {cmd} ...")
                threading.Thread(target=self._exec_bg, args=(cmd,), daemon=True).start()

        entry.bind("<Return>", submit)
        entry.bind("<Escape>", lambda _e: bar.destroy())
        self.spotlight = bar

    def _exec_bg(self, cmd: str) -> None:
        reply = post_kernel_command(cmd)
        self.after(0, lambda: self.reply_lbl.config(text=reply))

    def _tick_telemetry(self) -> None:
        vm = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=None)
        self.telemetry_lbl.config(
            text=f"CPU: {cpu:.0f}%   |   RAM: {vm.used / (1024**3):.1f} / {vm.total / (1024**3):.1f} GB ({vm.percent:.0f}%)   |   ALT+SPACE READY"
        )
        self.after(2500, self._tick_telemetry)


if __name__ == "__main__":
    hud = SaraCommandHud()
    hud.mainloop()
