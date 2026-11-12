"""
SARA OS Standalone Futuristic Desktop Client (Safe Windowed / Fullscreen PyQt6 UI)
- 4 Morphing Futuristic Themes completely separate from standard Windows / Classic SARA UI
- Connects to SARA's local server (http://127.0.0.1:3000) — zero Ollama, zero Supabase
- NEVER modifies Windows Winlogon / Explorer registry keys; exits cleanly to standard desktop at any time.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.request

UI_THEMES = {
    "NEURAL_HUD": {
        "name": "01 // AURORA SPATIAL (SARA CORE)",
        "bg": "#050A14",
        "panel": "#0B162C",
        "accent": "#00F0FF",
        "text": "#E0F7FA",
        "border": "1px solid #00F0FF",
    },
    "CYBER_ARCHITECT": {
        "name": "02 // CYBER ARCHITECT (SARA R&D)",
        "bg": "#080510",
        "panel": "#140C28",
        "accent": "#B829EA",
        "text": "#F3E5F5",
        "border": "1px solid #B829EA",
    },
    "TACTICAL_CRIMSON": {
        "name": "03 // SENTINEL PERIMETER (DEFENSE)",
        "bg": "#120404",
        "panel": "#260808",
        "accent": "#FF2A2A",
        "text": "#FFEBEE",
        "border": "1px solid #FF2A2A",
    },
    "ZENITH_STEALTH": {
        "name": "04 // ZENITH STEALTH (MINIMAL)",
        "bg": "#09090B",
        "panel": "#121215",
        "accent": "#10B981",
        "text": "#ECFDF5",
        "border": "1px solid #27272A",
    },
}


def post_local_sara(base_url: str, route: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{base_url}{route}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def launch_pyqt_shell(base_url: str = "http://127.0.0.1:3000") -> int:
    try:
        import psutil  # type: ignore
        from PyQt6.QtCore import Qt, QTimer  # type: ignore
        from PyQt6.QtGui import QFont  # type: ignore
        from PyQt6.QtWidgets import (  # type: ignore
            QApplication,
            QFrame,
            QHBoxLayout,
            QLabel,
            QLineEdit,
            QMainWindow,
            QPushButton,
            QStackedWidget,
            QTextEdit,
            QVBoxLayout,
            QWidget,
        )
    except ImportError as exc:
        print(f"[SARA OS] PyQt6/psutil not installed ({exc}). Use SARA Web Surface '?mode=sara-os' or Companion Settings.")
        return 0

    class SaraOSDesktop(QMainWindow):
        def __init__(self) -> None:
            super().__init__()
            self.current_theme_key = "NEURAL_HUD"
            self.auto_ui_morph = True
            self.setWindowTitle("SARA OS // Futuristic Desktop Workspace")
            self.resize(1360, 820)

            central = QWidget()
            self.setCentralWidget(central)
            self.main_layout = QVBoxLayout(central)
            self.main_layout.setContentsMargins(16, 12, 16, 12)

            top_bar = QFrame()
            top_layout = QHBoxLayout(top_bar)
            self.brand_label = QLabel("SARA OS // LOCAL AUTONOMOUS KERNEL")
            self.brand_label.setFont(QFont("Consolas", 12, QFont.Weight.Bold))
            self.stats_label = QLabel("CPU: 0% | RAM: 0% | UI: NEURAL_HUD")
            btn_settings = QPushButton("COMPANION & UI SETTINGS")
            btn_exit = QPushButton("EXIT TO STANDARD DESKTOP")
            btn_exit.clicked.connect(self.close)
            top_layout.addWidget(self.brand_label)
            top_layout.addStretch()
            top_layout.addWidget(self.stats_label)
            top_layout.addWidget(btn_settings)
            top_layout.addWidget(btn_exit)
            self.main_layout.addWidget(top_bar)

            self.stack = QStackedWidget()
            btn_settings.clicked.connect(lambda: self.stack.setCurrentIndex(1))

            desk = QWidget()
            desk_layout = QHBoxLayout(desk)
            self.rd_console = QTextEdit()
            self.rd_console.setReadOnly(True)
            desk_layout.addWidget(self.rd_console, 2)

            right = QVBoxLayout()
            banner = QLabel("SARA OS ACTIVE // LOCAL GEMINI + FORMAL GATE")
            banner.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.cmd_input = QLineEdit()
            self.cmd_input.setPlaceholderText("Enter SARA OS directive or Simulation Lab invention...")
            self.cmd_input.returnPressed.connect(self._dispatch)
            right.addWidget(banner)
            right.addStretch()
            right.addWidget(self.cmd_input)
            desk_layout.addLayout(right, 3)

            settings = QWidget()
            set_layout = QVBoxLayout(settings)
            for key, data in UI_THEMES.items():
                b = QPushButton(f"ACTIVATE UI: {data['name']}")
                b.clicked.connect(lambda _checked=False, k=key: self._manual_switch(k))
                set_layout.addWidget(b)
            self.btn_auto = QPushButton("AUTO-UI MORPHING: ENABLED")
            self.btn_auto.clicked.connect(self._toggle_auto)
            set_layout.addWidget(self.btn_auto)
            btn_back = QPushButton("<- RETURN TO SARA OS DESKTOP")
            btn_back.clicked.connect(lambda: self.stack.setCurrentIndex(0))
            set_layout.addWidget(btn_back)
            set_layout.addStretch()

            self.stack.addWidget(desk)
            self.stack.addWidget(settings)
            self.main_layout.addWidget(self.stack)

            dock_bar = QFrame()
            dock = QHBoxLayout(dock_bar)
            for label, cmd in [("TERMINAL", "cmd.exe"), ("CODE STUDIO", "code")]:
                btn = QPushButton(label)
                btn.clicked.connect(lambda _c=False, c=cmd: subprocess.Popen(c, shell=True))
                dock.addWidget(btn)
            self.main_layout.addWidget(dock_bar)

            self.apply_theme("NEURAL_HUD")
            self.timer = QTimer()
            self.timer.timeout.connect(self._tick)
            self.timer.start(2000)

        def apply_theme(self, key: str) -> None:
            self.current_theme_key = key
            t = UI_THEMES[key]
            self.setStyleSheet(
                f"QMainWindow, QWidget {{ background-color: {t['bg']}; color: {t['text']}; font-family: Consolas; }}"
                f"QFrame {{ background-color: {t['panel']}; border: {t['border']}; border-radius: 6px; padding: 6px; }}"
                f"QPushButton {{ background-color: {t['panel']}; color: {t['accent']}; border: {t['border']}; padding: 8px 14px; font-weight: bold; }}"
                f"QLineEdit, QTextEdit {{ background-color: {t['panel']}; color: {t['text']}; border: {t['border']}; padding: 8px; }}"
            )
            self.rd_console.append(f"[UI MORPH] Active Environment -> {t['name']}")

        def _manual_switch(self, key: str) -> None:
            self.auto_ui_morph = False
            self.btn_auto.setText("AUTO-UI MORPHING: MANUAL LOCK")
            self.apply_theme(key)

        def _toggle_auto(self) -> None:
            self.auto_ui_morph = not self.auto_ui_morph
            self.btn_auto.setText(f"AUTO-UI MORPHING: {'ENABLED' if self.auto_ui_morph else 'DISABLED'}")

        def _tick(self) -> None:
            cpu = psutil.cpu_percent()
            ram = psutil.virtual_memory().percent
            self.stats_label.setText(f"CPU: {cpu}% | RAM: {ram}% | UI: {self.current_theme_key}")
            if self.auto_ui_morph:
                if cpu > 85 and self.current_theme_key != "TACTICAL_CRIMSON":
                    self.apply_theme("TACTICAL_CRIMSON")
                elif cpu <= 85 and self.current_theme_key == "TACTICAL_CRIMSON":
                    self.apply_theme("NEURAL_HUD")

        def _dispatch(self) -> None:
            directive = self.cmd_input.text().strip()
            if not directive:
                return
            self.cmd_input.clear()
            self.rd_console.append(f"\n> DIRECTIVE: {directive}")
            if self.auto_ui_morph and any(w in directive.lower() for w in ("build", "code", "create", "research", "innovate")):
                self.apply_theme("CYBER_ARCHITECT")
            try:
                res = post_local_sara(base_url, "/api/asi/kernel/cycle", {"objective": directive})
                self.rd_console.append(f"[SARA-ASI]: {json.dumps(res.get('summary') or res)}")
            except Exception as exc:
                self.rd_console.append(f"[LOCAL API ERROR]: {exc}")

    app = QApplication(sys.argv)
    win = SaraOSDesktop()
    win.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(launch_pyqt_shell())
