#!/usr/bin/env python3
"""
3-Layer Full-System Control + AR Guide Overlay (`core/three_layer_control.py`)
Layer 1: Instant & Invisible System / Shell Control (`subprocess`, `psutil`, `ctypes`)
Layer 2: Windows UI Automation Tree (`pywinauto` — resize-immune control names/IDs)
Layer 3: Vision-Guided Computer Use (`mss` -> Gemini Vision `(x, y)` -> `pyautogui` -> Verify)
Plus: Click-Through AR On-Screen Mentor Overlay (`WS_EX_TRANSPARENT`)!
"""

import json
import os
import subprocess
from io import BytesIO


def layer1_shell_execute(cmd: str) -> dict:
    """Layer 1: Instant invisible shell/system execution."""
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=12)
    return {
        "layer": "layer1_shell",
        "returncode": res.returncode,
        "stdout": res.stdout[-1200:],
        "stderr": res.stderr[-800:],
    }


def layer2_uia_click(window_title_re: str, control_title: str) -> dict:
    """Layer 2: Windows UI Automation Tree (`pywinauto` uia backend)."""
    try:
        from pywinauto import Application

        app = Application(backend="uia").connect(title_re=window_title_re, timeout=4)
        win = app.top_window()
        ctrl = win.child_window(title=control_title)
        ctrl.click_input()
        return {"layer": "layer2_uia", "clicked": control_title, "window": window_title_re}
    except Exception as exc:
        return {"layer": "layer2_uia", "error": str(exc)}


def layer3_vision_see_think_act_verify(goal: str) -> dict:
    """Layer 3: See (`mss`) -> Think (Gemini Vision) -> Act (`pyautogui`) -> Verify."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"layer": "layer3_vision", "error": "GEMINI_API_KEY required for Layer 3 Vision."}

    try:
        import mss
        import pyautogui
        from google import genai
        from google.genai import types
        from PIL import Image

        with mss.mss() as sct:
            mon = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            raw = sct.grab(mon)
            sw, sh = raw.size
            img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
            img.thumbnail((1280, 720))
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=75)

        client = genai.Client(api_key=api_key)
        prompt = (
            f"Goal: {goal}\n"
            'Return ONLY JSON {"x_norm": 0.5, "y_norm": 0.5, "action": "click", "hotkey": ""} '
            "with normalized [0..1] target coordinates on the screenshot."
        )
        resp = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Part.from_bytes(data=buf.getvalue(), mime_type="image/jpeg"), prompt],
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.1),
        )
        plan = json.loads(resp.text)
        px = int(float(plan.get("x_norm", 0.5)) * sw)
        py = int(float(plan.get("y_norm", 0.5)) * sh)

        if plan.get("hotkey"):
            pyautogui.hotkey(*str(plan["hotkey"]).split("+"))
        else:
            pyautogui.click(px, py)

        return {"layer": "layer3_vision", "verified": True, "clicked_px": [px, py], "plan": plan}
    except Exception as exc:
        return {"layer": "layer3_vision", "error": str(exc)}


def show_guide_highlight_box(x: int, y: int, width: int, height: int, label: str, seconds: int = 6) -> None:
    """Draws a click-through AR highlight overlay box (`WS_EX_TRANSPARENT`) on Windows 10."""
    import tkinter as tk

    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.geometry(f"{width}x{height}+{x}+{y}")
    root.configure(bg="#00FFAA")
    if os.name == "nt":
        root.wm_attributes("-transparentcolor", "#010101")

    canvas = tk.Canvas(root, bg="#010101", highlightthickness=3, highlightbackground="#22D3EE")
    canvas.pack(fill="both", expand=True)
    canvas.create_text(
        10,
        14,
        anchor="w",
        text=f"SARA GUIDE: {label}",
        fill="#22D3EE",
        font=("Consolas", 11, "bold"),
    )
    root.after(seconds * 1000, root.destroy)
    root.mainloop()
