"""Explicitly allowlisted, identity-checked resource cleanup."""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict

from .registry import ToolError, register

PROTECTED = {"system", "smss.exe", "csrss.exe", "wininit.exe", "services.exe", "lsass.exe", "winlogon.exe"}
SECURITY_MARKERS = ("defender", "securityhealth", "msmpeng", "antimalware")


@register("cleanupAllowlistedProcess")
def cleanup_allowlisted_process(args: Dict[str, Any]) -> Dict[str, Any]:
    """Gracefully stop one exact, explicitly allowlisted process.

    The caller must provide pid, executable name/path, and a start time captured
    during observation. A name-only request is intentionally rejected.
    """
    try:
        import psutil
    except ImportError as error:
        raise ToolError("Process cleanup is unavailable because psutil is missing.") from error
    pid = int(args.get("pid") or 0)
    expected_name = str(args.get("name") or "").strip().lower()
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
        if current_name in PROTECTED or any(marker in current_name for marker in SECURITY_MARKERS):
            raise ToolError("Protected or security processes cannot be cleaned up.")
        if current_name != expected_name or (expected_path and current_path != expected_path) or abs(current_started - expected_started) > 2:
            raise ToolError("Process identity changed since observation; cleanup aborted.")
        process.terminate()
        try:
            process.wait(timeout=5)
        except psutil.TimeoutExpired:
            raise ToolError("Process did not exit gracefully; force termination was not authorized.")
        return {"result": f"Gracefully stopped allowlisted process {current_name} (pid {pid}).", "pid": pid, "verified": True}
    except psutil.NoSuchProcess as error:
        raise ToolError("The observed process no longer exists; cleanup skipped.") from error
    except psutil.AccessDenied as error:
        raise ToolError("Windows denied cleanup of this process; it was left running.") from error


__all__ = ["cleanup_allowlisted_process"]
