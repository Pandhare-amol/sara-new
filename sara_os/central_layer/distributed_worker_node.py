#!/usr/bin/env python3
"""
SARA / J.A.R.V.I.S. Distributed Swarm Worker Node (`distributed_worker_node.py`)
Connects any secondary Windows 10 VM, laptop, or Linux container to the Supreme Commander
WebSocket Swarm Bus (`/ws/swarm`), streams real-time CPU/RAM/Disk telemetry every 3 seconds,
and executes delegated department tasks (`FRIDAY`, `EDITH`, `KAREN`, `WORKSHOP`, `CENTRAL_OS`)
reporting straight back to whichever Supreme Commander (`SARA` or `J.A.R.V.I.S.`) is active.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import socket
import subprocess
from datetime import datetime, timezone
from typing import Any, Dict

from departments import (
    GLOBAL_RING_BUFFER,
    build_instant_dossier,
    generate_live_project_diagram,
    scan_live_system_bottlenecks,
    scan_local_ports_and_services,
    switch_workspace_mode,
)


def execute_local_department_task(department: str, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
    dept = department.upper()
    if dept == "FRIDAY":
        return scan_live_system_bottlenecks(int(params.get("top_n", 10)))
    if dept == "EDITH":
        if action == "dossier":
            return build_instant_dossier(str(params.get("query", "localhost")))
        return scan_local_ports_and_services(str(params.get("host", "127.0.0.1")))
    if dept == "KAREN":
        if action == "preset":
            return switch_workspace_mode(str(params.get("preset", "coding_mode")), dry_run=bool(params.get("dry_run", False)))
        return GLOBAL_RING_BUFFER.replay_last_seconds(int(params.get("seconds", 30)))
    if dept == "WORKSHOP":
        return generate_live_project_diagram(str(params.get("project_dir", ".")))
    if dept == "CENTRAL_OS" and action == "shell":
        cmd = str(params.get("command", "whoami"))
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        return {"ok": proc.returncode == 0, "stdout": proc.stdout.strip()[:2000], "stderr": proc.stderr.strip()[:1000]}
    return scan_live_system_bottlenecks(top_n=6)


async def run_worker(hub_ws_url: str, node_id: str, role: str) -> None:
    try:
        import websockets  # type: ignore
    except ImportError:
        raise RuntimeError("Install `websockets` (`pip install websockets`) to run the live WebSocket worker.")

    while True:
        try:
            async with websockets.connect(hub_ws_url) as ws:
                hello = {
                    "type": "SWARM_REGISTER",
                    "nodeId": node_id,
                    "hostname": socket.gethostname(),
                    "os": f"{platform.system()} {platform.release()}",
                    "arch": platform.machine(),
                    "role": role,
                    "departments": ["CENTRAL_OS", "FRIDAY", "EDITH", "KAREN", "WORKSHOP"],
                    "pid": os.getpid(),
                }
                await ws.send(json.dumps(hello))

                async def _heartbeat() -> None:
                    while True:
                        snap = scan_live_system_bottlenecks(top_n=3)
                        await ws.send(
                            json.dumps(
                                {
                                    "type": "SWARM_HEARTBEAT",
                                    "nodeId": node_id,
                                    "cpuPercent": snap["cpu_percent"],
                                    "ramPercent": snap["ram_percent"],
                                    "ramUsedMb": snap["ram_used_mb"],
                                    "ramTotalMb": snap["ram_total_mb"],
                                    "diskFreeGb": snap["disk_free_gb"],
                                    "at": datetime.now(timezone.utc).isoformat(),
                                }
                            )
                        )
                        await asyncio.sleep(3.0)

                hb_task = asyncio.create_task(_heartbeat())
                try:
                    async for raw in ws:
                        msg = json.loads(raw)
                        if msg.get("type") == "SWARM_TASK":
                            task_id = msg.get("taskId")
                            dept = str(msg.get("department", "FRIDAY"))
                            action = str(msg.get("action", "scan"))
                            params = msg.get("params") or {}
                            try:
                                data = execute_local_department_task(dept, action, params)
                                await ws.send(json.dumps({"type": "SWARM_RESULT", "taskId": task_id, "nodeId": node_id, "ok": True, "result": data}))
                            except Exception as exc:
                                await ws.send(json.dumps({"type": "SWARM_RESULT", "taskId": task_id, "nodeId": node_id, "ok": False, "error": str(exc)}))
                finally:
                    hb_task.cancel()
        except Exception:
            await asyncio.sleep(3.0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SARA / J.A.R.V.I.S. Distributed Swarm Worker")
    parser.add_argument("--hub", default="ws://127.0.0.1:3000/ws/swarm", help="Supreme Commander Swarm WebSocket URL")
    parser.add_argument("--node-id", default=f"worker-{socket.gethostname().lower()}", help="Unique worker node ID")
    parser.add_argument("--role", default="general_department_worker", help="Worker specialization role")
    args = parser.parse_args()
    asyncio.run(run_worker(args.hub, args.node_id, args.role))
