"""
Layer 1 & Layer 2 Python Worker: Continuous OS Telemetry Daemon, Fast MSS Screen Capture,
Folder Drop Watcher, and Independent Structured JSON Action Registry.

- Uses `psutil` (with stdlib fallback) for CPU, RAM, process, and network traffic deltas.
- Uses `win32gui` / ctypes on Windows (with cross-platform fallback) for active window titles.
- Uses `mss` (with PIL / sandbox fallback) for fast background screenshots + SHA-1 diffing.
- Watches configured folders continuously to emit `file_dropped` / `file_modified` OS events.
- Exposes `agenticToolExecute` (`execute_cmd`, `move_mouse`, `click`, `inject_keys`,
  `read_file`, `write_script`) for zero-approval structured JSON execution.
"""

from __future__ import annotations

import base64
import hashlib
import io
import os
import platform
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

from .registry import ToolError, register
from .tools_os_autonomous import run_os_command

try:
    import psutil  # type: ignore
except ImportError:
    psutil = None  # type: ignore


def _get_active_window_title() -> Dict[str, Any]:
    if platform.system() == "Windows":
        try:
            import win32gui  # type: ignore

            hwnd = win32gui.GetForegroundWindow()
            title = win32gui.GetWindowText(hwnd) if hwnd else ""
            return {"hwnd": int(hwnd or 0), "title": title or None}
        except Exception:
            try:
                import ctypes

                user32 = ctypes.windll.user32
                hwnd = user32.GetForegroundWindow()
                length = user32.GetWindowTextLengthW(hwnd)
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                return {"hwnd": int(hwnd or 0), "title": buf.value or None}
            except Exception:
                return {"hwnd": 0, "title": None}
    return {"hwnd": 0, "title": os.environ.get("SARA_MOCK_ACTIVE_WINDOW") or None}


def _sample_metrics(prev_net: Optional[Tuple[int, int, float]]) -> Tuple[Dict[str, Any], Tuple[int, int, float]]:
    now = time.time()
    cpu_pct = 0.0
    ram_pct = 0.0
    ram_avail_mb = 0.0
    net_sent = 0
    net_recv = 0
    bytes_per_sec = 0.0

    if psutil is not None:
        try:
            cpu_pct = float(psutil.cpu_percent(interval=None))
            vm = psutil.virtual_memory()
            ram_pct = float(vm.percent)
            ram_avail_mb = round(vm.available / (1024 * 1024), 1)
            nio = psutil.net_io_counters()
            if nio:
                net_sent = int(nio.bytes_sent)
                net_recv = int(nio.bytes_recv)
        except Exception:
            pass
    else:
        try:
            load1, _, _ = os.getloadavg()
            cores = max(1, os.cpu_count() or 1)
            cpu_pct = round(min(100.0, (load1 / cores) * 100.0), 1)
        except Exception:
            cpu_pct = 0.0

    if prev_net is not None:
        dt = max(0.001, now - prev_net[2])
        delta_bytes = max(0, (net_sent - prev_net[0]) + (net_recv - prev_net[1]))
        bytes_per_sec = round(delta_bytes / dt, 1)

    win = _get_active_window_title()
    metrics = {
        "timestamp": now,
        "cpu_percent": round(cpu_pct, 1),
        "ram_percent": round(ram_pct, 1),
        "ram_available_mb": ram_avail_mb,
        "net_bytes_sent": net_sent,
        "net_bytes_recv": net_recv,
        "net_bytes_per_sec": bytes_per_sec,
        "active_window": win,
    }
    return metrics, (net_sent, net_recv, now)


