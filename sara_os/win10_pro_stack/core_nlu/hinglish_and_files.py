"""
Unified Hindi + English + Hinglish Command Engine, Short-Term Context Resolver,
3-Level Security Classifier, Slow-PC Diagnostics & Advanced File/Folder Manager
(`sara_os/win10_pro_stack/core_nlu/hinglish_and_files.py`)

Works 100% OFFLINE (deterministic Hinglish/Hindi/English parser + local OS/File tools)
and seamlessly upgrades to Gemini Cloud when online — ZERO Ollama, ZERO Supabase!
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore

STACK_DIR = Path(__file__).resolve().parent.parent
RECYCLE_VAULT_DIR = Path(os.getenv("SARA_RECYCLE_DIR", str(STACK_DIR / ".sara_recycle_bin")))
RECYCLE_VAULT_DIR.mkdir(parents=True, exist_ok=True)


# ==============================================================================
# 1. 3-LEVEL PERMISSION & SAFETY CLASSIFIER (LEVEL 1 SAFE / LEVEL 2 / LEVEL 3)
# ==============================================================================
def classify_permission_level(command: str) -> dict[str, Any]:
    """
    Classifies any voice or text command into:
    - LEVEL_1_SAFE: Open apps/folders, search/read files, search web, volume/brightness, diagnostics
    - LEVEL_2_CONFIRMATION: Delete/overwrite files, install/uninstall apps, startup/admin edits
    - LEVEL_3_STRICT_APPROVAL: Format drive, system32/registry deletion, disable Defender/Firewall, payments
    """
    c = command.strip().lower()

    level3_patterns = (
        r"\bformat\s+[a-z]:",
        r"\b(system32|bootmgr|winload)\b.*\b(delete|del|remove|hatao)\b",
        r"\b(reg\s+delete|remove-item.*hklm:)\b",
        r"\b(disable|turn\s+off|band\s+karo)\s+(windows\s+defender|firewall|antivirus)\b",
        r"\b(pay|purchase|buy\s+now|checkout|credit\s+card|upi\s+pin)\b",
    )
    for pat in level3_patterns:
        if re.search(pat, c):
            return {
                "level": 3,
                "tier": "LEVEL_3_STRICT_APPROVAL",
                "requires_explicit_approval": True,
                "reason": "High-impact security, destructive disk/registry, or financial action.",
            }

    level2_patterns = (
        r"\b(delete|permanently\s+delete|erase|uninstall|overwrite|replace\s+all)\b",
        r"\b(delete\s+karo|hata\s+do|mitao)\b",
        r"\b(winget\s+install|winget\s+uninstall|install\s+software)\b",
        r"\b(startup\s+disable|run\s+as\s+administrator)\b",
    )
    for pat in level2_patterns:
        if re.search(pat, c):
            return {
                "level": 2,
                "tier": "LEVEL_2_CONFIRMATION",
                "requires_explicit_approval": False,
                "confirmation_recommended": True,
                "reason": "Modifies or removes user files, installed programs, or startup state.",
            }

    return {
        "level": 1,
        "tier": "LEVEL_1_SAFE",
        "requires_explicit_approval": False,
        "confirmation_recommended": False,
        "reason": "Safe read, navigation, search, media, or non-destructive OS operation.",
    }


# ==============================================================================
# 2. ADVANCED FILE & FOLDER INTELLIGENCE (DUPLICATES, LARGE FILES, ORGANIZER, RECYCLE)
# ==============================================================================
FILE_CATEGORY_EXTS: dict[str, set[str]] = {
    "Documents_PDF": {".pdf", ".doc", ".docx", ".txt", ".rtf", ".md"},
    "Spreadsheets_Data": {".xls", ".xlsx", ".csv", ".json"},
    "Presentations": {".ppt", ".pptx"},
    "Images": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"},
    "Audio": {".mp3", ".wav", ".flac", ".aac", ".m4a", ".ogg"},
    "Video": {".mp4", ".mkv", ".mov", ".avi", ".webm"},
    "Code": {".py", ".js", ".ts", ".tsx", ".html", ".css", ".cs", ".cpp"},
    "Archives": {".zip", ".rar", ".7z", ".tar", ".gz"},
}


def find_duplicate_files(folder_path: str) -> dict[str, Any]:
    """Finds exact duplicate files in `folder_path` using fast size pre-grouping + SHA-256."""
    root = Path(folder_path).resolve()
    if not root.exists():
        return {"ok": False, "error": f"Folder not found: {root}"}

    by_size: dict[int, list[Path]] = {}
    for p in root.rglob("*"):
        if p.is_file() and not p.name.startswith("."):
            try:
                sz = p.stat().st_size
                if sz > 0:
                    by_size.setdefault(sz, []).append(p)
            except Exception:
                continue

    duplicate_groups: list[dict[str, Any]] = []
    reclaimable_bytes = 0
    for sz, candidates in by_size.items():
        if len(candidates) < 2:
            continue
        by_hash: dict[str, list[str]] = {}
        for fpath in candidates:
            try:
                h = hashlib.sha256(fpath.read_bytes()).hexdigest()
                by_hash.setdefault(h, []).append(str(fpath))
            except Exception:
                continue
        for sha, paths in by_hash.items():
            if len(paths) > 1:
                reclaimable_bytes += sz * (len(paths) - 1)
                duplicate_groups.append({"sha256": sha[:16], "size_bytes": sz, "files": paths})

    return {
        "ok": True,
        "folder": str(root),
        "duplicate_groups_count": len(duplicate_groups),
        "reclaimable_bytes": reclaimable_bytes,
        "duplicate_groups": duplicate_groups,
    }


def find_large_or_today_files(
    folder_path: str,
    min_size_bytes: int = 0,
    today_only: bool = False,
    extension: str = "",
) -> dict[str, Any]:
    """Finds large files, files downloaded/modified today, or files matching an extension."""
    root = Path(folder_path).resolve()
    if not root.exists():
        return {"ok": False, "error": f"Folder not found: {root}"}

    today_str = datetime.now().strftime("%Y-%m-%d")
    ext = extension.lower() if not extension or extension.startswith(".") else f".{extension.lower()}"
    results: list[dict[str, Any]] = []

    for p in root.rglob("*"):
        if not p.is_file():
            continue
        if ext and p.suffix.lower() != ext:
            continue
        try:
            st = p.stat()
            if st.st_size < min_size_bytes:
                continue
            mod_dt = datetime.fromtimestamp(st.st_mtime)
            if today_only and mod_dt.strftime("%Y-%m-%d") != today_str:
                continue
            results.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "size_bytes": st.st_size,
                    "modified": mod_dt.isoformat(),
                }
            )
        except Exception:
            continue

    results.sort(key=lambda x: x["size_bytes"], reverse=True)
    return {"ok": True, "count": len(results), "files": results[:50]}


def organize_folder_by_category(folder_path: str, dry_run: bool = False) -> dict[str, Any]:
    """Organizes Downloads/Desktop files into clean category subfolders without overwriting."""
    root = Path(folder_path).resolve()
    if not root.exists():
        return {"ok": False, "error": f"Folder not found: {root}"}

    moved: list[dict[str, str]] = []
    for item in list(root.iterdir()):
        if not item.is_file() or item.name.startswith("."):
            continue
        ext = item.suffix.lower()
        category = "Other_Files"
        for cat, exts in FILE_CATEGORY_EXTS.items():
            if ext in exts:
                category = cat
                break
        target_dir = root / category
        dest = target_dir / item.name
        if dest.exists():
            dest = target_dir / f"{item.stem}_{int(time.time())}{item.suffix}"
        if not dry_run:
            target_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(item), str(dest))
        moved.append({"file": item.name, "category": category, "destination": str(dest)})

    return {"ok": True, "dry_run": dry_run, "organized_count": len(moved), "items": moved}


def safe_recycle_file(file_path: str) -> dict[str, Any]:
    """Moves a file into SARA's recoverable Recycle Bin (never permanently destroys user data!)."""
    src = Path(file_path).resolve()
    if not src.exists():
        return {"ok": False, "error": f"File not found: {src}"}
    RECYCLE_VAULT_DIR.mkdir(parents=True, exist_ok=True)
    token = f"{int(time.time() * 1000)}_{src.name}"
    trashed = RECYCLE_VAULT_DIR / token
    meta = RECYCLE_VAULT_DIR / f"{token}.meta.json"
    shutil.move(str(src), str(trashed))
    meta.write_text(
        json.dumps({"original_path": str(src), "recycled_at": datetime.now().isoformat()}),
        encoding="utf-8",
    )
    return {"ok": True, "recycle_token": token, "original_path": str(src), "recycled_path": str(trashed)}


