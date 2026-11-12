#!/usr/bin/env python3
"""
Smart Half-Task & Ambiguous Request Completer (`core/smart_executor.py`)
Follows "Act First with Smart Defaults, Suggest Next" — NEVER asks "Which app? Which song?".
"""

import json
import os
import re
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

MUSIC_DIR = Path.home() / "Music"


def check_active_environment() -> str:
    """Checks running apps (Spotify, Chrome, VS Code) and local ~/Music/*.mp3 files."""
    running = set()
    if psutil is not None:
        running = {
            p.info["name"].lower()
            for p in psutil.process_iter(["name"])
            if p.info.get("name")
        }
    return json.dumps(
        {
            "spotify_running": "spotify.exe" in running,
            "chrome_running": "chrome.exe" in running,
            "vscode_running": "code.exe" in running,
            "local_music_files": [f.name for f in MUSIC_DIR.glob("*.mp3")][:10]
            if MUSIC_DIR.exists()
            else [],
        }
    )


def play_music(query: str, platform: str = "auto") -> str:
    """Searches and immediately plays a song without asking for a URL or platform."""
    clean_q = query.strip() or "lofi coding beats"
    if "arjit" in clean_q.lower():
        clean_q = re.sub(r"(?i)arjit", "Arijit Singh", clean_q) + " best songs"

    if platform in ("local", "auto") and MUSIC_DIR.exists():
        matches = [
            f
            for f in MUSIC_DIR.glob("*.mp3")
            if any(w in f.stem.lower() for w in clean_q.lower().split())
        ]
        if matches:
            if hasattr(os, "startfile"):
                os.startfile(str(matches[0]))
            return f"Playing local file '{matches[0].name}' in default media player."

    if platform == "spotify":
        encoded = urllib.parse.quote(clean_q)
        webbrowser.open(f"spotify:search:{encoded}")
        return f"Opened Spotify search for '{clean_q}'."

    search_url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote(clean_q)
    try:
        req = urllib.request.Request(search_url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=6).read().decode("utf-8", errors="ignore")
        video_ids = re.findall(r"watch\?v=(\S{11})", html)
        if video_ids:
            top_video_url = f"https://www.youtube.com/watch?v={video_ids[0]}&autoplay=1"
            webbrowser.open(top_video_url)
            return f"Auto-playing '{clean_q}' on YouTube ({top_video_url})."
    except Exception:
        pass

    webbrowser.open(search_url)
    return f"Opened YouTube search results for '{clean_q}'."


def open_project_workspace(project_hint: str = "SARA") -> str:
    """Completes vague coding requests like 'start my work' or 'open my project'."""
    project_paths = {
        "sara": str(Path(__file__).resolve().parent.parent),
        "attendeasy": r"D:\project\AttendEasy",
    }
    target = project_paths.get(project_hint.lower(), project_paths["sara"])
    if os.name == "nt":
        os.system(f'code "{target}"')
    return f"Opened {project_hint} workspace in VS Code ({target})."


AUTONOMOUS_SYSTEM_PROMPT = (
    "You are SARA, a proactive, decisive Windows 10 Pro assistant. "
    "NEVER ask 'Which app?' or 'Which song?' — act immediately with smart defaults using "
    "`play_music` or `open_project_workspace`, confirm in 1 crisp sentence, and give 1 short suggestion."
)


def handle_smart_request(user_text: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        if "play" in user_text.lower():
            return play_music(re.sub(r"(?i)^.*?\bplay\b", "", user_text).strip())
        return open_project_workspace("AttendEasy" if "attendeasy" in user_text.lower() else "SARA")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=user_text,
        config=types.GenerateContentConfig(
            system_instruction=AUTONOMOUS_SYSTEM_PROMPT,
            tools=[check_active_environment, play_music, open_project_workspace],
            temperature=0.3,
        ),
    )
    return response.text or "Task completed."


if __name__ == "__main__":
    print(handle_smart_request("play arjit song"))
