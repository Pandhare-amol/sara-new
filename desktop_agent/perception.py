"""Lightweight local desktop observation for MYRAA's event-driven runtime.

The snapshot contains metadata only: active window/app names, visible app names,
disk capacity, download file metadata, and idle time. It never captures screen
pixels, microphone audio, clipboard contents, or file contents.
"""

from __future__ import annotations

import ctypes
import os
import platform
import shutil
import time
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

try:
    import psutil  # type: ignore
except ImportError:  # metadata observation degrades gracefully in minimal dev runtimes
    psutil = None  # type: ignore


PARTIAL_DOWNLOAD_SUFFIXES = {".crdownload", ".part", ".partial", ".tmp"}


def collect_snapshot() -> Dict[str, Any]:
    snapshot = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "activeWindow": _active_window(),
        "applications": _visible_applications(),
        "disk": _disk_snapshot(),
        "drives": _drives_snapshot(),
        "downloads": _download_snapshot(),
        "userIdleSeconds": _idle_seconds(),
        "cursor": _cursor_snapshot(),
    }
    snapshot["resources"] = _resource_snapshot()
    return snapshot

def _cursor_snapshot() -> Dict[str, Any] | None:
    """Cheap physical cursor state; no screenshot or OCR is involved."""
    if platform.system() != "Windows":
        return None
    try:
        import win32api  # type: ignore
        point = win32api.GetCursorPos()
        monitor = win32api.MonitorFromPoint(point, win32api.MONITOR_DEFAULTTONEAREST)
        return {"x": int(point[0]), "y": int(point[1]), "monitor": int(monitor), "timestamp": time.time()}
    except Exception:
        return None


def _resource_snapshot() -> Dict[str, Any]:
    """Return bounded operational metrics; never reads file contents or clipboard."""
    if psutil is None:
        return {"supported": False, "reason": "psutil unavailable"}
    try:
        memory = psutil.virtual_memory()
        processes: List[Dict[str, Any]] = []
        for process in psutil.process_iter(["pid", "name", "memory_info", "status", "username"]):
            try:
                info = process.info
                mem = info.get("memory_info")
                processes.append({
                    "pid": int(info["pid"]),
                    "name": info.get("name") or "unknown",
                    "memoryBytes": int(mem.rss) if mem else 0,
                    "cpuPercent": float(process.cpu_percent(interval=None)),
                    "status": info.get("status"),
                    "userOwned": bool(info.get("username")),
                    "classification": _classify_process(str(info.get("name") or "unknown")),
                })
            except (psutil.Error, OSError, ValueError):
                continue
        processes.sort(key=lambda item: item["memoryBytes"], reverse=True)
        battery = None
        try:
            value = psutil.sensors_battery()
            if value is not None:
                battery = {"percent": float(value.percent), "plugged": bool(value.power_plugged)}
        except (psutil.Error, OSError):
            pass
        return {
            "supported": True,
            "cpuPercent": float(psutil.cpu_percent(interval=None)),
            "memory": {
                "totalBytes": int(memory.total),
                "availableBytes": int(memory.available),
                "usedBytes": int(memory.used),
                "percent": float(memory.percent),
            },
            "processes": processes[:25],
            "battery": battery,
            "gpu": _gpu_snapshot(),
        }
    except (psutil.Error, OSError, ValueError) as error:
        return {"supported": False, "reason": type(error).__name__}


def _classify_process(name: str) -> str:
    lowered = name.lower()
    if lowered in {"system", "system idle process", "smss.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe"}:
        return "protected_system"
    if any(token in lowered for token in ("defender", "securityhealth", "msmpeng", "antimalware")):
        return "security"
    if any(token in lowered for token in ("sara", "myraa", "uvicorn", "python", "node", "electron")):
        return "sara_managed_or_runtime"
    if lowered in {"explorer.exe", "chrome.exe", "msedge.exe", "firefox.exe", "code.exe", "notepad.exe"}:
        return "user_application"
    if re.search(r"\.exe$", lowered):
        return "unknown_application"
    return "unknown"


