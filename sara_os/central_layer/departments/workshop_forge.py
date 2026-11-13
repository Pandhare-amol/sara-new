#!/usr/bin/env python3
"""
H.O.M.E.R. / Stark Workshop Department — `workshop_forge.py`
Live Project Architecture SVG / Mermaid / 3D Graph Generator + Automated Assemble-and-Ship Pipeline.
100% Real Repository & Build Inspection (Zero Hardcoded Fake Trees).
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

SKIP_DIRS = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".venv",
    "venv",
    ".next",
    ".cache",
    "Unselected files",
}


def generate_live_project_diagram(project_dir: str = ".") -> Dict[str, Any]:
    """Scans a real project directory and builds a live Mermaid flowchart + crisp holographic SVG."""
    root = Path(project_dir).resolve()
    top_dirs: List[Dict[str, Any]] = []

    for child in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if child.name in SKIP_DIRS or child.name.startswith("."):
            continue
        if child.is_dir():
            file_count = 0
            for _r, dirs, files in os.walk(child):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                file_count += len(files)
                if file_count > 500:
                    break
            top_dirs.append({"name": child.name, "files": file_count})

    top_dirs.sort(key=lambda d: d["files"], reverse=True)
    selected = top_dirs[:10]

    pkg_name = root.name
    scripts_count = 0
    deps_count = 0
    pkg_json = root / "package.json"
    if pkg_json.exists():
        try:
            pkg = json.loads(pkg_json.read_text(encoding="utf-8"))
            pkg_name = str(pkg.get("name") or pkg_name)
            scripts_count = len(pkg.get("scripts") or {})
            deps_count = len(pkg.get("dependencies") or {})
        except Exception:
            pass

    mermaid_lines = [
        "flowchart LR",
        f'  CORE["{pkg_name.upper()} Supreme Core\\n({deps_count} deps / {scripts_count} scripts)"]',
    ]
    for idx, d in enumerate(selected):
        nid = f"D{idx}"
        safe = d["name"].replace('"', "'")
        mermaid_lines.append(f'  CORE --> {nid}["{safe}/ ({d["files"]} files)"]')

    # Build clean dark-cyan Stark HUD SVG schematic
    height = max(240, 70 + len(selected) * 34)
    svg_nodes: List[str] = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 {height}" width="100%" height="{height}">',
        '<rect width="100%" height="100%" rx="12" fill="#050b14" stroke="#00e5ff" stroke-opacity="0.35"/>',
        f'<rect x="24" y="{height // 2 - 28}" width="210" height="56" rx="8" fill="#091e32" stroke="#00e5ff" stroke-width="1.5"/>',
        f'<text x="129" y="{height // 2 - 4}" fill="#e0f7ff" font-family="monospace" font-size="13" font-weight="bold" text-anchor="middle">{pkg_name.upper()}</text>',
        f'<text x="129" y="{height // 2 + 16}" fill="#67e8f9" font-family="monospace" font-size="10" text-anchor="middle">{deps_count} deps · {scripts_count} scripts</text>',
    ]
    for idx, d in enumerate(selected):
        y = 36 + idx * 32
        cy = y + 12
        svg_nodes.append(
            f'<path d="M 234 {height // 2} C 330 {height // 2}, 340 {cy}, 430 {cy}" fill="none" stroke="#00e5ff" stroke-opacity="0.45" stroke-width="1.2"/>'
        )
        svg_nodes.append(
            f'<rect x="430" y="{y}" width="296" height="24" rx="5" fill="#0b1929" stroke="#38bdf8" stroke-opacity="0.5"/>'
        )
        svg_nodes.append(
            f'<text x="442" y="{y + 16}" fill="#bae6fd" font-family="monospace" font-size="11">{d["name"]}/</text>'
        )
        svg_nodes.append(
            f'<text x="714" y="{y + 16}" fill="#22d3ee" font-family="monospace" font-size="10" text-anchor="end">{d["files"]} files</text>'
        )
    svg_nodes.append("</svg>")

    return {
        "department": "WORKSHOP",
        "module": "workshop_forge",
        "project_name": pkg_name,
        "project_root": str(root),
        "modules": selected,
        "mermaid": "\n".join(mermaid_lines),
        "svg": "\n".join(svg_nodes),
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


def assemble_and_ship_pipeline(project_dir: str = ".", output_zip: str = "") -> Dict[str, Any]:
    """Runs a real verification & source-snapshot packaging pipeline."""
    root = Path(project_dir).resolve()
    t0 = time.perf_counter()
    steps: List[Dict[str, Any]] = []

    # Step 1: Git branch & working tree check
    try:
        branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=root, text=True, timeout=5).strip()
        status_lines = subprocess.check_output(["git", "status", "-s"], cwd=root, text=True, timeout=5).splitlines()
        steps.append({"step": "git_inspect", "ok": True, "branch": branch, "modified_files": len(status_lines)})
    except Exception as exc:
        steps.append({"step": "git_inspect", "ok": False, "detail": str(exc)})

    # Step 2: Python syntax verification on central_layer
    py_dir = root / "sara_os" / "central_layer"
    if py_dir.exists():
        py_files = list(py_dir.rglob("*.py"))
        compile_errors: List[str] = []
        for pf in py_files:
            try:
                compile(pf.read_text(encoding="utf-8"), str(pf), "exec")
            except SyntaxError as err:
                compile_errors.append(f"{pf.name}:{err.lineno} {err.msg}")
        steps.append({"step": "python_syntax_gate", "ok": len(compile_errors) == 0, "checked_files": len(py_files), "errors": compile_errors})

    # Step 3: Package clean release manifest / artifact zip if requested
    artifact_info: Dict[str, Any] = {}
    if output_zip:
        zip_path = Path(output_zip).resolve()
        zip_path.parent.mkdir(parents=True, exist_ok=True)
        packed = 0
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for rel_target in ("package.json", "sara_os/central_layer"):
                target = root / rel_target
                if target.is_file():
                    zf.write(target, rel_target)
                    packed += 1
                elif target.is_dir():
                    for f in target.rglob("*"):
                        if f.is_file() and "__pycache__" not in f.parts:
                            zf.write(f, str(f.relative_to(root)))
                            packed += 1
        digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()[:16]
        artifact_info = {
            "zip_path": str(zip_path),
            "packed_files": packed,
            "size_bytes": zip_path.stat().st_size,
            "sha256_short": digest,
        }
        steps.append({"step": "package_release_zip", "ok": True, **artifact_info})

    return {
        "department": "WORKSHOP",
        "ok": all(s.get("ok", False) for s in steps),
        "elapsed_ms": round((time.perf_counter() - t0) * 1000.0, 2),
        "steps": steps,
        "artifact": artifact_info,
    }


def execute(**kwargs: Any) -> str:
    mode = str(kwargs.get("mode", "diagram"))
    project_dir = str(kwargs.get("project_dir", "."))
    if mode == "ship":
        return json.dumps(assemble_and_ship_pipeline(project_dir, str(kwargs.get("output_zip", ""))))
    return json.dumps(generate_live_project_diagram(project_dir))


if __name__ == "__main__":
    diag = generate_live_project_diagram(".")
    print(json.dumps({"project": diag["project_name"], "modules": diag["modules"]}, indent=2))
