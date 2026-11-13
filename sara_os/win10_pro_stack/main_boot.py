"""
SARA Fast-Boot Orchestrator (`sara_os/win10_pro_stack/main_boot.py`)
Target: Windows 10/11 Pro (Intel Core i5, 8 GB RAM, 128 MB VRAM)

1. Clears stale file-locking host processes (`Sara.WindowsBridge.exe`, `Sara.DesktopHost.exe`).
2. Starts `kernel/sara_kernel.py` silently (`CREATE_NO_WINDOW`) and verifies port 8765.
3. Starts the 24/7 independent `watchdog.py` supervisor (< 4 MB RAM).
4. Runs the 3-Factor Boot Security Gate (`security/sara_shield.py`).
5. Ensures `explorer.exe` shell availability (or CustomShell recovery fallback).
6. Launches `ui/hud_wallpaper.py` embedded into Win32 `WorkerW` behind desktop icons.
7. Registers `Alt+Space` quick-command bar & `Ctrl+Shift+Esc` emergency failsafe.
"""

from __future__ import annotations

import ctypes
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

DEFAULT_WIN_PATH = Path(r"D:\project\new_jarvis\Sara\Sara-main")
BASE_DIR = Path(
    os.getenv("SARA_BASE_DIR")
    or (str(DEFAULT_WIN_PATH) if os.name == "nt" and DEFAULT_WIN_PATH.exists() else str(Path(__file__).resolve().parent))
)
PYTHON_EXE = sys.executable

KERNEL_SCRIPT = Path(__file__).resolve().parent / "kernel" / "sara_kernel.py"
WATCHDOG_SCRIPT = Path(__file__).resolve().parent / "watchdog.py"
SHIELD_SCRIPT = Path(__file__).resolve().parent / "security" / "sara_shield.py"
HUD_SCRIPT = Path(__file__).resolve().parent / "ui" / "hud_wallpaper.py"

CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
KERNEL_PORT = int(os.getenv("SARA_KERNEL_PORT", "8765"))


def cleanup_stale_locks() -> list[str]:
    """Terminates lingering Sara host processes that lock build files on Windows 10/11."""
    cleared: list[str] = []
    if os.name != "nt":
        return cleared
    for exe in ("Sara.WindowsBridge.exe", "Sara.DesktopHost.exe"):
        res = subprocess.run(
            ["taskkill", "/F", "/IM", exe],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            creationflags=CREATE_NO_WINDOW,
        )
        if res.returncode == 0:
            cleared.append(exe)
    return cleared


def is_port_open(host: str = "127.0.0.1", port: int = KERNEL_PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) == 0


def start_kernel() -> subprocess.Popen | None:
    """Starts the FastAPI + Gemini Live WebSocket kernel silently with minimal RAM."""
    if is_port_open():
        return None
    env = os.environ.copy()
    env["PYTHONPATH"] = str(Path(__file__).resolve().parent)
    proc = subprocess.Popen(
        [PYTHON_EXE, str(KERNEL_SCRIPT)],
        cwd=str(Path(__file__).resolve().parent),
        env=env,
        creationflags=CREATE_NO_WINDOW,
    )
    for _ in range(30):
        if is_port_open():
            break
        time.sleep(0.1)
    return proc


def start_independent_watchdog() -> subprocess.Popen | None:
    """Starts the independent 24/7 crash & Explorer-restart watchdog process."""
    if not WATCHDOG_SCRIPT.exists():
        return None
    return subprocess.Popen(
        [PYTHON_EXE, str(WATCHDOG_SCRIPT)],
        cwd=str(Path(__file__).resolve().parent),
        creationflags=CREATE_NO_WINDOW,
    )


def run_boot_security_gate() -> bool:
    """Runs the 3-Factor Auth gate (Face + Voice + Master Password) before desktop unlock."""
    if not SHIELD_SCRIPT.exists():
        return True
    result = subprocess.run(
        [PYTHON_EXE, str(SHIELD_SCRIPT), "--gate"],
        cwd=str(Path(__file__).resolve().parent),
    )
    return result.returncode == 0


def ensure_windows_shell() -> bool:
    """Launches explorer.exe if main_boot.py was invoked as a custom Winlogon Shell."""
    if os.name != "nt":
        return True
    res = subprocess.run(
        ["tasklist", "/FI", "IMAGENAME eq explorer.exe"],
        capture_output=True,
        text=True,
        creationflags=CREATE_NO_WINDOW,
    )
    if "explorer.exe" not in res.stdout.lower():
        subprocess.Popen(["explorer.exe"])
        time.sleep(1.0)
        return True
    return True


def launch_desktop_hud() -> subprocess.Popen | None:
    """Launches the lightweight WorkerW-embedded telemetry & taskbar HUD."""
    if HUD_SCRIPT.exists():
        return subprocess.Popen(
            [PYTHON_EXE, str(HUD_SCRIPT)],
            cwd=str(Path(__file__).resolve().parent),
            creationflags=CREATE_NO_WINDOW,
        )
    return None


def register_global_hotkeys() -> bool:
    """Lazy-registers Alt+Space quick command popup and Ctrl+Shift+Esc emergency stop."""
    try:
        import keyboard  # Lazy import so boot stays fast even without keyboard hook
    except ImportError:
        return False

    def trigger_quick_prompt() -> None:
        if os.name != "nt":
            return
        ps_cmd = (
            "Add-Type -AssemblyName Microsoft.VisualBasic; "
            '[Microsoft.VisualBasic.Interaction]::InputBox("Command SARA:", "SARA Universal Command", "")'
        )
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
        ).stdout.strip()
        if out:
            payload = json.dumps({"command": out, "use_search": True}).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{KERNEL_PORT}/api/command",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                urllib.request.urlopen(req, timeout=20)
            except Exception as exc:
                print(f"[SARA Hotkey Error] {exc}")

    def emergency_abort() -> None:
        if os.name == "nt":
            ctypes.windll.user32.LockWorkStation()
        os._exit(0)

    keyboard.add_hotkey("alt+space", trigger_quick_prompt)
    keyboard.add_hotkey("ctrl+shift+esc", emergency_abort)
    return True


def boot(dry_run: bool = False) -> dict:
    t0 = time.perf_counter()
    cleared = cleanup_stale_locks()
    if dry_run:
        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "ok": True,
            "dry_run": True,
            "boot_ms": elapsed,
            "cleared_locks": cleared,
            "base_dir": str(BASE_DIR),
        }

    start_kernel()
    if not run_boot_security_gate():
        if os.name == "nt":
            ctypes.windll.user32.LockWorkStation()
        sys.exit(1)

    ensure_windows_shell()
    start_independent_watchdog()
    launch_desktop_hud()
    hotkeys_ok = register_global_hotkeys()

    elapsed = round(time.perf_counter() - t0, 3)
    print(f"[SARA Boot] Online in {elapsed}s | Kernel: ws://127.0.0.1:{KERNEL_PORT} | Hotkeys={hotkeys_ok}")
    try:
        while True:
            time.sleep(5)
    except KeyboardInterrupt:
        return {"ok": True, "elapsed_s": elapsed}


if __name__ == "__main__":
    if "--dry-run" in sys.argv:
        print(json.dumps(boot(dry_run=True)))
    else:
        boot()
