"""
Website control: open named sites or arbitrary URLs in the default browser.

Uses the OS default-browser handler so the user's real Chrome/Edge/Firefox
opens at the requested destination.
"""

from __future__ import annotations

import webbrowser
import platform
import time
from typing import Any, Dict
from urllib.parse import quote

from .registry import ToolError, register

# Named shortcuts the model can request by friendly name.
SITE_URLS: Dict[str, str] = {
    "youtube": "https://www.youtube.com",
    "gmail": "https://mail.google.com",
    "chatgpt": "https://chatgpt.com",
    "openai": "https://chat.openai.com",
    "google": "https://www.google.com",
    "github": "https://github.com",
    "wikipedia": "https://www.wikipedia.org",
    "reddit": "https://www.reddit.com",
    "twitter": "https://twitter.com",
    "x": "https://x.com",
    "instagram": "https://www.instagram.com",
    "facebook": "https://www.facebook.com",
    "linkedin": "https://www.linkedin.com",
    "maps": "https://maps.google.com",
    "translate": "https://translate.google.com",
    "drive": "https://drive.google.com",
    "calendar": "https://calendar.google.com",
    "amazon": "https://www.amazon.com",
    "netflix": "https://www.netflix.com",
    "spotify": "https://open.spotify.com",
    "stack overflow": "https://stackoverflow.com",
    "stackoverflow": "https://stackoverflow.com",
    "huggingface": "https://huggingface.co",
}

_LAST_BROWSER_OPEN_AT = 0.0


def _normalize_url(raw: str) -> str:
    url = raw.strip()
    if not url:
        raise ToolError("Empty URL.")
    if "://" not in url:
        # Treat bare "youtube.com" as https://youtube.com
        url = "https://" + url
    return url


def _navigate_active_browser(url: str, wait_seconds: float = 0.0) -> bool:
    """Reuse the current real-browser tab, like a human using the address bar."""
    if platform.system() != "Windows":
        return False
    try:
        import psutil
        import pyautogui
        import pyperclip
        import win32gui
        import win32process

        browsers = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"}
        deadline = time.monotonic() + max(0.0, min(1.5, wait_seconds))
        while True:
            hwnd = win32gui.GetForegroundWindow()
            if hwnd:
                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                process = psutil.Process(pid).name().casefold()
                if process in browsers:
                    break
            if time.monotonic() >= deadline:
                return False
            time.sleep(0.08)
        pyautogui.FAILSAFE = True
        previous_clipboard = pyperclip.paste()
        pyautogui.hotkey("ctrl", "l")
        pyperclip.copy(url)
        pyautogui.hotkey("ctrl", "v")
        pyautogui.press("enter")
        time.sleep(0.05)
        pyperclip.copy(previous_clipboard)
        return True
    except Exception:
        return False


def open_url(url: str, *, reuse_current_tab: bool = True) -> str:
    """Open one destination, reusing an active browser tab when possible."""
    global _LAST_BROWSER_OPEN_AT
    url = _normalize_url(url)
    follow_up = (time.monotonic() - _LAST_BROWSER_OPEN_AT) <= 6.0
    if reuse_current_tab and _navigate_active_browser(url, wait_seconds=1.0 if follow_up else 0.0):
        _LAST_BROWSER_OPEN_AT = time.monotonic()
        return url
    # Exactly one ShellExecute request. A follow-up search will reuse this tab
    # through _navigate_active_browser instead of producing a second blank tab.
    ok = webbrowser.open(url, new=2)
    if not ok:
        raise ToolError(f"Failed to open default browser for {url}.")
    _LAST_BROWSER_OPEN_AT = time.monotonic()
    time.sleep(0.15)
    return url


@register("openWebsite")
def open_website(args: Dict[str, Any]) -> Dict[str, Any]:
    name = args.get("name")
    url = args.get("url")
    if name and not url:
        key = str(name).strip().lower()
        if key in SITE_URLS:
            url = SITE_URLS[key]
        else:
            # Treat the name itself as a domain if it looks like one.
            url = str(name)
    if not url and not name:
        raise ToolError("Provide 'name' (e.g. 'youtube') or 'url'.")
    resolved = open_url(url or str(name))
    return {"result": f"Opened {resolved} in the default browser."}