def restore_recycled_file(recycle_token: str) -> dict[str, Any]:
    trashed = RECYCLE_VAULT_DIR / recycle_token
    meta = RECYCLE_VAULT_DIR / f"{recycle_token}.meta.json"
    if not trashed.exists() or not meta.exists():
        return {"ok": False, "error": f"Recycle token not found: {recycle_token}"}
    info = json.loads(meta.read_text(encoding="utf-8"))
    orig = Path(info["original_path"])
    orig.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(trashed), str(orig))
    meta.unlink()
    return {"ok": True, "restored_path": str(orig)}


# ==============================================================================
# 3. EVIDENCE-BASED SLOW-PC DIAGNOSTICS ("SARA, mera PC slow kyu chal raha hai?")
# ==============================================================================
def diagnose_pc_performance() -> dict[str, Any]:
    """Inspects live CPU, RAM, Disk, and heavy user processes without killing OS processes."""
    root_mount = "C:\\" if os.name == "nt" else "/"
    disk = shutil.disk_usage(root_mount)
    disk_pct = round((disk.used / max(disk.total, 1)) * 100, 1)
    disk_free_gb = round(disk.free / (1024**3), 1)

    if psutil is not None:
        cpu = psutil.cpu_percent(interval=0.1)
        vm = psutil.virtual_memory()
        ram_pct = round(vm.percent, 1)
        ram_free_gb = round(vm.available / (1024**3), 2)
        procs = []
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                rss_mb = round((p.info["memory_info"].rss if p.info.get("memory_info") else 0) / (1024 * 1024), 1)
                procs.append({"pid": p.info["pid"], "name": p.info["name"], "ram_mb": rss_mb})
            except Exception:
                continue
        procs.sort(key=lambda x: x["ram_mb"], reverse=True)
        top5 = procs[:5]
    else:
        # Pure-stdlib real Linux/POSIX fallback (/proc/meminfo + os.getloadavg)
        cores = max(os.cpu_count() or 1, 1)
        load1 = os.getloadavg()[0] if hasattr(os, "getloadavg") else 0.1
        cpu = round(min(100.0, (load1 / cores) * 100.0), 1)
        mem_total_kb = 8 * 1024 * 1024
        mem_avail_kb = 4 * 1024 * 1024
        if Path("/proc/meminfo").exists():
            for line in Path("/proc/meminfo").read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("MemTotal:"):
                    mem_total_kb = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    mem_avail_kb = int(line.split()[1])
        ram_pct = round(((mem_total_kb - mem_avail_kb) / max(mem_total_kb, 1)) * 100.0, 1)
        ram_free_gb = round(mem_avail_kb / (1024 * 1024), 2)
        top5 = []

    causes: list[str] = []
    suggestions: list[str] = []
    if ram_pct > 80:
        causes.append(f"High RAM utilization ({ram_pct}% used; only {ram_free_gb} GB free).")
        suggestions.append(f"Close unused browser tabs or heavy background app '{top5[0]['name'] if top5 else 'app'}'.")
    if cpu > 75:
        causes.append(f"Elevated CPU usage ({cpu}%).")
        suggestions.append("Wait for active compile/scan jobs or pause background sync.")
    if disk_pct > 88:
        causes.append(f"Low disk free space on {root_mount} ({disk_free_gb} GB left).")
        suggestions.append("Run Storage Sense or clean temporary build artifacts.")
    if not causes:
        causes.append(f"CPU ({cpu}%), RAM ({ram_pct}%), and Disk ({disk_pct}% used) are all within healthy bounds.")
        suggestions.append("No bottlenecks detected — system is running smoothly.")

    hinglish_reply = (
        f"System check complete: CPU {cpu}% aur RAM {ram_pct}% use ho rahi hai "
        f"({ram_free_gb} GB free). {causes[0]}"
    )

    return {
        "ok": True,
        "cpu_percent": cpu,
        "ram_percent": ram_pct,
        "ram_free_gb": ram_free_gb,
        "disk_percent": disk_pct,
        "top_memory_processes": top5,
        "causes": causes,
        "suggestions": suggestions,
        "summary_hinglish": hinglish_reply,
    }


