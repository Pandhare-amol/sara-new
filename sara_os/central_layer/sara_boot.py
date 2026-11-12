#!/usr/bin/env python3
"""
4-Stage Boot-to-Desktop Sequencer for Windows 10 Pro (`sara_boot.py`)
1. Starts `sara_kernel.py` + `win10_node.py` silently (~75 MB RAM on i5 / 8 GB)
2. Launches Full-Screen 3-Factor `SaraSecurityGate` (Face + Voice + Password)
3. Once Access Granted -> Launches `explorer.exe` + Welcome Sound
4. Launches `command_hud.py` & embeds it into Windows 10 `WorkerW` Live Desktop Wallpaper!
"""

import os
import subprocess
import sys
import time
from pathlib import Path

from sara_lock_gate import SaraSecurityGate
from wallpaper_embed import embed_window_as_wallpaper

BASE_DIR = Path(__file__).resolve().parent
PYTHON_BIN = sys.executable
NO_WIN = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def boot_sequence() -> None:
    # Stage 1: Start Central Kernel & Windows 10 OS Node in background
    subprocess.Popen([PYTHON_BIN, str(BASE_DIR / "sara_kernel.py")], creationflags=NO_WIN)
    subprocess.Popen([PYTHON_BIN, str(BASE_DIR / "win10_node.py")], creationflags=NO_WIN)

    # Stage 2: Full-Screen 3-Factor SARA Security Gate (blocks desktop until verified)
    gate = SaraSecurityGate(windowed_test="--windowed" in sys.argv)
    gate.mainloop()

    # Stage 3: Auth Verified! Launch Windows Desktop Shell (`explorer.exe`)
    if os.name == "nt" and "--no-explorer" not in sys.argv:
        subprocess.Popen(["explorer.exe"])
        time.sleep(2.5)

    # Stage 4: Launch Live Command HUD & Mount into Windows 10 WorkerW Wallpaper Layer
    subprocess.Popen([PYTHON_BIN, str(BASE_DIR / "command_hud.py")], creationflags=NO_WIN)
    time.sleep(1.5)
    embed_window_as_wallpaper("S.A.R.A. // LOCAL COMMAND HUD")


if __name__ == "__main__":
    boot_sequence()