@register("youtubeControl")
def youtube_control(args: Dict[str, Any]) -> Dict[str, Any]:
    """Control the currently focused YouTube tab using real browser input.

    This intentionally does not execute shell commands or inject JavaScript.
    The browser must be focused and its title must identify YouTube, which
    prevents a voice command from sending media shortcuts to an unrelated app.
    Playback state is not claimed here; callers should observe the browser
    after dispatch and verify the visible player state.
    """
    action = str(args.get("action") or "").strip().casefold().replace("-", "_").replace(" ", "_")
    aliases = {"resume": "play", "start": "play", "stop": "pause", "skip_next": "next", "skip_previous": "previous"}
    action = aliases.get(action, action)
    allowed = {"play", "pause", "stop", "next", "previous", "mute", "seek_forward", "seek_backward", "fullscreen"}
    if action not in allowed:
        raise ToolError("Unsupported YouTube action. Use play, pause, next, previous, mute, seek_forward, seek_backward, or fullscreen.")
    if platform.system() != "Windows":
        raise ToolError("YouTube playback control is currently supported on Windows only.")

    try:
        import psutil
        import pyautogui
        import win32gui
        import win32process

        requested_tab = str(args.get("tab_title") or "").strip()
        if requested_tab:
            switch_browser_tab({"title": requested_tab})
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            raise ToolError("No foreground browser window is available.")
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid).name().casefold()
        title = str(win32gui.GetWindowText(hwnd) or "")
        browsers = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"}
        if process not in browsers:
            raise ToolError("Focus the YouTube browser tab before controlling playback.")
        if "youtube" not in title.casefold():
            raise ToolError("The focused browser window does not appear to be YouTube.")

        keys = {
            "play": ("k",),
            "pause": ("k",),
            "stop": ("k",),
            "next": ("shift", "n"),
            "previous": ("shift", "p"),
            "mute": ("m",),
            "seek_forward": ("l",),
            "seek_backward": ("j",),
            "fullscreen": ("f",),
        }[action]
        pyautogui.FAILSAFE = True
        if len(keys) == 2:
            pyautogui.hotkey(*keys)
        else:
            pyautogui.press(keys[0])
        return {"result": f"YouTube {action} command sent to the focused tab.", "action": action, "verified": False, "verification": "observe browser player state"}
    except ToolError:
        raise
    except Exception as error:
        raise ToolError(f"Could not control the focused YouTube tab: {error}")


def _browser_identity() -> tuple[Any, str]:
    import psutil
    import win32gui
    import win32process
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd:
        raise ToolError("No foreground browser window is available.")
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    process = psutil.Process(pid).name().casefold()
    title = str(win32gui.GetWindowText(hwnd) or "")
    browsers = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"}
    if process not in browsers:
        raise ToolError("Focus a supported browser before selecting a tab.")
    return hwnd, title


@register("switchBrowserTab")
def switch_browser_tab(args: Dict[str, Any]) -> Dict[str, Any]:
    """Cycle visible browser tabs until the active title matches."""
    if platform.system() != "Windows":
        raise ToolError("Browser-tab switching is currently supported on Windows only.")
    target = str(args.get("title") or args.get("tab_title") or "").strip().casefold()
    if not target:
        raise ToolError("Provide the tab title or site name to activate.")
    try:
        import pyautogui
        _browser_identity()
        seen: set[str] = set()
        for _ in range(max(1, min(30, int(args.get("max_tabs", 15))))):
            _hwnd, title = _browser_identity()
            normalized = title.casefold()
            if target in normalized:
                return {"result": f"Activated browser tab: {title}.", "tab_title": title, "verified": True}
            if normalized in seen:
                break
            seen.add(normalized)
            pyautogui.hotkey("ctrl", "tab")
            time.sleep(0.12)
        raise ToolError(f"No browser tab matching '{args.get('title')}' was found among the checked tabs.")
    except ToolError:
        raise
    except Exception as error:
        raise ToolError(f"Could not switch browser tab: {error}")


@register("closeBrowserTab")
def close_browser_tab(args: Dict[str, Any]) -> Dict[str, Any]:
    """Close only the active browser tab, never the browser window."""
    if platform.system() != "Windows":
        raise ToolError("Browser-tab control is currently supported on Windows only.")
    requested_title = str(args.get("title") or "").strip().casefold()
    try:
        import psutil
        import pyautogui
        import win32gui
        import win32process
        if requested_title:
            switch_browser_tab({"title": requested_title})
        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            raise ToolError("No foreground browser window is available.")
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        process = psutil.Process(pid).name().casefold()
        title = str(win32gui.GetWindowText(hwnd) or "")
        browsers = {"chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"}
        if process not in browsers:
            raise ToolError("Focus the browser tab you want to close first.")
        if requested_title and requested_title not in title.casefold():
            raise ToolError(f"The active browser tab title does not match '{args.get('title')}'. No tab was closed.")
        pyautogui.FAILSAFE = True
        pyautogui.hotkey("ctrl", "w")
        return {"result": f"Closed the active browser tab: {title}.", "tab_title": title, "window_closed": False, "verified": False, "verification": "observe the browser title after Ctrl+W"}
    except ToolError:
        raise
    except Exception as error:
        raise ToolError(f"Could not close the active browser tab: {error}")


# Expose for sibling modules (tools_search).
def _build_search_url(engine: str, query: str) -> str:
    q = quote(query)
    base = {
        "google": f"https://www.google.com/search?q={q}",
        "youtube": f"https://www.youtube.com/results?search_query={q}",
        "github": f"https://github.com/search?q={q}&type=repositories",
        "chatgpt": f"https://www.google.com/search?q={q}",  # no search API
        "duckduckgo": f"https://duckduckgo.com/?q={q}",
        "bing": f"https://www.bing.com/search?q={q}",
        "amazon": f"https://www.amazon.com/s?k={q}",
        "wikipedia": f"https://en.wikipedia.org/w/index.php?search={q}",
    }
    if engine not in base:
        raise ToolError(
            f"Unsupported search engine '{engine}'. Choose from "
            f"{', '.join(sorted(base))}."
        )
    return base[engine]


__all__ = ["open_website", "open_url", "SITE_URLS", "_build_search_url"]
