#!/usr/bin/env python3
"""
SARA Central Operating Layer — Event-Driven Hub-and-Spoke Microkernel
Target: Windows 10 Pro (Intel Core i5 / 8 GB RAM) — < 65 MB RAM footprint.
Cloud Brain: Google Gemini (`gemini-2.5-flash` via `google-genai`), Zero Ollama, Zero Supabase.
"""

import asyncio
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

import psutil
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from core.idle_trainer import autonomous_idle_study_loop
from core.skill_loader import list_mastered_skills, run_or_learn_skill
from core.smart_executor import check_active_environment, open_project_workspace, play_music
from core.three_layer_control import (
    layer1_shell_execute,
    layer2_uia_click,
    layer3_vision_see_think_act_verify,
)
from core.vision_phase_and_gestures import set_win32_phase_mode
from departments import (
    GLOBAL_RING_BUFFER,
    assemble_and_ship_pipeline,
    build_instant_dossier,
    generate_live_project_diagram,
    scan_live_system_bottlenecks,
    scan_local_ports_and_services,
    switch_workspace_mode,
)

load_dotenv()

BASE_DIR = Path(os.getenv("SARA_OS_DIR", Path(__file__).resolve().parent))
BASE_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = BASE_DIR / "sara_os.db"

app = FastAPI(title="SARA Central Operating Layer")

# Optional Gemini Cloud Brain (degrades cleanly for offline local node tests)
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()
ai_client = None
types_mod = None
if GEMINI_KEY:
    try:
        from google import genai
        from google.genai import types as _types

        ai_client = genai.Client(api_key=GEMINI_KEY)
        types_mod = _types
    except Exception:
        ai_client = None

# Lightweight SQLite WAL State & Event Bus (< 5 MB RAM)
conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA journal_mode=WAL;")
conn.executescript(
    """
CREATE TABLE IF NOT EXISTS nodes (
    node_id TEXT PRIMARY KEY,
    node_type TEXT,
    capabilities TEXT,
    status TEXT,
    last_seen TEXT
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT,
    action TEXT,
    details TEXT,
    created_at TEXT
);
"""
)

ACTIVE_NODES: Dict[str, WebSocket] = {}
PENDING_CALLS: Dict[str, asyncio.Future] = {}


def record_audit(source: str, action: str, details: Any) -> None:
    conn.execute(
        "INSERT INTO audit_log (source, action, details, created_at) VALUES (?, ?, ?, ?)",
        (source, action, json.dumps(details), datetime.now().isoformat()),
    )
    conn.commit()


def get_system_status() -> str:
    """Inspect host Windows 10 Pro telemetry and all connected hardware/software nodes."""
    nodes = [dict(r) for r in conn.execute("SELECT * FROM nodes").fetchall()]
    vm = psutil.virtual_memory()
    return json.dumps(
        {
            "host_os": "Windows 10 Pro (i5 / 8 GB Profile)",
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "ram_used_gb": round(vm.used / (1024**3), 2),
            "ram_total_gb": round(vm.total / (1024**3), 2),
            "ram_percent": vm.percent,
            "online_nodes": list(ACTIVE_NODES.keys()),
            "registered_nodes": nodes,
        }
    )


async def dispatch_to_node(node_id: str, command: str, params_json: str = "{}") -> str:
    """Dispatch an execution command to any connected spoke node ('win10_pc', 'android_phone', 'esp32_lab')."""
    ws = ACTIVE_NODES.get(node_id)
    if not ws:
        return json.dumps(
            {
                "error": f"Node '{node_id}' is offline.",
                "online_nodes": list(ACTIVE_NODES.keys()),
            }
        )

    req_id = f"req_{int(datetime.now().timestamp() * 1000)}"
    fut = asyncio.get_running_loop().create_future()
    PENDING_CALLS[req_id] = fut

    await ws.send_json(
        {
            "type": "EXECUTE",
            "req_id": req_id,
            "command": command,
            "params": json.loads(params_json or "{}"),
        }
    )

    try:
        result = await asyncio.wait_for(fut, timeout=15.0)
        record_audit(node_id, command, result)
        return json.dumps(result)
    except asyncio.TimeoutError:
        PENDING_CALLS.pop(req_id, None)
        return json.dumps({"error": f"Timeout waiting for '{node_id}' on '{command}'."})


