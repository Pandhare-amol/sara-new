#!/usr/bin/env python3
"""
Windows 10 Pro Live Wallpaper Embedder (`wallpaper_embed.py`)
Mounts SARA's HUD window directly into the hidden `WorkerW` layer behind desktop icons.
"""

import os


def embed_window_as_wallpaper(window_title: str) -> bool:
    """Finds SARA's HUD window by title and attaches it behind Windows 10 desktop icons."""
    if os.name != "nt":
        return False
    try:
        import win32con
        import win32gui

        progman = win32gui.FindWindow("Progman", None)
        if not progman:
            return False

        # Spawn hidden WorkerW layer behind SHELLDLL_DefView desktop icons
        win32gui.SendMessageTimeout(progman, 0x052C, 0, 0, win32con.SMTO_NORMAL, 1000)

        workerw = None

        def enum_windows_cb(hwnd, _):
            nonlocal workerw
            shell_view = win32gui.FindWindowEx(hwnd, 0, "SHELLDLL_DefView", None)
            if shell_view != 0:
                workerw = win32gui.FindWindowEx(0, hwnd, "WorkerW", None)
            return True

        win32gui.EnumWindows(enum_windows_cb, None)
        sara_hwnd = win32gui.FindWindow(None, window_title)
        if not sara_hwnd or not workerw:
            return False

        style = win32gui.GetWindowLong(sara_hwnd, win32con.GWL_STYLE)
        style &= ~(win32con.WS_CAPTION | win32con.WS_THICKFRAME)
        win32gui.SetWindowLong(sara_hwnd, win32con.GWL_STYLE, style)
        win32gui.SetParent(sara_hwnd, workerw)
        win32gui.ShowWindow(sara_hwnd, win32con.SW_SHOWMAXIMIZED)
        return True
    except Exception:
        return False
