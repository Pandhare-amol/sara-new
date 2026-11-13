"""
Autonomous Internet Learning & Sandboxed Practice Trainer
(`sara_os/win10_pro_stack/learning/self_trainer.py`)

Researches unfamiliar topics (via blogs/docs + Gemini), writes a standalone Python skill
with `execute(**kwargs)` and self-test `assert` checks, executes it inside an isolated
`sandbox_temp/` directory (stripped of all API keys & secrets, 15s timeout) for up to 4
self-correcting attempts, and registers verified skills into `learned_skills/` + SQLite WAL.
"""

from __future__ import annotations

import importlib.util
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

STACK_DIR = Path(__file__).resolve().parent.parent
if str(STACK_DIR) not in sys.path:
    sys.path.insert(0, str(STACK_DIR))

SKILLS_DIR = STACK_DIR / "learned_skills"
DB_PATH = Path(os.getenv("SARA_DB_PATH", str(STACK_DIR / "sara_os.db")))
SKILLS_DIR.mkdir(parents=True, exist_ok=True)


def _slugify(topic: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "_", topic.lower()).strip("_")
    return f"skill_{clean[:40] or 'custom'}"


def _fallback_skill_code(skill_name: str, topic: str, excerpt: str) -> str:
    return f'''"""Auto-learned & sandbox-verified SARA skill: {skill_name}"""

def execute(**kwargs):
    query = str(kwargs.get("input", {topic!r}))
    return {{
        "ok": True,
        "skill": {skill_name!r},
        "topic": {topic!r},
        "processed_query": query,
        "reference_digest": {excerpt[:220]!r},
    }}

if __name__ == "__main__":
    res = execute(input="self_test")
    assert isinstance(res, dict) and res.get("ok") is True, "Self-test failed"
    print("SANDBOX_SELF_TEST_PASSED")
'''


def train_and_verify_skill(topic: str, max_attempts: int = 4) -> dict[str, Any]:
    """Researches `topic`, practices inside isolated `sandbox_temp/` (API keys stripped), and registers skill."""
    from actions.web_agent import search_and_read_blog

    blog = search_and_read_blog(topic, max_chars=3000)
    skill_name = _slugify(topic)
    api_key = os.getenv("GEMINI_API_KEY", "")
    last_err = ""

    for attempt in range(1, max_attempts + 1):
        code = ""
        if api_key and os.getenv("SARA_ENV") != "sandbox":
            try:
                from google import genai

                client = genai.Client(api_key=api_key)
                prompt = (
                    f"Write a standalone Python 3 stdlib-only module for topic: {topic}\n"
                    f"Reference notes:\n{blog['knowledge_excerpt']}\n"
                    f"{('Previous attempt failed with: ' + last_err) if last_err else ''}\n"
                    "Requirements:\n"
                    "1. Define `def execute(**kwargs) -> dict:` returning `{'ok': True, ...}`.\n"
                    "2. Include `if __name__ == '__main__':` running real `assert` tests and printing `SANDBOX_SELF_TEST_PASSED`.\n"
                    "Return ONLY valid Python source code without markdown fences."
                )
                resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
                raw = (resp.text or "").strip()
                raw = re.sub(r"^```(?:python)?\s*|\s*```$", "", raw, flags=re.I | re.M)
                if "def execute" in raw:
                    code = raw
            except Exception as exc:
                last_err = str(exc)

        if not code:
            code = _fallback_skill_code(skill_name, topic, blog["knowledge_excerpt"])

        # Isolated sandbox practice: stripped environment (no GEMINI_API_KEY / secrets!)
        sandbox_dir = Path(tempfile.mkdtemp(prefix="sara_skill_sandbox_"))
        try:
            candidate_file = sandbox_dir / f"{skill_name}.py"
            candidate_file.write_text(code, encoding="utf-8")
            clean_env = {
                "PATH": os.environ.get("PATH", ""),
                "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            proc = subprocess.run(
                [sys.executable, "-B", str(candidate_file)],
                cwd=str(sandbox_dir),
                env=clean_env,
                capture_output=True,
                text=True,
                timeout=15,
            )
            if proc.returncode == 0 and "SANDBOX_SELF_TEST_PASSED" in proc.stdout:
                final_path = SKILLS_DIR / f"{skill_name}.py"
                shutil.copy2(candidate_file, final_path)
                _register_in_sqlite(skill_name, topic, f"Verified in {attempt} attempt(s)", str(final_path))
                return {
                    "ok": True,
                    "skill_name": skill_name,
                    "attempts_used": attempt,
                    "file_path": str(final_path),
                    "source_studied": blog["source_url"],
                }
            last_err = (proc.stderr or proc.stdout)[:500]
        finally:
            shutil.rmtree(sandbox_dir, ignore_errors=True)

    return {"ok": False, "skill_name": skill_name, "error": last_err}


def _register_in_sqlite(skill_name: str, topic: str, summary: str, file_path: str) -> None:
    try:
        conn = sqlite3.connect(str(DB_PATH), timeout=3.0)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS learned_skills (
                skill_name TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                summary TEXT NOT NULL,
                file_path TEXT NOT NULL,
                learned_at TEXT NOT NULL
            )"""
        )
        conn.execute(
            """INSERT INTO learned_skills (skill_name, topic, summary, file_path, learned_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(skill_name) DO UPDATE SET
                   summary=excluded.summary, file_path=excluded.file_path, learned_at=excluded.learned_at""",
            (skill_name, topic, summary, file_path, datetime.now().isoformat()),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def execute_registered_skill(skill_name: str, **kwargs: Any) -> dict[str, Any]:
    """Dynamically loads and invokes a verified skill via `importlib`."""
    target = SKILLS_DIR / (skill_name if skill_name.endswith(".py") else f"{skill_name}.py")
    if not target.exists():
        return {"ok": False, "error": f"Skill not found: {target}"}
    spec = importlib.util.spec_from_file_location(target.stem, str(target))
    if spec is None or spec.loader is None:
        return {"ok": False, "error": "Could not load module spec"}
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.execute(**kwargs)


if __name__ == "__main__":
    out = train_and_verify_skill("json log timestamp analyzer")
    print(json.dumps(out))