class _TelemetryDaemon:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._running = False
        self._interval_sec = 2.0
        self._cpu_spike_threshold = 85.0
        self._thread: Optional[threading.Thread] = None
        self._events: Deque[Dict[str, Any]] = deque(maxlen=200)
        self._watched_folders: Dict[str, Dict[str, float]] = {}
        self._last_metrics: Dict[str, Any] = {}
        self._prev_net: Optional[Tuple[int, int, float]] = None
        self._last_window_title: Optional[str] = None
        self._last_screen_hash: Optional[str] = None

    def start(self, interval_sec: float = 2.0, cpu_spike_threshold: float = 85.0) -> Dict[str, Any]:
        with self._lock:
            self._interval_sec = max(0.5, min(30.0, float(interval_sec)))
            self._cpu_spike_threshold = max(20.0, min(99.0, float(cpu_spike_threshold)))
            if self._running and self._thread and self._thread.is_alive():
                return {"running": True, "interval_sec": self._interval_sec}
            self._running = True
            self._thread = threading.Thread(target=self._loop, name="sara-telemetry-daemon", daemon=True)
            self._thread.start()
            return {"running": True, "interval_sec": self._interval_sec}

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            self._running = False
        return {"running": False}

    def watch_folder(self, folder: str, remove: bool = False) -> Dict[str, Any]:
        resolved = str(Path(os.path.expandvars(os.path.expanduser(folder))).resolve())
        with self._lock:
            if remove:
                self._watched_folders.pop(resolved, None)
                return {"ok": True, "watching": list(self._watched_folders.keys())}
            p = Path(resolved)
            p.mkdir(parents=True, exist_ok=True)
            snapshot: Dict[str, float] = {}
            for child in p.iterdir():
                try:
                    snapshot[child.name] = child.stat().st_mtime
                except Exception:
                    continue
            self._watched_folders[resolved] = snapshot
            return {"ok": True, "folder": resolved, "watching": list(self._watched_folders.keys())}

    def _scan_folders_locked(self) -> None:
        now = time.time()
        for folder, known in list(self._watched_folders.items()):
            p = Path(folder)
            if not p.exists():
                continue
            current: Dict[str, float] = {}
            try:
                entries = list(p.iterdir())
            except Exception:
                continue
            for child in entries:
                try:
                    mtime = child.stat().st_mtime
                except Exception:
                    continue
                current[child.name] = mtime
                if child.name not in known:
                    self._events.append(
                        {
                            "type": "file_dropped",
                            "folder": folder,
                            "name": child.name,
                            "path": str(child),
                            "timestamp": now,
                        }
                    )
                elif mtime > known[child.name] + 0.001:
                    self._events.append(
                        {
                            "type": "file_modified",
                            "folder": folder,
                            "name": child.name,
                            "path": str(child),
                            "timestamp": now,
                        }
                    )
            self._watched_folders[folder] = current

    def sample_once(self) -> Dict[str, Any]:
        metrics, prev_net = _sample_metrics(self._prev_net)
        with self._lock:
            self._prev_net = prev_net
            self._last_metrics = metrics
            title = metrics["active_window"].get("title")
            if title and title != self._last_window_title:
                self._events.append(
                    {
                        "type": "window_changed",
                        "title": title,
                        "previous": self._last_window_title,
                        "timestamp": metrics["timestamp"],
                    }
                )
                self._last_window_title = title
            if metrics["cpu_percent"] >= self._cpu_spike_threshold:
                self._events.append(
                    {
                        "type": "cpu_spike",
                        "cpu_percent": metrics["cpu_percent"],
                        "timestamp": metrics["timestamp"],
                    }
                )
            self._scan_folders_locked()
            return metrics

    def _loop(self) -> None:
        while True:
            with self._lock:
                if not self._running:
                    break
                interval = self._interval_sec
            try:
                self.sample_once()
            except Exception:
                pass
            time.sleep(interval)

    def poll(self, drain_events: bool = True) -> Dict[str, Any]:
        metrics = self.sample_once()
        with self._lock:
            if drain_events:
                events = list(self._events)
                self._events.clear()
            else:
                events = list(self._events)
            watching = list(self._watched_folders.keys())
            running = self._running
        return {
            "ok": True,
            "daemon_running": running,
            "metrics": metrics,
            "events": events,
            "watched_folders": watching,
        }

    def capture_fast_screen(self, max_dim: int = 1280) -> Dict[str, Any]:
        # Prefer mss for ultra-fast background capture
        raw_bytes: Optional[bytes] = None
        mime = "image/png"
        width = 0
        height = 0
        try:
            import mss  # type: ignore
            import mss.tools  # type: ignore

            with mss.mss() as sct:
                monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                shot = sct.grab(monitor)
                width, height = shot.width, shot.height
                try:
                    from PIL import Image  # type: ignore

                    img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                    if max(width, height) > max_dim:
                        scale = max_dim / float(max(width, height))
                        img = img.resize((max(1, int(width * scale)), max(1, int(height * scale))))
                        width, height = img.size
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=68)
                    raw_bytes = buf.getvalue()
                    mime = "image/jpeg"
                except Exception:
                    raw_bytes = mss.tools.to_png(shot.rgb, shot.size)
                    mime = "image/png"
        except Exception:
            # Headless / sandbox fallback: return deterministic status without crashing
            return {
                "ok": True,
                "available": False,
                "screen_changed": False,
                "active_window": _get_active_window_title(),
                "note": "Display capture unavailable on headless host; OS telemetry remains active.",
            }

        digest = hashlib.sha1(raw_bytes).hexdigest()
        with self._lock:
            changed = digest != self._last_screen_hash
            self._last_screen_hash = digest

        return {
            "ok": True,
            "available": True,
            "screen_changed": changed,
            "frame_hash": digest,
            "width": width,
            "height": height,
            "image_mime": mime,
            "image_base64": base64.b64encode(raw_bytes).decode("ascii"),
            "active_window": _get_active_window_title(),
        }


