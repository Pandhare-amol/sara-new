#!/usr/bin/env python3
"""
Dynamic Skill Loader & Execution Bridge (`core/skill_loader.py`)
Searches `learned_skills` first -> imports verified `.py` module in <5ms ->
or triggers `study_and_practice(topic)` automatically if never seen before!
"""

import importlib.util
import json
import os
import sqlite3
from pathlib import Path

from core.autonomous_trainer import study_and_practice

BASE_DIR = Path(os.getenv("SARA_OS_DIR", Path(__file__).resolve().parent.parent))
DB_PATH = BASE_DIR / "sara_os.db"


def list_mastered_skills() -> str:
    """Lists all skills SARA has researched, practiced in sandbox, and verified."""
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT skill_name, topic, summary, practice_attempts FROM learned_skills"
        ).fetchall()
    return json.dumps([dict(r) for r in rows])


def run_or_learn_skill(skill_or_topic: str, kwargs_json: str = "{}") -> str:
    """Executes a mastered skill immediately, OR learns & practices it from the internet on the spot."""
    params = json.loads(kwargs_json or "{}")

    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM learned_skills WHERE skill_name = ? OR topic LIKE ?",
            (skill_or_topic.lower(), f"%{skill_or_topic}%"),
        ).fetchone()

    if not row:
        study_report = study_and_practice(skill_or_topic)
        with sqlite3.connect(str(DB_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM learned_skills WHERE topic LIKE ? ORDER BY learned_at DESC LIMIT 1",
                (f"%{skill_or_topic}%",),
            ).fetchone()
        if not row:
            return f"Auto-training failed: {study_report}"

    skill_path = Path(row["file_path"])
    if not skill_path.exists():
        return f"Skill file missing at {skill_path}"

    spec = importlib.util.spec_from_file_location(row["skill_name"], str(skill_path))
    if not spec or not spec.loader:
        return f"Could not load spec for {skill_path}"

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if hasattr(module, "execute"):
        result = module.execute(**params)
        return f"[{row['skill_name']}] Executed successfully: {result}"

    return f"Skill '{row['skill_name']}' loaded, but lacks an `execute()` entrypoint."
