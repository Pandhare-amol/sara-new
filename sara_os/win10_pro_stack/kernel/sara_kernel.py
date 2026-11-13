"""
SARA Central Async Kernel (`sara_os/win10_pro_stack/kernel/sara_kernel.py`)
Target: Windows 10/11 Pro (Intel Core i5, 8 GB RAM, 128 MB VRAM)

- SQLite WAL persistent memory (`sara_os.db`: conversations, learned_lessons, reflex_macros, learned_skills)
- Sub-100ms Reflex Macro cache replay before cloud calls
- Gemini API with Real-Time Google Search Grounding (`{"google_search": {}}`)
- Gemini Live API bidirectional 16kHz/24kHz audio + 1 FPS screen streaming with native barge-in
- Smart-default half-task completion (`play_media_smart`, 7-Domain OS tools, Web-to-Work agent)
"""

from __future__ import annotations

import asyncio
import ctypes
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

STACK_DIR = Path(__file__).resolve().parent.parent
if str(STACK_DIR) not in sys.path:
    sys.path.insert(0, str(STACK_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(STACK_DIR / ".env")
except ImportError:
    pass

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FAST_TEXT_MODEL = os.getenv("SARA_FAST_MODEL", "gemini-2.5-flash")
LIVE_AUDIO_MODEL = os.getenv("SARA_LIVE_MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")

# ==============================================================================
# 1. SQLITE PERSISTENT MEMORY (WAL MODE FOR HIGH CONCURRENCY & LOW RAM)
# ==============================================================================
DB_PATH = Path(os.getenv("SARA_DB_PATH", str(STACK_DIR / "sara_os.db")))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(str(DB_PATH), check_same_thread=False)
db.row_factory = sqlite3.Row
db.executescript(
    """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learned_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    mistake TEXT NOT NULL,
    fix_rule TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reflex_macros (
    trigger_phrase TEXT PRIMARY KEY,
    action_json TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learned_skills (
    skill_name TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    file_path TEXT NOT NULL,
    learned_at TEXT NOT NULL
);
"""
)


def log_memory(role: str, content: str) -> None:
    db.execute(
        "INSERT INTO conversations (role, content, timestamp) VALUES (?, ?, ?)",
        (role, content[:4000], datetime.now().isoformat()),
    )
    db.commit()


def record_lesson(topic: str, mistake: str, fix_rule: str) -> None:
    db.execute(
        "INSERT INTO learned_lessons (topic, mistake, fix_rule, created_at) VALUES (?, ?, ?, ?)",
        (topic.lower(), mistake[:500], fix_rule[:500], datetime.now().isoformat()),
    )
    db.commit()


def save_reflex_macro(trigger_phrase: str, action: str, target: str = "") -> None:
    payload = json.dumps({"action": action, "target": target})
    db.execute(
        """INSERT INTO reflex_macros (trigger_phrase, action_json, hit_count, updated_at)
           VALUES (?, ?, 1, ?)
           ON CONFLICT(trigger_phrase) DO UPDATE SET
               action_json=excluded.action_json,
               updated_at=excluded.updated_at""",
        (trigger_phrase.strip().lower(), payload, datetime.now().isoformat()),
    )
    db.commit()


def build_dynamic_system_instruction() -> str:
    lessons = [
        f"- [{r['topic']}] {r['fix_rule']}"
        for r in db.execute("SELECT topic, fix_rule FROM learned_lessons ORDER BY id DESC LIMIT 8")
    ]
    skills = [
        f"- {r['skill_name']}: {r['summary']}"
        for r in db.execute("SELECT skill_name, summary FROM learned_skills LIMIT 12")
    ]
    now_str = datetime.now().strftime("%A, %B %d, %Y %I:%M %p")
    base = (
        f"You are SARA, an autonomous, real-time AI operating layer on Windows 10/11 Pro (i5 / 8 GB RAM). "
        f"Current local date and time: {now_str}.\n"
        "CORE OPERATING RULES:\n"
        "1. ACT FIRST WITH SMART DEFAULTS: Never stall with clarifying questions on incomplete commands. "
        "If the user says 'play an Arijit song', immediately call `play_media_smart` with a top track and confirm in 1 crisp sentence.\n"
        "2. REAL-TIME GROUNDING: Use Google Search whenever asked about live news, weather, prices, scores, or current facts.\n"
        "3. 7-DOMAIN ROUTING: Choose silent OS/PowerShell/ms-settings/.cpl tools first (<5 MB RAM), Playwright Web-to-Work for blogs/forms, and Vision GUI only when visual UI interaction is required.\n"
    )
    if lessons:
        base += "\nPAST LESSONS LEARNED (AVOID REPEATING):\n" + "\n".join(lessons) + "\n"
    if skills:
        base += "\nREGISTERED CUSTOM SKILLS:\n" + "\n".join(skills) + "\n"
    return base


# ==============================================================================
# 2. LAZY-LOADED WINDOWS 10/11 EXECUTION TOOLS
# ==============================================================================
def get_live_system_telemetry() -> str:
    """Returns real-time CPU, RAM, disk, and battery metrics."""
    if psutil is None:
        return json.dumps({"status": "psutil_unavailable"})
    vm = psutil.virtual_memory()
    root_mount = "C:\\" if os.name == "nt" else "/"
    disk = psutil.disk_usage(root_mount)
    bat = psutil.sensors_battery() if hasattr(psutil, "sensors_battery") else None
    return json.dumps(
        {
            "cpu_percent": psutil.cpu_percent(interval=0.05),
            "ram_used_gb": round(vm.used / (1024**3), 2),
            "ram_available_gb": round(vm.available / (1024**3), 2),
            "ram_percent": vm.percent,
            "drive_free_gb": round(disk.free / (1024**3), 1),
            "battery_percent": bat.percent if bat else "Desktop AC",
        }
    )


def control_windows_system(action: str, target: str = "") -> str:
    """Executes fast OS, Settings, Control Panel, Process, and App actions."""
    vk_map = {"mute": 0xAD, "volume_down": 0xAE, "volume_up": 0xAF, "play_pause": 0xB3}
    try:
        if action in vk_map:
            if os.name == "nt":
                vk = vk_map[action]
                steps = 5 if action in ("volume_up", "volume_down") else 1
                for _ in range(steps):
                    ctypes.windll.user32.keybd_event(vk, 0, 0, 0)
                    ctypes.windll.user32.keybd_event(vk, 0, 2, 0)
            return f"Executed media key: {action}"

        if action == "lock_pc":
            if os.name == "nt":
                ctypes.windll.user32.LockWorkStation()
            return "Workstation locked."

        if action == "open_app":
            app_aliases = {
                "vscode": "code",
                "chrome": "start chrome",
                "terminal": "start wt",
                "explorer": "explorer",
                "notepad": "notepad",
                "calc": "calc",
            }
            cmd = app_aliases.get(target.lower(), f"start {target}")
            if os.name == "nt":
                subprocess.Popen(cmd, shell=True)
            return f"Launched {target}."

        if action == "close_app":
            exe = target if target.lower().endswith(".exe") else f"{target}.exe"
            if os.name == "nt":
                subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True)
            return f"Terminated {exe}."

        if action == "open_setting":
            uri = target if target.startswith("ms-settings:") else f"ms-settings:{target}"
            if os.name == "nt" and hasattr(os, "startfile"):
                os.startfile(uri)  # type: ignore[attr-defined]
            return f"Opened Windows Settings: {uri}"

        if action == "open_cpl":
            if os.name == "nt":
                subprocess.Popen(["control.exe", target])
            return f"Opened Control Panel applet: {target}"

        if action == "run_ps":
            blocked = ("format ", "del /s", "rmdir /s", "remove-item -recurse -force c:\\")
            if any(b in target.lower() for b in blocked):
                return "Blocked destructive command pending explicit user confirmation."
            if os.name == "nt":
                proc = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", target],
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
            else:
                proc = subprocess.run(["/bin/sh", "-c", target], capture_output=True, text=True, timeout=15)
            if proc.returncode != 0:
                record_lesson("shell", proc.stderr, f"Check syntax/permissions for: {target}")
            return (proc.stdout or proc.stderr or "Command executed.").strip()[:2000]

        return f"Unsupported action: {action}"
    except Exception as exc:
        record_lesson(action, str(exc), f"Handle exception in control_windows_system({action}, {target})")
        return f"Error executing {action}: {exc}"


def play_media_smart(query: str) -> str:
    """Completes vague media requests immediately without asking clarifying questions."""
    music_dir = Path.home() / "Music"
    if music_dir.exists():
        tokens = [w for w in query.lower().split() if len(w) > 2]
        for mp3 in music_dir.glob("*.mp3"):
            if any(t in mp3.stem.lower() for t in tokens):
                if os.name == "nt" and hasattr(os, "startfile"):
                    os.startfile(str(mp3))  # type: ignore[attr-defined]
                return f"Playing local track '{mp3.name}'."

    search_url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(query)
    if os.getenv("SARA_ENV") != "sandbox":
        try:
            req = urllib.request.Request(search_url, headers={"User-Agent": "Mozilla/5.0"})
            html = urllib.request.urlopen(req, timeout=5).read().decode("utf-8", errors="ignore")
            vids = re.findall(r"watch\?v=([A-Za-z0-9_-]{11})", html)
            if vids:
                play_url = f"https://www.youtube.com/watch?v={vids[0]}&autoplay=1"
                if os.name == "nt":
                    webbrowser.open(play_url)
                return f"Auto-playing '{query}' on YouTube ({play_url})."
        except Exception:
            pass
    if os.name == "nt" and os.getenv("SARA_ENV") != "sandbox":
        webbrowser.open(search_url)
    return f"Auto-resolved smart media playback for '{query}' -> {search_url}"


def run_learned_or_web_task(directive: str) -> str:
    """Delegates browser blog-learning, form-filling, or self-trained skills lazily."""
    from actions.web_agent import execute_web_to_work_task

    return json.dumps(execute_web_to_work_task(directive))


def _get_genai_client() -> Any:
    from google import genai

    return genai.Client(api_key=GEMINI_API_KEY, http_options={"api_version": "v1beta"})


def execute_text_command(command: str, use_search: bool = True) -> str:
    """Executes via <100ms Reflex Macro cache first, then Gemini + Google Search Grounding."""
    row = db.execute(
        "SELECT action_json FROM reflex_macros WHERE trigger_phrase = ?",
        (command.strip().lower(),),
    ).fetchone()
    if row:
        macro = json.loads(row["action_json"])
        db.execute(
            "UPDATE reflex_macros SET hit_count = hit_count + 1, updated_at = ? WHERE trigger_phrase = ?",
            (datetime.now().isoformat(), command.strip().lower()),
        )
        db.commit()
        return control_windows_system(macro["action"], macro.get("target", ""))

    log_memory("user", command)
    if not GEMINI_API_KEY:
        return f"[Offline Kernel Ready] Logged directive: {command}"

    from google.genai import types

    client = _get_genai_client()
    from actions.full_os_controller import run_autonomous_os_goal

    tools_list: list[Any] = [
        get_live_system_telemetry,
        control_windows_system,
        play_media_smart,
        run_learned_or_web_task,
        run_autonomous_os_goal,
    ]
    if use_search:
        tools_list.append({"google_search": {}})

    resp = client.models.generate_content(
        model=FAST_TEXT_MODEL,
        contents=command,
        config=types.GenerateContentConfig(
            system_instruction=build_dynamic_system_instruction(),
            tools=tools_list,
            temperature=0.2,
        ),
    )
    reply = resp.text or "Action completed."
    log_memory("sara", reply)
    return reply


def _capture_screen_jpeg_low_ram() -> bytes:
    """Lazy-imports mss/PIL only when 1 FPS screen-watch is active."""
    import mss
    from PIL import Image

    with mss.mss() as sct:
        raw = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
        img.thumbnail((1024, 576))
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=65)
        return buf.getvalue()


