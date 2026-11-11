from __future__ import annotations

import unittest
import sys
from unittest.mock import patch

from desktop_agent import tools_websites
from desktop_agent.registry import ToolError


class YouTubeControlTests(unittest.TestCase):
    @patch.object(tools_websites.platform, "system", return_value="Windows")
    def test_rejects_unsupported_action_before_input(self, _system) -> None:
        with self.assertRaises(ToolError):
            tools_websites.youtube_control({"action": "delete"})

    @patch.object(tools_websites.platform, "system", return_value="Windows")
    def test_requires_youtube_foreground_window(self, _system) -> None:
        fake_psutil = type("P", (), {"Process": lambda _self, _pid: type("Proc", (), {"name": lambda _self: "chrome.exe"})()})()
        fake_pyautogui = type("PyAutoGUI", (), {})()
        fake_gui = type("Gui", (), {"GetForegroundWindow": lambda _self: 1, "GetWindowText": lambda _self, _hwnd: "Google Chrome"})()
        fake_proc = type("Proc", (), {"GetWindowThreadProcessId": lambda _self, _hwnd: (0, 1)})()
        with patch.dict("sys.modules", {"psutil": fake_psutil}), \
             patch.dict(sys.modules, {"pyautogui": fake_pyautogui}), \
             patch.dict(sys.modules, {"win32gui": fake_gui, "win32process": fake_proc}):
            with self.assertRaises(ToolError):
                tools_websites.youtube_control({"action": "pause"})

    @patch.object(tools_websites.platform, "system", return_value="Linux")
    def test_tab_close_rejects_unsupported_platform(self, _system) -> None:
        with self.assertRaises(ToolError):
            tools_websites.close_browser_tab({"title": "YouTube"})


if __name__ == "__main__":
    unittest.main()