_DAEMON = _TelemetryDaemon()


@register("startTelemetryDaemon")
def start_telemetry_daemon(args: Dict[str, Any]) -> Dict[str, Any]:
    interval = float(args.get("interval_sec") or 2.0)
    cpu_threshold = float(args.get("cpu_spike_threshold") or 85.0)
    status = _DAEMON.start(interval_sec=interval, cpu_spike_threshold=cpu_threshold)
    for folder in args.get("watch_folders") or []:
        if folder:
            _DAEMON.watch_folder(str(folder))
    return {"ok": True, **status}


@register("stopTelemetryDaemon")
def stop_telemetry_daemon(_args: Dict[str, Any]) -> Dict[str, Any]:
    return {"ok": True, **_DAEMON.stop()}


@register("pollOsTelemetry")
def poll_os_telemetry(args: Dict[str, Any]) -> Dict[str, Any]:
    drain = args.get("drain_events", True) is not False
    return _DAEMON.poll(drain_events=drain)


@register("watchFolderEvents")
def watch_folder_events(args: Dict[str, Any]) -> Dict[str, Any]:
    folder = str(args.get("folder") or args.get("path") or "").strip()
    if not folder:
        raise ToolError("Parameter 'folder' is required.")
    remove = bool(args.get("remove", False))
    return _DAEMON.watch_folder(folder, remove=remove)


@register("captureFastScreen")
def capture_fast_screen(args: Dict[str, Any]) -> Dict[str, Any]:
    max_dim = max(320, min(2560, int(args.get("max_dim") or 1280)))
    return _DAEMON.capture_fast_screen(max_dim=max_dim)


# --- Layer 2: Structured Python Independent Tool Dictionary ---


def _tool_execute_cmd(args: Dict[str, Any]) -> Dict[str, Any]:
    return run_os_command(
        {
            "command": args.get("command") or args.get("cmd"),
            "shell": args.get("shell") or "auto",
            "cwd": args.get("cwd"),
            "timeout": args.get("timeout") or 60,
        }
    )


def _tool_move_mouse(args: Dict[str, Any]) -> Dict[str, Any]:
    x = int(args.get("x", 0))
    y = int(args.get("y", 0))
    if os.environ.get("SARA_ENV", "").lower() == "sandbox":
        return {"ok": True, "x": x, "y": y, "result": f"[SANDBOX] Moved mouse to ({x}, {y})"}
    try:
        import pyautogui  # type: ignore

        pyautogui.FAILSAFE = False
        pyautogui.moveTo(x, y, duration=float(args.get("duration") or 0.12))
        return {"ok": True, "x": x, "y": y, "result": f"Moved mouse to ({x}, {y})"}
    except Exception as exc:
        raise ToolError(f"move_mouse failed: {exc}") from exc