async def ask_central_brain(user_intent: str, source: str = "hud") -> str:
    """Routes natural voice/text intent through Gemini or fast local OS dispatch."""
    record_audit(source, "INTENT", {"text": user_intent})
    lower = user_intent.lower().strip()

    # Fast zero-latency deterministic path when Gemini key is absent
    if not ai_client:
        if lower.startswith("play ") or "arjit" in lower or "song" in lower:
            q = lower.replace("play ", "", 1).strip() or "Arijit Singh"
            return play_music(q)
        if any(k in lower for k in ("start my work", "open my project", "open workspace")):
            return open_project_workspace("AttendEasy" if "attendeasy" in lower else "SARA")
        if any(k in lower for k in ("diagnostic", "bottleneck", "friday")):
            return json.dumps(scan_live_system_bottlenecks())
        if any(k in lower for k in ("dossier", "edith", "recon", "port scan")):
            target = user_intent.split()[-1] if len(user_intent.split()) > 1 else "localhost"
            return json.dumps(build_instant_dossier(target, str(DB_PATH)))
        if any(k in lower for k in ("replay", "last 30", "karen")):
            return json.dumps(GLOBAL_RING_BUFFER.replay_last_seconds(30))
        if "mode" in lower and any(k in lower for k in ("coding", "exam", "stealth", "presentation", "hyperspeed")):
            return json.dumps(switch_workspace_mode(lower))
        if any(k in lower for k in ("diagram", "wireframe", "homer", "workshop")):
            return json.dumps(generate_live_project_diagram(str(BASE_DIR.parent.parent)))
        if any(k in lower for k in ("assemble", "ship build")):
            return json.dumps(assemble_and_ship_pipeline(str(BASE_DIR.parent.parent)))
        if any(k in lower for k in ("ram", "cpu", "health", "status")):
            return get_system_status()
        if "win10_pc" in ACTIVE_NODES and lower.startswith("open "):
            app_name = lower.replace("open ", "", 1).strip()
            return await dispatch_to_node("win10_pc", "open_app", json.dumps({"app": app_name}))
        return f"SARA Kernel online. Nodes connected: {list(ACTIVE_NODES.keys())}."

    system_instruction = (
        "You are SARA, the distributed Central Operating Layer across the user's Windows 10 Pro PC, "
        "live desktop wallpaper HUD, mobile, and IoT/ESP32 lab nodes. "
        "NEVER ask clarifying questions like 'Which app?' or 'Which song?' — act immediately with smart defaults "
        "using `play_music`, `open_project_workspace`, `run_or_learn_skill`, or `dispatch_to_node` (default node_id='win10_pc'). "
        "If asked to do something you lack a built-in tool for, call `run_or_learn_skill(skill_or_topic, kwargs_json)` "
        "so SARA researches it on the internet, practices in sandbox, and executes the verified Python skill."
    )
    chat = ai_client.aio.chats.create(
        model="gemini-2.5-flash",
        config=types_mod.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=[
                dispatch_to_node,
                get_system_status,
                list_mastered_skills,
                run_or_learn_skill,
                check_active_environment,
                play_music,
                open_project_workspace,
                layer1_shell_execute,
                layer2_uia_click,
                layer3_vision_see_think_act_verify,
                set_win32_phase_mode,
                scan_live_system_bottlenecks,
                scan_local_ports_and_services,
                build_instant_dossier,
                switch_workspace_mode,
                generate_live_project_diagram,
                assemble_and_ship_pipeline,
            ],
            temperature=0.2,
        ),
    )
    response = await chat.send_message(user_intent)
    return response.text or "Command executed."


@app.on_event("startup")
async def _maybe_start_idle_trainer():
    if os.getenv("SARA_IDLE_TRAINER", "1") == "1":
        asyncio.create_task(autonomous_idle_study_loop())


class CommandRequest(BaseModel):
    text: str


@app.get("/health")
async def health():
    return json.loads(get_system_status())


@app.post("/command")
async def http_command(req: CommandRequest):
    reply = await ask_central_brain(req.text, source="http")
    return {"ok": True, "reply": reply}


@app.websocket("/ws/{node_id}")
@app.websocket("/ws/{node_id}/{node_type}")
async def node_ws(websocket: WebSocket, node_id: str, node_type: str = "device"):
    await websocket.accept()
    ACTIVE_NODES[node_id] = websocket
    conn.execute(
        "INSERT OR REPLACE INTO nodes (node_id, node_type, capabilities, status, last_seen) VALUES (?, ?, ?, 'ONLINE', ?)",
        (node_id, node_type, "[]", datetime.now().isoformat()),
    )
    conn.commit()
    record_audit(node_id, "CONNECTED", {"node_type": node_type})

    try:
        while True:
            msg = await websocket.receive_json()
            mtype = str(msg.get("type", "")).upper()

            if mtype == "REGISTER":
                conn.execute(
                    "UPDATE nodes SET capabilities = ?, last_seen = ? WHERE node_id = ?",
                    (json.dumps(msg.get("capabilities", [])), datetime.now().isoformat(), node_id),
                )
                conn.commit()
            elif mtype == "RESULT":
                req_id = msg.get("req_id")
                fut = PENDING_CALLS.pop(req_id, None)
                if fut and not fut.done():
                    fut.set_result(msg.get("data"))
            elif mtype in ("USER_INPUT", "COMMAND"):
                reply = await ask_central_brain(msg.get("text", ""), source=node_id)
                await websocket.send_json({"type": "SARA_REPLY", "text": reply})
            elif mtype == "TELEMETRY":
                record_audit(node_id, "TELEMETRY", msg.get("data", {}))
    except WebSocketDisconnect:
        ACTIVE_NODES.pop(node_id, None)
        conn.execute(
            "UPDATE nodes SET status = 'OFFLINE', last_seen = ? WHERE node_id = ?",
            (datetime.now().isoformat(), node_id),
        )
        conn.commit()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("SARA_KERNEL_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port)