def create_fastapi_app() -> Any:
    """Lazy-constructs the FastAPI + `/ws/live` Gemini Live duplex hub."""
    from fastapi import FastAPI, WebSocket, WebSocketDisconnect
    from pydantic import BaseModel

    app = FastAPI(title="SARA Core Kernel", version="2.5")

    class CommandRequest(BaseModel):
        command: str
        use_search: bool = True

    @app.get("/health")
    async def health_check() -> dict:
        if psutil is None:
            return {"status": "online"}
        vm = psutil.virtual_memory()
        return {
            "status": "online",
            "ram_used_gb": round(vm.used / (1024**3), 2),
            "ram_free_gb": round(vm.available / (1024**3), 2),
            "cpu_pct": psutil.cpu_percent(interval=0.05),
        }

    @app.post("/api/command")
    async def api_command(req: CommandRequest) -> dict:
        reply = await asyncio.to_thread(execute_text_command, req.command, req.use_search)
        return {"reply": reply}

    @app.websocket("/ws/live")
    async def gemini_live_duplex_bridge(ws: WebSocket) -> None:
        from google.genai import types

        await ws.accept()
        client = _get_genai_client()
        live_config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=types.Content(
                parts=[types.Part.from_text(text=build_dynamic_system_instruction())]
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede")
                )
            ),
            tools=[
                {"google_search": {}},
                {
                    "function_declarations": [
                        types.FunctionDeclaration(
                            name="control_windows_system",
                            description="Control Windows 10/11 apps, volume, settings, Control Panel, or PowerShell.",
                            parameters=types.Schema(
                                type="OBJECT",
                                properties={
                                    "action": types.Schema(type="STRING"),
                                    "target": types.Schema(type="STRING"),
                                },
                                required=["action"],
                            ),
                        ),
                        types.FunctionDeclaration(
                            name="play_media_smart",
                            description="Immediately search and play any song or video on YouTube or local Music.",
                            parameters=types.Schema(
                                type="OBJECT",
                                properties={"query": types.Schema(type="STRING")},
                                required=["query"],
                            ),
                        ),
                        types.FunctionDeclaration(
                            name="get_live_system_telemetry",
                            description="Get current Windows CPU, RAM, and disk usage.",
                            parameters=types.Schema(type="OBJECT", properties={}),
                        ),
                    ]
                },
            ],
        )

        tool_registry = {
            "control_windows_system": control_windows_system,
            "play_media_smart": play_media_smart,
            "get_live_system_telemetry": get_live_system_telemetry,
        }

        async with client.aio.live.connect(model=LIVE_AUDIO_MODEL, config=live_config) as session:

            async def forward_client_to_gemini() -> None:
                try:
                    while True:
                        msg = await ws.receive()
                        if msg.get("bytes"):
                            await session.send_realtime_input(
                                audio=types.Blob(data=msg["bytes"], mime_type="audio/pcm;rate=16000")
                            )
                        elif msg.get("text"):
                            payload = json.loads(msg["text"])
                            if payload.get("type") == "text":
                                await session.send_client_content(
                                    turns=types.Content(
                                        role="user",
                                        parts=[types.Part.from_text(text=payload["data"])],
                                    )
                                )
                            elif payload.get("type") == "screen_frame":
                                jpg = await asyncio.to_thread(_capture_screen_jpeg_low_ram)
                                await session.send_realtime_input(
                                    video=types.Blob(data=jpg, mime_type="image/jpeg")
                                )
                except WebSocketDisconnect:
                    pass

            async def forward_gemini_to_client() -> None:
                async for response in session.receive():
                    server_content = response.server_content
                    if server_content and server_content.model_turn:
                        for part in server_content.model_turn.parts:
                            if part.inline_data and part.inline_data.data:
                                await ws.send_bytes(part.inline_data.data)
                            if part.text:
                                await ws.send_text(json.dumps({"type": "transcript", "text": part.text}))
                    if server_content and server_content.interrupted:
                        await ws.send_text(json.dumps({"type": "interrupted"}))
                    if response.tool_call:
                        fn_responses = []
                        for fc in response.tool_call.function_calls:
                            fn = tool_registry.get(fc.name)
                            result = await asyncio.to_thread(fn, **(fc.args or {})) if fn else "Unknown tool"
                            fn_responses.append(
                                types.FunctionResponse(name=fc.name, id=fc.id, response={"result": result})
                            )
                        await session.send_tool_response(function_responses=fn_responses)

            await asyncio.gather(forward_client_to_gemini(), forward_gemini_to_client())

    return app


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("SARA_KERNEL_PORT", "8765"))
    uvicorn.run(create_fastapi_app(), host="127.0.0.1", port=port, log_level="warning", workers=1)