def _tool_click(args: Dict[str, Any]) -> Dict[str, Any]:
    x = int(args.get("x", 0))
    y = int(args.get("y", 0))
    button = str(args.get("button") or "left")
    clicks = int(args.get("clicks") or 1)
    if os.environ.get("SARA_ENV", "").lower() == "sandbox":
        return {"ok": True, "x": x, "y": y, "result": f"[SANDBOX] Clicked ({x}, {y}) [{button}]"}
    try:
        import pyautogui  # type: ignore

        pyautogui.FAILSAFE = False
        pyautogui.click(x=x, y=y, clicks=clicks, button=button)
        return {"ok": True, "x": x, "y": y, "result": f"Clicked ({x}, {y}) [{button}]"}
    except Exception as exc:
        raise ToolError(f"click failed: {exc}") from exc


def _tool_inject_keys(args: Dict[str, Any]) -> Dict[str, Any]:
    text = args.get("text")
    keys = args.get("keys")
    if os.environ.get("SARA_ENV", "").lower() == "sandbox":
        return {"ok": True, "result": f"[SANDBOX] Injected input text={bool(text)} keys={keys}"}
    try:
        import pyautogui  # type: ignore

        pyautogui.FAILSAFE = False
        if text is not None:
            pyautogui.write(str(text), interval=0.01)
        if isinstance(keys, list) and keys:
            pyautogui.hotkey(*[str(k) for k in keys])
        elif isinstance(keys, str) and keys:
            pyautogui.press(keys)
        return {"ok": True, "result": "Injected keyboard input."}
    except Exception as exc:
        raise ToolError(f"inject_keys failed: {exc}") from exc


def _tool_read_file(args: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = str(args.get("path") or "").strip()
    if not raw_path:
        raise ToolError("Parameter 'path' is required.")
    p = Path(os.path.expandvars(os.path.expanduser(raw_path))).resolve()
    if not p.exists():
        raise ToolError(f"File not found: {p}")
    max_chars = max(200, min(50000, int(args.get("max_chars") or 12000)))
    content = p.read_text(encoding="utf-8", errors="replace")[:max_chars]
    return {"ok": True, "path": str(p), "content": content, "result": f"Read {len(content)} chars from {p.name}"}


def _tool_write_script(args: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = str(args.get("path") or "").strip()
    code = str(args.get("code") or args.get("content") or "")
    execute_now = args.get("execute", True) is not False
    if not raw_path:
        raise ToolError("Parameter 'path' is required.")
    p = Path(os.path.expandvars(os.path.expanduser(raw_path))).resolve()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(code, encoding="utf-8")
    if not execute_now:
        return {"ok": True, "path": str(p), "executed": False, "result": f"Wrote script {p}"}

    ext = p.suffix.lower()
    if ext == ".py":
        cmd = f'"{sys.executable}" "{p}"'
    elif ext == ".ps1":
        cmd = f'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{p}"'
    elif ext in (".js", ".mjs"):
        cmd = f'node "{p}"'
    else:
        cmd = f'"{p}"'
    exec_res = run_os_command({"command": cmd, "cwd": str(p.parent), "timeout": int(args.get("timeout") or 60)})
    return {
        "ok": exec_res["ok"],
        "path": str(p),
        "executed": True,
        "exit_code": exec_res["exit_code"],
        "stdout": exec_res["stdout"],
        "stderr": exec_res["stderr"],
        "result": exec_res["result"],
    }


AGENTIC_TOOL_REGISTRY: Dict[str, Callable[[Dict[str, Any]], Dict[str, Any]]] = {
    "execute_cmd": _tool_execute_cmd,
    "move_mouse": _tool_move_mouse,
    "click": _tool_click,
    "inject_keys": _tool_inject_keys,
    "read_file": _tool_read_file,
    "write_script": _tool_write_script,
}


@register("agenticToolExecute")
def agentic_tool_execute(args: Dict[str, Any]) -> Dict[str, Any]:
    action = str(args.get("action") or "").strip()
    action_args = args.get("args") if isinstance(args.get("args"), dict) else args
    fn = AGENTIC_TOOL_REGISTRY.get(action)
    if fn is None:
        raise ToolError(
            f"Unknown agentic action '{action}'. Supported: {', '.join(sorted(AGENTIC_TOOL_REGISTRY.keys()))}"
        )
    return fn(action_args)
