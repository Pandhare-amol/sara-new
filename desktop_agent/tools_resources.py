"""Explicitly allowlisted, identity-checked resource observation & cleanup."""
from __future__ import annotations

import os
import time
from typing import Any, Dict, List

from .registry import ToolError, register

PROTECTED = {
    "system",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "winlogon.exe",
    "explorer.exe",
    "dwm.exe",
    "svchost.exe",
}
SECURITY_MARKERS = ("defender", "securityhealth", "msmpeng", "antimalware")


@register("getResourceSnapshot")
def get_resource_snapshot(_args: Dict[str, Any]) -> Dict[str, Any]:
    """Return live CPU, RAM, and process count metrics via psutil."""
    try:
        import psutil
    except ImportError as error:
        raise ToolError("Resource snapshot is unavailable because psutil is missing.") from error
    cpu_percent = float(psutil.cpu_percent(interval=0.1))
    vm = psutil.virtual_memory()
    return {
        "cpu_percent": round(cpu_percent, 1),
        "ram_used_mb": round(float(vm.used) / (1024 * 1024)),
        "ram_total_mb": round(float(vm.total) / (1024 * 1024)),
        "ram_percent": round(float(vm.percent), 1),
        "process_count": len(psutil.pids()),
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@register("listResourceProcesses")
def list_resource_processes(args: Dict[str, Any]) -> Dict[str, Any]:
    """List top memory-consuming processes with identity fields required for safe cleanup."""
    try:
        import psutil
    except ImportError as error:
        raise ToolError("Process listing is unavailable because psutil is missing.") from error
    limit = max(1, min(200, int(args.get("limit") or 40)))
    rows: List[Dict[str, Any]] = []
    for proc in psutil.process_iter(["pid", "name", "exe", "create_time", "memory_info"]):
        try:
            info = proc.info
            mem_info = info.get("memory_info")
            rss_mb = float(mem_info.rss) / (1024 * 1024) if mem_info is not None else 0.0
            rows.append(
                {
                    "pid": int(info.get("pid") or 0),
                    "name": str(info.get("name") or ""),
                    "executablePath": str(info.get("exe") or ""),
                    "startedAt": float(info.get("create_time") or 0.0),
                    "memory_mb": round(rss_mb, 1),
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, OSError, ValueError):
            continue
    rows.sort(key=lambda item: float(item.get("memory_mb") or 0.0), reverse=True)
    return {"processes": rows[:limit], "total_sampled": len(rows)}


@register("cleanupAllowlistedProcess")
def cleanup_allowlisted_process(args: Dict[str, Any]) -> Dict[str, Any]:
    """Gracefully stop one exact, explicitly allowlisted process.

    The caller must provide pid, executable name/path, and a start time captured
    during observation. A name-only request is intentionally rejected.
    """
    if str(os.environ.get("SARA_ENV", "")).strip().lower() == "sandbox":
        pid = int(args.get("pid") or 0)
        expected_name = str(args.get("name") or args.get("process_name") or "").strip()
        return {
            "result": f"[SANDBOX SIMULATION] Simulated graceful cleanup of allowlisted process {expected_name} (pid {pid}).",
            "pid": pid,
            "freed_mb": 0,
            "simulated": True,
            "verified": True,
        }
    try:
        import psutil
    except ImportError as error:
        raise ToolError("Process cleanup is unavailable because psutil is missing.") from error
    pid = int(args.get("pid") or 0)
    expected_name = str(args.get("name") or args.get("process_name") or "").strip().lower()
    expected_path = str(args.get("executablePath") or "").strip().lower()
    expected_started = float(args.get("startedAt") or 0)
    allowlisted = args.get("allowlisted") is True
    if not pid or not expected_name or not expected_started or not allowlisted:
        raise ToolError("Cleanup requires an explicit allowlist entry and pid, name, executablePath, and startedAt identity.")
    try:
        process = psutil.Process(pid)
        current_name = (process.name() or "").lower()
        current_path = (process.exe() or "").lower()
        current_started = float(process.create_time())
        rss_before_mb = round(float(process.memory_info().rss) / (1024 * 1024), 1)
        if current_name in PROTECTED or any(marker in current_name for marker in SECURITY_MARKERS):
            raise ToolError("Protected or security processes cannot be cleaned up.")
        if current_name != expected_name or (expected_path and current_path != expected_path) or abs(current_started - expected_started) > 2:
            raise ToolError("Process identity changed since observation; cleanup aborted.")
        process.terminate()
        try:
            process.wait(timeout=5)
        except psutil.TimeoutExpired:
            raise ToolError("Process did not exit gracefully; force termination was not authorized.")
        return {
            "result": f"Gracefully stopped allowlisted process {current_name} (pid {pid}).",
            "pid": pid,
            "freed_mb": rss_before_mb,
            "verified": True,
        }
    except psutil.NoSuchProcess as error:
        raise ToolError("The observed process no longer exists; cleanup skipped.") from error
    except psutil.AccessDenied as error:
        raise ToolError("Windows denied cleanup of this process; it was left running.") from error


__all__ = ["get_resource_snapshot", "list_resource_processes", "cleanup_allowlisted_process"]
