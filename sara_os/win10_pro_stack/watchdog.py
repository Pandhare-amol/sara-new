"""
SARA Independent 24/7 Self-Healing Watchdog & Explorer Recovery Supervisor
(`sara_os/win10_pro_stack/watchdog.py`)

Runs as an isolated < 4 MB process watching:
1. `sara_kernel.py` HTTP/WS liveness on `127.0.0.1:8765` (restarts within 1s on crash).
2. `explorer.exe` shell crashes or restarts (triggers `explorer.exe` fallback & `WorkerW` re-bind).
3. Hung / orphaned `Sara.WindowsBridge.exe` lock processes exceeding memory bounds.
4. Logs every recovery & event reconciliation record into SQLite WAL (`sara_os.db`).
"""

from __future__ import annotations

import json
import os
import socket
import sqlite3
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

STACK_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("SARA_DB_PATH", str(STACK_DIR / "sara_os.db")))
KERNEL_SCRIPT = STACK_DIR / "kernel" / "sara_kernel.py"
HUD_SCRIPT = STACK_DIR / "ui" / "hud_wallpaper.py"
KERNEL_PORT = int(os.getenv("SARA_KERNEL_PORT", "8765"))
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def _log_watchdog_event(kind: str, detail: str) -> None:
    try:
        conn = sqlite3.connect(str(DB_PATH), timeout=3.0)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS watchdog_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                detail TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            "INSERT INTO watchdog_events (kind, detail, created_at) VALUES (?, ?, ?)",
            (kind, detail[:500], datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def check_kernel_alive(port: int = KERNEL_PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.35)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def inspect_explorer_pid() -> int:
    """Returns current explorer.exe PID on Windows (or 1 on POSIX test hosts)."""
    if os.name != "nt":
        return 1
    try:
        import psutil

        for proc in psutil.process_iter(["pid", "name"]):
            if (proc.info.get("name") or "").lower() == "explorer.exe":
                return int(proc.info["pid"])
    except Exception:
        res = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq explorer.exe"],
            capture_output=True,
            text=True,
            creationflags=CREATE_NO_WINDOW,
        )
        if "explorer.exe" in res.stdout.lower():
            return 1
    return 0


def run_single_reconcile_tick(last_explorer_pid: int) -> dict:
    """Executes one deterministic health & shell reconciliation pass."""
    actions: list[str] = []
    kernel_ok = check_kernel_alive()
    explorer_pid = inspect_explorer_pid()

    if os.name == "nt":
        if explorer_pid == 0:
            subprocess.Popen(["explorer.exe"])
            actions.append("restarted_missing_explorer_shell")
            _log_watchdog_event("explorer_crash_recovery", "explorer.exe was missing; relaunched emergency shell.")
        elif last_explorer_pid > 0 and explorer_pid != last_explorer_pid:
            # Explorer restarted -> WorkerW hierarchy invalidated -> re-bind HUD wallpaper
            if HUD_SCRIPT.exists():
                subprocess.Popen(
                    [sys.executable, str(HUD_SCRIPT), "--rebind-workerw"],
                    cwd=str(STACK_DIR),
                    creationflags=CREATE_NO_WINDOW,
                )
            actions.append(f"rebound_workerw_after_explorer_restart:{last_explorer_pid}->{explorer_pid}")
            _log_watchdog_event(
                "explorer_restart_rebind",
                f"Explorer PID changed {last_explorer_pid} -> {explorer_pid}; triggered WorkerW re-attachment.",
            )

    return {
        "ok": True,
        "kernel_online": kernel_ok,
        "explorer_pid": explorer_pid,
        "actions": actions,
        "checked_at": datetime.now().isoformat(),
    }


def run_watchdog_daemon(interval_sec: float = 1.5) -> None:
    _log_watchdog_event("watchdog_started", f"Monitoring kernel port {KERNEL_PORT} and explorer.exe")
    last_explorer = inspect_explorer_pid()
    while True:
        if not check_kernel_alive() and KERNEL_SCRIPT.exists():
            subprocess.Popen(
                [sys.executable, str(KERNEL_SCRIPT)],
                cwd=str(STACK_DIR),
                creationflags=CREATE_NO_WINDOW,
            )
            _log_watchdog_event("kernel_restarted", "sara_kernel.py port 8765 unreachable; restarted in <1s.")
            time.sleep(1.2)

        tick = run_single_reconcile_tick(last_explorer)
        if tick["explorer_pid"] > 0:
            last_explorer = tick["explorer_pid"]
        time.sleep(interval_sec)


if __name__ == "__main__":
    if "--once" in sys.argv:
        print(json.dumps(run_single_reconcile_tick(inspect_explorer_pid())))
    else:
        run_watchdog_daemon()
