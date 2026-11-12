#!/usr/bin/env python3
"""
Windows 10 Pro Hardware & OS Spoke Node (`win10_node.py`)
Connects to `sara_kernel.py` (`ws://127.0.0.1:8765/ws/win10_pc/desktop`)
and executes low-RAM OS actions (apps, process cleanup, Gemini screen vision, power).
"""

import asyncio
import ctypes
import json
import os
import subprocess
from io import BytesIO
from pathlib import Path

import psutil
import websockets
from dotenv import load_dotenv

load_dotenv()

KERNEL_URL = os.getenv("SARA_KERNEL_WS", "ws://127.0.0.1:8765/ws/win10_pc/desktop")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()

PROTECTED_PROCESSES = {
    "system",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "services.exe",
    "lsass.exe",
    "winlogon.exe",
    "explorer.exe",
    "dwm.exe",
}


def analyze_current_screen(question: str = "Describe what is on screen and identify any errors.") -> str:
    """Captures the Windows 10 screen at 720p JPEG and analyzes via Gemini Vision."""
    try:
        import mss
        from PIL import Image
        from google import genai
        from google.genai import types

        if not GEMINI_KEY:
            return "GEMINI_API_KEY not set for screen vision."

        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            raw = sct.grab(monitor)
            img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
            img.thumbnail((1280, 720))
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=75)

        client = genai.Client(api_key=GEMINI_KEY)
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"),
                question,
            ],
        )
        return resp.text or "No visual anomalies detected."
    except Exception as exc:
        return f"Screen capture unavailable: {exc}"


def run_os_command(command: str, params: dict) -> dict:
    if command == "system_health":
        top_procs = sorted(
            [
                (p.info["name"], p.info["memory_percent"])
                for p in psutil.process_iter(["name", "memory_percent"])
            ],
            key=lambda x: x[1] or 0,
            reverse=True,
        )[:5]
        vm = psutil.virtual_memory()
        return {
            "cpu_percent": psutil.cpu_percent(interval=0.2),
            "ram_used_gb": round(vm.used / (1024**3), 2),
            "ram_total_gb": round(vm.total / (1024**3), 2),
            "ram_percent": vm.percent,
            "top_ram_processes": [{"name": n, "ram_pct": round(m or 0, 1)} for n, m in top_procs],
        }

    if command == "open_app":
        apps = {
            "vscode": "code",
            "chrome": "start chrome",
            "terminal": "start wt || start cmd",
            "explorer": "explorer",
            "notepad": "notepad",
            "calculator": "calc",
        }
        app_key = str(params.get("app", "")).lower().strip()
        target = apps.get(app_key)
        if not target:
            return {"error": f"Unknown app: {app_key}"}
        subprocess.Popen(target, shell=True)
        return {"status": f"Launched {app_key}"}

    if command == "kill_process":
        proc_name = str(params.get("process_name", "")).strip()
        if not proc_name:
            return {"error": "No process_name provided"}
        if proc_name.lower() in PROTECTED_PROCESSES:
            return {"error": f"Protected Windows process '{proc_name}' cannot be killed"}
        if os.name == "nt":
            res = subprocess.run(["taskkill", "/F", "/IM", proc_name], capture_output=True, text=True)
        else:
            res = subprocess.run(["pkill", "-f", proc_name], capture_output=True, text=True)
        return {"stdout": res.stdout.strip(), "stderr": res.stderr.strip()}

    if command == "run_command":
        cmd = str(params.get("cmd", "")).strip()
        res = subprocess.run(
            cmd,
            shell=True,
            cwd=str(Path.home()),
            capture_output=True,
            text=True,
            timeout=12,
        )
        return {
            "returncode": res.returncode,
            "stdout": res.stdout[-1200:],
            "stderr": res.stderr[-1200:],
        }

    if command == "capture_screen":
        return {"screen_analysis": analyze_current_screen(params.get("question", "Describe what is open on screen."))}

    if command == "pc_power":
        action = str(params.get("action", "lock")).lower()
        if action == "lock" and os.name == "nt":
            ctypes.windll.user32.LockWorkStation()
            return {"status": "Workstation locked"}
        if action == "sleep" and os.name == "nt":
            os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
            return {"status": "Entering sleep mode"}
        return {"status": f"Power action '{action}' simulated off-Windows"}

    return {"error": f"Unsupported command: {command}"}


async def node_loop() -> None:
    while True:
        try:
            async with websockets.connect(KERNEL_URL) as ws:
                await ws.send(
                    json.dumps(
                        {
                            "type": "REGISTER",
                            "capabilities": [
                                "system_health",
                                "open_app",
                                "kill_process",
                                "run_command",
                                "capture_screen",
                                "pc_power",
                            ],
                        }
                    )
                )
                print("[win10_pc] Connected to SARA Central Operating Layer.")
                async for raw_msg in ws:
                    msg = json.loads(raw_msg)
                    if msg.get("type") == "EXECUTE":
                        result = await asyncio.to_thread(
                            run_os_command, msg["command"], msg.get("params", {})
                        )
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "RESULT",
                                    "req_id": msg["req_id"],
                                    "data": result,
                                }
                            )
                        )
        except Exception as exc:
            print(f"[win10_pc] Reconnecting to kernel in 3s... ({exc})")
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(node_loop())