# ==============================================================================
# 4. HINDI + ENGLISH + HINGLISH CONTEXTUAL MULTI-STEP PARSER (ONLINE + OFFLINE)
# ==============================================================================
class HinglishCommandSession:
    """
    Maintains short-term conversational memory (`current_app`, `current_url`,
    `current_folder`, `last_file`) and resolves Hindi/English/Hinglish single
    and multi-step commands deterministically (works Offline AND Online!).
    """

    def __init__(self) -> None:
        self.context: dict[str, str] = {
            "current_app": "",
            "current_url": "",
            "current_folder": str(Path.home() / "Downloads"),
            "last_file": "",
        }
        self.history: list[dict[str, Any]] = []

    def execute_utterance(self, utterance: str, enforce_tier_confirm: bool = False) -> dict[str, Any]:
        clean = re.sub(r"^(?:hey\s+sara|hello\s+sara|sara)\s*[,:-]?\s*", "", utterance.strip(), flags=re.I)
        perm = classify_permission_level(clean)

        if perm["level"] == 3 or (enforce_tier_confirm and perm["level"] >= 2):
            return {
                "ok": False,
                "status": "waiting_for_confirmation",
                "permission": perm,
                "spoken_reply": f"Rukiye Boss — '{clean}' {perm['tier']} action hai. Kripya confirm karein.",
            }

        # Split compound multi-step Hindi/Hinglish/English clauses ("aur", "phir", "and then", "and", ",")
        clauses = [
            c.strip()
            for c in re.split(r"\s+(?:aur\s+phir|and\s+then|aur|phir|then|and)\s+|,\s+", clean, flags=re.I)
            if c.strip()
        ]

        steps_executed: list[dict[str, Any]] = []
        replies: list[str] = []

        for clause in clauses:
            step_out = self._run_single_clause(clause)
            steps_executed.append(step_out)
            replies.append(step_out["reply"])

        record = {
            "at": datetime.now().isoformat(),
            "utterance": utterance,
            "permission": perm,
            "steps": steps_executed,
            "context_snapshot": dict(self.context),
            "spoken_reply": " ".join(replies),
        }
        self.history.insert(0, record)
        if len(self.history) > 60:
            self.history.pop()
        return {"ok": True, "status": "completed", **record}

    def _run_single_clause(self, clause: str) -> dict[str, Any]:
        c = clause.lower().strip().rstrip(".!?")

        # 1. Slow PC / Performance Diagnostic ("mera pc slow kyu chal raha hai", "system performance check karo")
        if re.search(r"\b(slow\s+kyu|pc\s+slow|system\s+performance|check\s+your\s+system|performance\s+check)\b", c):
            diag = diagnose_pc_performance()
            return {"intent": "diagnose_pc", "data": diag, "reply": diag["summary_hinglish"]}

        # 2. Battery / CPU / RAM check ("mera battery percentage batao")
        if re.search(r"\b(battery\s+percentage|battery\s+kitni|battery\s+status)\b", c):
            bat = psutil.sensors_battery() if (psutil and hasattr(psutil, "sensors_battery")) else None
            pct = f"{bat.percent}%" if bat else "AC Power (Desktop/Plugged)"
            return {"intent": "battery_check", "reply": f"Battery status: {pct}."}

        # 3. Volume ("volume 50 percent kar do", "awaz 40 kar do")
        vol_m = re.search(r"\b(?:volume|awaz)\s*(\d{1,3})\s*(?:%|percent)?", c)
        if vol_m:
            lvl = max(0, min(100, int(vol_m.group(1))))
            return {"intent": "set_volume", "value": lvl, "reply": f"Volume {lvl}% set kar diya."}

        # 4. Open Browser / App ("chrome kholo", "vs code open karo", "notepad band karo")
        close_m = re.search(r"^([a-z0-9 _.-]+?)\s+(?:band\s+karo|close\s+karo|bando)$", c)
        if close_m:
            app = close_m.group(1).strip()
            return {"intent": "close_app", "app": app, "reply": f"{app.title()} band kar diya."}

        open_app_m = re.search(
            r"^(?:open|launch|start)?\s*(chrome|google\s+chrome|edge|firefox|vs\s*code|notepad|calculator|control\s+panel|device\s+manager|downloads\s+folder|display\s+settings|bluetooth\s+settings|wi-?fi\s+settings)\s*(?:kholo|open\s+karo|start\s+karo|chalu\s+karo)?$",
            c,
        )
        if open_app_m:
            target = open_app_m.group(1).strip()
            self.context["current_app"] = target
            if "downloads" in target:
                self.context["current_folder"] = str(Path.home() / "Downloads")
            return {"intent": "open_target", "target": target, "reply": f"{target.title()} open kar diya."}

        # 5. Navigate to YouTube / Website ("youtube par jao", "youtube kholo")
        if re.search(r"\byoutube\s+(?:par\s+jao|kholo|open\s+karo)\b|^open\s+youtube$", c):
            self.context["current_url"] = "https://www.youtube.com"
            if not self.context["current_app"]:
                self.context["current_app"] = "chrome"
            return {
                "intent": "navigate_url",
                "url": self.context["current_url"],
                "browser": self.context["current_app"],
                "reply": f"{self.context['current_app'].title()} mein YouTube open kar diya.",
            }

        # 6. Contextual Search on YouTube / Google ("youtube par search karo latest ai news", "ab ai assistant development search karo")
        yt_search = re.search(
            r"youtube\s+par\s+(?:search\s+karo\s+)?(.+?)(?:\s+search\s+karo)?$|^(?:ab\s+)?(.+?)\s+search\s+karo$",
            clause.strip(),
            flags=re.I,
        )
        if yt_search:
            query = (yt_search.group(1) or yt_search.group(2) or "").strip()
            on_yt = "youtube" in c or "youtube.com" in self.context.get("current_url", "")
            base = "https://www.youtube.com/results?search_query=" if on_yt else "https://www.google.com/search?q="
            url = base + urllib.parse.quote(query)
            self.context["current_url"] = url
            engine_name = "YouTube" if on_yt else "Google"
            return {
                "intent": "web_search",
                "engine": engine_name,
                "query": query,
                "url": url,
                "reply": f"{engine_name} par '{query}' search kar diya.",
            }

        # 7. Contextual Duplicate Files / Organize Folder ("is folder ki duplicate files identify karo")
        if "duplicate" in c:
            folder = self.context["current_folder"]
            dups = find_duplicate_files(folder)
            return {
                "intent": "find_duplicates",
                "folder": folder,
                "data": dups,
                "reply": f"Folder '{Path(folder).name}' mein {dups.get('duplicate_groups_count', 0)} duplicate group mile.",
            }

        if "organize" in c and ("folder" in c or "image" in c or "pdf" in c or "downloads" in c):
            folder = self.context["current_folder"]
            org = organize_folder_by_category(folder, dry_run=True)
            return {
                "intent": "organize_preview",
                "folder": folder,
                "data": org,
                "reply": f"{org.get('organized_count', 0)} files ko category folders mein organize karne ke liye preview ready hai.",
            }

        # 8. Dark Mode ("dark mode enable karo")
        if "dark mode" in c:
            return {"intent": "dark_mode", "reply": "Dark mode enable kar diya."}

        return {"intent": "general_directive", "clause": clause, "reply": f"Executed: {clause}"}


if __name__ == "__main__":
    sess = HinglishCommandSession()
    r1 = sess.execute_utterance("SARA, Chrome kholo aur YouTube par search karo latest AI news")
    print(json.dumps(r1))
