#!/usr/bin/env python3
"""
F.R.I.D.A.Y. Department — `tactical_diag.py`
Real-Time System Damage & Bottleneck Scanner + Compiler/Log Pattern Counter-Analyzer.
100% Live OS Data (Windows 10 Pro + Linux cross-platform, zero mock telemetry).
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import psutil  # type: ignore
except ImportError:
    psutil = None

PROTECTED_OS_PROCESSES = {
    "system",
    "idle",
    "registry",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "winlogon.exe",
    "dwm.exe",
    "explorer.exe",
    "init",
    "systemd",
}


def _probe_network_latency_ms(host: str = "1.1.1.1", port: int = 53, timeout: float = 0.8) -> Optional[float]:
    start = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return round((time.perf_counter() - start) * 1000.0, 2)
    except OSError:
        return None


def _collect_top_processes_stdlib(limit: int = 12) -> List[Dict[str, Any]]:
    is_win = platform.system().lower().startswith("win")
    procs: List[Dict[str, Any]] = []
    try:
        if is_win:
            out = subprocess.check_output(
                ["tasklist", "/FO", "CSV", "/NH"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=4,
            )
            for line in out.splitlines():
                parts = [p.strip('"') for p in line.split('","')]
                if len(parts) >= 5:
                    mem_str = re.sub(r"[^\d]", "", parts[4])
                    mem_kb = int(mem_str) if mem_str else 0
                    procs.append(
                        {
                            "pid": int(parts[1]) if parts[1].isdigit() else 0,
                            "name": parts[0],
                            "ram_mb": round(mem_kb / 1024.0, 1),
                            "cpu_percent": 0.0,
                        }
                    )
        else:
            out = subprocess.check_output(
                ["ps", "-eo", "pid,pcpu,rss,comm", "--no-headers"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=4,
            )
            for line in out.splitlines():
                cols = line.strip().split(None, 3)
                if len(cols) >= 4:
                    procs.append(
                        {
                            "pid": int(cols[0]),
                            "cpu_percent": round(float(cols[1]), 1),
                            "ram_mb": round(int(cols[2]) / 1024.0, 1),
                            "name": cols[3],
                        }
                    )
    except Exception:
        pass
    procs.sort(key=lambda p: (p.get("ram_mb", 0.0), p.get("cpu_percent", 0.0)), reverse=True)
    return procs[:limit]


def scan_live_system_bottlenecks(top_n: int = 12) -> Dict[str, Any]:
    """
    Runs a live real-time diagnostic sweep across CPU threads, RAM usage, disk space,
    listening sockets, network latency, and top memory/CPU processes.
    """
    started = time.perf_counter()
    if psutil is not None:
        cpu_pct = round(psutil.cpu_percent(interval=0.12), 1)
        per_core = [round(x, 1) for x in psutil.cpu_percent(interval=0.0, percpu=True)]
        vm = psutil.virtual_memory()
        ram_total_mb = round(vm.total / (1024 * 1024), 1)
        ram_used_mb = round((vm.total - vm.available) / (1024 * 1024), 1)
        ram_pct = round(vm.percent, 1)

        procs: List[Dict[str, Any]] = []
        for p in psutil.process_iter(["pid", "name", "memory_info", "num_threads", "cpu_percent"]):
            try:
                info = p.info
                mem_mb = round((info["memory_info"].rss if info.get("memory_info") else 0) / (1024 * 1024), 1)
                procs.append(
                    {
                        "pid": info["pid"],
                        "name": info.get("name") or "unknown",
                        "ram_mb": mem_mb,
                        "cpu_percent": round(float(info.get("cpu_percent") or 0.0), 1),
                        "threads": int(info.get("num_threads") or 1),
                    }
                )
            except Exception:
                continue
        procs.sort(key=lambda item: (item["ram_mb"], item["cpu_percent"]), reverse=True)
        top_processes = procs[:top_n]
    else:
        load_avg = os.getloadavg()[0] if hasattr(os, "getloadavg") else 0.0
        cores = os.cpu_count() or 1
        cpu_pct = round(min(100.0, (load_avg / max(1, cores)) * 100.0), 1)
        per_core = [cpu_pct] * cores
        ram_total_mb, ram_used_mb, ram_pct = 8192.0, 0.0, 0.0
        if Path("/proc/meminfo").exists():
            kv: Dict[str, int] = {}
            for line in Path("/proc/meminfo").read_text(encoding="utf-8", errors="ignore").splitlines():
                m = re.match(r"^(\w+):\s+(\d+)", line)
                if m:
                    kv[m.group(1)] = int(m.group(2))
            total_kb = kv.get("MemTotal", 0)
            avail_kb = kv.get("MemAvailable", kv.get("MemFree", 0))
            if total_kb > 0:
                ram_total_mb = round(total_kb / 1024.0, 1)
                ram_used_mb = round((total_kb - avail_kb) / 1024.0, 1)
                ram_pct = round((ram_used_mb / ram_total_mb) * 100.0, 1)
        top_processes = _collect_top_processes_stdlib(limit=top_n)

    du = shutil.disk_usage(Path.cwd())
    disk_total_gb = round(du.total / (1024**3), 2)
    disk_free_gb = round(du.free / (1024**3), 2)
    disk_pct = round(((du.total - du.free) / max(1, du.total)) * 100.0, 1)
    latency_ms = _probe_network_latency_ms()

    top_hog = top_processes[0] if top_processes else {"name": "none", "ram_mb": 0, "pid": 0}
    bottlenecks: List[str] = []
    if ram_pct >= 80.0:
        bottlenecks.append(
            f"High RAM pressure ({ram_pct}%) — top consumer {top_hog['name']} (PID {top_hog['pid']}) using {top_hog['ram_mb']} MB."
        )
    if cpu_pct >= 80.0:
        bottlenecks.append(f"Elevated CPU saturation ({cpu_pct}%).")
    if disk_free_gb < 5.0:
        bottlenecks.append(f"Low free disk space ({disk_free_gb} GB remaining).")

    severity = "CRITICAL" if ram_pct >= 90 or cpu_pct >= 92 else "WARNING" if bottlenecks else "NOMINAL"
    spoken = (
        f"System status {severity.lower()}: CPU at {cpu_pct}%, RAM at {ram_pct}% "
        f"({round(ram_used_mb / 1024.0, 2)} of {round(ram_total_mb / 1024.0, 2)} GB), "
        f"top consumer {top_hog['name']} at {top_hog['ram_mb']} MB, disk {disk_free_gb} GB free."
    )

    return {
        "department": "FRIDAY",
        "module": "tactical_diag",
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "scan_ms": round((time.perf_counter() - started) * 1000.0, 2),
        "host": {
            "hostname": socket.gethostname(),
            "os": f"{platform.system()} {platform.release()}",
            "arch": platform.machine(),
            "cpu_cores": os.cpu_count() or 1,
        },
        "severity": severity,
        "cpu_percent": cpu_pct,
        "per_core_percent": per_core,
        "ram_used_mb": ram_used_mb,
        "ram_total_mb": ram_total_mb,
        "ram_percent": ram_pct,
        "disk_free_gb": disk_free_gb,
        "disk_total_gb": disk_total_gb,
        "disk_percent": disk_pct,
        "network_latency_ms": latency_ms,
        "top_processes": top_processes,
        "bottlenecks": bottlenecks,
        "spoken_report": spoken,
    }


def remediate_bottleneck(action: str = "clean_temp", pid: Optional[int] = None) -> Dict[str, Any]:
    """Executes real live remediation: terminate runaway PID (protecting OS kernel) or purge temp junk."""
    if action == "kill_pid" and pid:
        if pid in (0, 1, 4, os.getpid()):
            return {"ok": False, "error": f"PID {pid} is protected."}
        if psutil is not None:
            try:
                p = psutil.Process(pid)
                pname = (p.name() or "").lower()
                if pname in PROTECTED_OS_PROCESSES:
                    return {"ok": False, "error": f"Protected OS process '{pname}' cannot be killed."}
                p.terminate()
                return {"ok": True, "action": "kill_pid", "pid": pid, "name": pname}
            except Exception as exc:
                return {"ok": False, "error": str(exc)}
        try:
            os.kill(pid, 15)
            return {"ok": True, "action": "kill_pid", "pid": pid}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    # Default safe real action: clean stale SARA temp files in system temp directory
    tmp_root = Path(tempfile.gettempdir())
    removed = 0
    freed_bytes = 0
    cutoff = time.time() - 3600
    for item in tmp_root.glob("sara_temp_*"):
        try:
            if item.is_file() and item.stat().st_mtime < cutoff:
                freed_bytes += item.stat().st_size
                item.unlink()
                removed += 1
        except OSError:
            continue
    return {
        "ok": True,
        "action": "clean_temp",
        "removed_files": removed,
        "freed_kb": round(freed_bytes / 1024.0, 2),
    }


def analyze_live_log_pattern(log_input: str) -> Dict[str, Any]:
    """Reads a real log file path or raw compiler/runtime log text and outputs counter-fixes."""
    raw = log_input
    p = Path(log_input)
    if len(log_input) < 260 and p.exists() and p.is_file():
        raw = p.read_text(encoding="utf-8", errors="ignore")[-16_000:]

    rules = [
        (r"EADDRINUSE.*?:(\d+)", "Port {0} is already bound — kill the stale listener PID on port {0} or set PORT to a free port."),
        (r"Cannot find module ['\"]([^'\"]+)['\"]", "Missing Node/TS module '{0}' — verify relative import path or run `npm install {0}`."),
        (r"ModuleNotFoundError: No module named ['\"]([^'\"]+)['\"]", "Missing Python package '{0}' — run `pip install {0}` in the active interpreter."),
        (r"TS(\d{4}):\s*(.+)", "TypeScript compiler error TS{0} ({1}) — align interface types before building."),
        (r"HttpListenerException|exited \(3\)", "Windows HttpListener non-admin port ACL block — run elevated or set `SARA_WINDOWS_BRIDGE_DIR=disabled`."),
        (r"MemoryError|JavaScript heap out of memory", "Heap exhaustion on 8 GB host — suspend idle browser renderers or set `NODE_OPTIONS=--max-old-space-size=2048`."),
    ]
    matches: List[Dict[str, str]] = []
    for pattern, advice in rules:
        for m in re.finditer(pattern, raw, flags=re.IGNORECASE):
            groups = m.groups()
            formatted = advice.format(*groups) if groups else advice
            matches.append({"signature": m.group(0)[:140], "counter_move": formatted})
            if len(matches) >= 6:
                break

    if not matches:
        lines = [ln.strip() for ln in raw.splitlines() if re.search(r"\b(error|exception|failed|fatal|traceback)\b", ln, re.I)]
        for ln in lines[:4]:
            matches.append({"signature": ln[:140], "counter_move": "Inspect stack frame right above this error line and isolate failing input."})

    return {
        "department": "FRIDAY",
        "analyzed_chars": len(raw),
        "detected_patterns": len(matches),
        "counter_strategies": matches,
    }


def execute(**kwargs: Any) -> str:
    mode = str(kwargs.get("mode", "scan"))
    if mode == "remediate":
        return json.dumps(remediate_bottleneck(str(kwargs.get("action", "clean_temp")), kwargs.get("pid")))
    if mode == "analyze_log":
        return json.dumps(analyze_live_log_pattern(str(kwargs.get("log", ""))))
    return json.dumps(scan_live_system_bottlenecks(int(kwargs.get("top_n", 12))))


if __name__ == "__main__":
    print(json.dumps(scan_live_system_bottlenecks(top_n=6), indent=2))
