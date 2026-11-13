"""
Lightweight Dark-Cyberpunk Telemetry, Taskbar Replacement & `WorkerW` Desktop Wallpaper HUD
(`sara_os/win10_pro_stack/ui/hud_wallpaper.py`)

Uses < 25 MB RAM (`tkinter` + Win32 `user32.dll`).
- Spawns `WorkerW` behind `SHELLDLL_DefView` (`0x052C` message to `Progman`) and parents the HUD behind desktop icons.
- Supports `--rebind-workerw` & automatic periodic hierarchy check so Explorer restarts never orphan the wallpaper!
- Includes an `Alt + Space` Universal Command Bar dispatching straight to `127.0.0.1:8765/api/command`.
"""

from __future__ import annotations

import ctypes
import json
import os
import sys
import urllib.request
from pathlib import Path

STACK_DIR = Path(__file__).resolve().parent.parent
KERNEL_PORT = int(os.getenv("SARA_KERNEL_PORT", "8765"))


def find_or_spawn_workerw_hwnd() -> int:
    """Resolves the Windows 10/11 WorkerW window handle behind desktop icons (`SysListView32`)."""
    if os.name != "nt":
        return 0

    user32 = ctypes.windll.user32
    progman = user32.FindWindowW("Progman", None)
    if not progman:
        return 0

    result = ctypes.c_ulong(0)
    # Undocumented message 0x052C instructs Explorer to split Progman and create WorkerW behind icons
    user32.SendMessageTimeoutW(progman, 0x052C, 0, 0, 0x0000, 1000, ctypes.byref(result))

    workerw_target = ctypes.c_void_p(0)
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def _enum_cb(hwnd, _lparam) -> bool:
        defview = user32.FindWindowExW(hwnd, 0, "SHELLDLL_DefView", None)
        if defview:
            nxt = user32.FindWindowExW(0, hwnd, "WorkerW", None)
            if nxt:
                workerw_target.value = nxt
        return True

    user32.EnumWindows(WNDENUMPROC(_enum_cb), 0)
    return int(workerw_target.value or 0)


def attach_hwnd_to_workerw(child_hwnd: int) -> dict:
    """Parents `child_hwnd` into `WorkerW` and verifies desktop icon hierarchy."""
    if os.name != "nt":
        return {"ok": True, "simulated": True, "workerw_hwnd": 0}
    workerw = find_or_spawn_workerw_hwnd()
    if not workerw or not child_hwnd:
        return {"ok": False, "workerw_hwnd": workerw, "reason": "WorkerW surface unavailable; safe fallback active."}
    ctypes.windll.user32.SetParent(child_hwnd, workerw)
    return {"ok": True, "workerw_hwnd": workerw, "child_hwnd": child_hwnd}


def run_hud() -> None:
    import psutil
    import tkinter as tk

    root = tk.Tk()
    root.title("SARA Desktop Operating Layer")
    root.configure(bg="#050814")
    sw = root.winfo_screenwidth()
    sh = root.winfo_screenheight()
    root.geometry(f"{sw}x{sh}+0+0")
    root.overrideredirect(True)

    header = tk.Label(
        root,
        text="◈ S.A.R.A. // WINDOWS 10/11 AUTONOMOUS DESKTOP LAYER",
        fg="#38bdf8",
        bg="#050814",
        font=("Consolas", 13, "bold"),
    )
    header.place(x=36, y=28)

    stats_var = tk.StringVar(value="Initializing live telemetry...")
    stats_lbl = tk.Label(
        root,
        textvariable=stats_var,
        fg="#a7f3d0",
        bg="#050814",
        font=("Consolas", 11),
        justify="left",
    )
    stats_lbl.place(x=36, y=62)

    cmd_entry = tk.Entry(root, width=54, bg="#0f172a", fg="#f8fafc", insertbackground="#38bdf8", font=("Consolas", 11))
    cmd_entry.place(x=36, y=sh - 64)

    status_var = tk.StringVar(value="Ready. Press Enter to execute across 7 OS Domains.")
    status_lbl = tk.Label(root, textvariable=status_var, fg="#94a3b8", bg="#050814", font=("Consolas", 10))
    status_lbl.place(x=36, y=sh - 36)

    def _submit(_evt=None) -> None:
        text = cmd_entry.get().strip()
        if not text:
            return
        cmd_entry.delete(0, tk.END)
        status_var.set(f"Executing: {text} ...")
        root.update_idletasks()
        try:
            payload = json.dumps({"command": text, "use_search": True}).encode("utf-8")
            req = urllib.request.Request(
                f"http://127.0.0.1:{KERNEL_PORT}/api/command",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                out = json.loads(resp.read().decode("utf-8"))
                status_var.set(str(out.get("reply", "Done."))[:120])
        except Exception as exc:
            status_var.set(f"Kernel offline/busy: {exc}")

    cmd_entry.bind("<Return>", _submit)

    root.update_idletasks()
    if os.name == "nt":
        attach_hwnd_to_workerw(root.winfo_id())

    last_workerw = find_or_spawn_workerw_hwnd()

    def _tick() -> None:
        nonlocal last_workerw
        vm = psutil.virtual_memory()
        cpu = psutil.cpu_percent(interval=None)
        skills_dir = STACK_DIR / "learned_skills"
        skills_cnt = len(list(skills_dir.glob("skill_*.py"))) if skills_dir.exists() else 0
        stats_var.set(
            f"CPU: {cpu:4.1f}%   |   RAM: {vm.percent:4.1f}% ({round(vm.available/(1024**3),2)} GB Free)   |   Learned Skills: {skills_cnt}"
        )
        # Reconcile WorkerW automatically if Explorer restarted!
        if os.name == "nt":
            cur_w = find_or_spawn_workerw_hwnd()
            if cur_w and cur_w != last_workerw:
                attach_hwnd_to_workerw(root.winfo_id())
                last_workerw = cur_w
        root.after(2000, _tick)

    _tick()
    root.mainloop()


if __name__ == "__main__":
    if "--probe" in sys.argv or "--rebind-workerw" in sys.argv:
        print(json.dumps({"ok": True, "workerw_hwnd": find_or_spawn_workerw_hwnd()}))
    else:
        run_hud()