def _gpu_snapshot() -> Dict[str, Any] | None:
    try:
        import pynvml  # type: ignore
        pynvml.nvmlInit()
        devices = []
        for index in range(pynvml.nvmlDeviceGetCount()):
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)
            utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
            memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
            try:
                temperature = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temperature = None
            devices.append({"index": index, "name": pynvml.nvmlDeviceGetName(handle).decode(errors="replace"), "utilizationPercent": float(utilization.gpu), "memoryUsedBytes": int(memory.used), "memoryTotalBytes": int(memory.total), "temperatureC": temperature})
        return {"supported": True, "devices": devices}
    except Exception:
        return {"supported": False, "reason": "NVIDIA NVML unavailable"}


def _active_window() -> Dict[str, Any]:
    fallback = {"title": None, "application": None, "pid": None}
    if platform.system() != "Windows":
        return fallback
    try:
        import win32gui  # type: ignore
        import win32process  # type: ignore

        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return fallback
        title = win32gui.GetWindowText(hwnd).strip() or None
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        application = None
        if pid and psutil is not None:
            try:
                application = psutil.Process(pid).name()
            except Exception:
                pass
        return {"title": title, "application": application, "pid": pid or None}
    except Exception:
        return fallback


def _visible_applications() -> List[str]:
    if platform.system() != "Windows":
        return []
    if psutil is None:
        return []
    applications: set[str] = set()
    try:
        import win32gui  # type: ignore
        import win32process  # type: ignore

        def visit(hwnd: int, _extra: object) -> bool:
            try:
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                if not win32gui.GetWindowText(hwnd).strip():
                    return True
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                if pid:
                    name = psutil.Process(pid).name()
                    if name:
                        applications.add(name)
            except Exception:
                pass
            return True

        win32gui.EnumWindows(visit, None)
    except Exception:
        return []
    return sorted(applications)[:80]


def _disk_snapshot() -> Dict[str, Any] | None:
    try:
        target = os.environ.get("SystemDrive", "C:") + "\\" if platform.system() == "Windows" else "/"
        usage = psutil.disk_usage(target) if psutil is not None else shutil.disk_usage(target)
        percent_used = float(usage.percent) if psutil is not None else (float(usage.used) / max(1, float(usage.total))) * 100
        return {
            "path": target,
            "freeBytes": int(usage.free),
            "totalBytes": int(usage.total),
            "percentUsed": percent_used,
        }
    except Exception:
        return None


def _drives_snapshot() -> List[Dict[str, Any]]:
    """Report capacity only; never recursively scans drive contents."""
    if psutil is None:
        return []
    drives: List[Dict[str, Any]] = []
    try:
        for partition in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                drives.append({
                    "path": partition.mountpoint,
                    "filesystem": partition.fstype or None,
                    "freeBytes": int(usage.free),
                    "totalBytes": int(usage.total),
                    "percentUsed": float(usage.percent),
                })
            except (psutil.Error, OSError):
                continue
    except (psutil.Error, OSError):
        return []
    return drives[:32]


def _download_snapshot() -> List[Dict[str, Any]]:
    downloads = Path.home() / "Downloads"
    if not downloads.is_dir():
        return []
    cutoff = time.time() - 2 * 86_400
    entries: List[tuple[float, Dict[str, Any]]] = []
    try:
        for item in downloads.iterdir():
            if not item.is_file():
                continue
            try:
                stat = item.stat()
            except OSError:
                continue
            if stat.st_mtime < cutoff:
                continue
            entries.append(
                (
                    stat.st_mtime,
                    {
                        "name": item.name,
                        "path": str(item),
                        "size": int(stat.st_size),
                        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
                        "status": "downloading" if item.suffix.lower() in PARTIAL_DOWNLOAD_SUFFIXES else "complete",
                    },
                )
            )
    except OSError:
        return []
    entries.sort(key=lambda entry: entry[0], reverse=True)
    return [entry for _mtime, entry in entries[:40]]


def _idle_seconds() -> float:
    if platform.system() != "Windows":
        return 0.0
    try:
        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

        info = LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
            return 0.0
        tick = ctypes.windll.kernel32.GetTickCount()
        return max(0.0, (tick - info.dwTime) / 1000.0)
    except Exception:
        return 0.0


__all__ = ["collect_snapshot"]
