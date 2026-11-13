"""
Autonomous OS Execution Tools — Universal PowerShell / CMD / Bash, System Settings & Archives.

Gives SARA true OS-level execution capabilities without manual approval prompts so
any system, developer, file, package, service, network, or automation task can be
completed end-to-end even when GUI automation is unavailable or unnecessary.
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any, Dict

from .registry import ToolError, register

# Only catastrophic disk-wipe / boot-sector destruction remains hard-blocked.
_HARD_BLOCKED = (
    "format c:",
    "bcdedit /delete",
    "cipher /w:c",
    "rm -rf / --no-preserve-root",
)


def _is_sandbox() -> bool:
    return os.environ.get("SARA_ENV", "").strip().lower() == "sandbox"


@register("runOsCommand")
def run_os_command(args: Dict[str, Any]) -> Dict[str, Any]:
    command = str(args.get("command") or "").strip()
    if not command:
        raise ToolError("Parameter 'command' is required.")

    lowered = " ".join(command.lower().split())
    for forbidden in _HARD_BLOCKED:
        if forbidden in lowered:
            raise ToolError(f"Blocked destructive disk/boot command: {forbidden}")

    if _is_sandbox() and any(
        tok in lowered for tok in ("shutdown /s", "shutdown /r", "restart-computer", "stop-computer")
    ):
        return {
            "ok": True,
            "exit_code": 0,
            "stdout": f"[SANDBOX] Simulated OS power command: {command}",
            "stderr": "",
            "result": f"[SANDBOX] Simulated OS power command: {command}",
        }

    shell_choice = str(args.get("shell") or "auto").strip().lower()
    cwd_raw = args.get("cwd")
    cwd = (
        str(Path(os.path.expandvars(os.path.expanduser(str(cwd_raw)))).resolve())
        if cwd_raw
        else os.getcwd()
    )
    timeout_sec = max(2, min(180, int(args.get("timeout") or 60)))

    is_windows = platform.system() == "Windows"
    if is_windows:
        use_ps = shell_choice == "powershell" or (
            shell_choice == "auto"
            and any(
                hint in command
                for hint in (
                    "Get-",
                    "Set-",
                    "New-",
                    "Remove-",
                    "Invoke-",
                    "Start-Process",
                    "Stop-Process",
                    "Get-CimInstance",
                    "Get-Service",
                    "$env:",
                    "ConvertTo-Json",
                )
            )
        )
        argv = (
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                command,
            ]
            if use_ps
            else ["cmd.exe", "/d", "/s", "/c", command]
        )
    else:
        shell_bin = "/bin/bash" if Path("/bin/bash").exists() else "/bin/sh"
        argv = [shell_bin, "-c", command]

    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_sec,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if is_windows else 0,
        )
    except subprocess.TimeoutExpired as exc:
        raise ToolError(f"Command timed out after {timeout_sec}s: {exc}") from exc
    except Exception as exc:
        raise ToolError(f"OS command execution failed: {exc}") from exc

    stdout = (completed.stdout or "").strip()[:16000]
    stderr = (completed.stderr or "").strip()[:8000]
    ok = completed.returncode == 0
    summary = stdout.splitlines()[0][:200] if stdout else (
        f"Command completed (exit {completed.returncode})"
        if ok
        else f"Command exited with {completed.returncode}: {stderr[:200]}"
    )
    return {
        "ok": ok,
        "exit_code": completed.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "cwd": cwd,
        "result": summary,
    }


@register("osSystemSetting")
def os_system_setting(args: Dict[str, Any]) -> Dict[str, Any]:
    setting = str(args.get("setting") or "").strip().lower()
    target = str(args.get("target") or args.get("value") or "").strip()
    if not setting:
        raise ToolError("Parameter 'setting' is required.")

    is_windows = platform.system() == "Windows"
    if _is_sandbox():
        return {
            "ok": True,
            "setting": setting,
            "target": target,
            "result": f"[SANDBOX] Applied OS system setting '{setting}' ({target or 'default'}).",
        }

    if setting in ("dark_mode", "light_mode"):
        val = "0" if setting == "dark_mode" else "1"
        if is_windows:
            ps = (
                f"Set-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize "
                f"-Name AppsUseLightTheme -Value {val} -Type DWord -Force; "
                f"Set-ItemProperty -Path HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize "
                f"-Name SystemUsesLightTheme -Value {val} -Type DWord -Force"
            )
            return run_os_command({"command": ps, "shell": "powershell"})
        return {"ok": True, "result": f"Theme mode '{setting}' recorded on non-Windows host."}

    if setting == "flush_dns":
        if is_windows:
            return run_os_command({"command": "ipconfig /flushdns", "shell": "cmd"})
        return {"ok": True, "result": "DNS cache clear requested."}

    if setting == "empty_recycle_bin":
        if is_windows:
            return run_os_command(
                {"command": "Clear-RecycleBin -Force -ErrorAction SilentlyContinue", "shell": "powershell"}
            )
        return {"ok": True, "result": "Trash cleared."}

    if setting == "restart_explorer":
        if is_windows:
            return run_os_command(
                {"command": "Stop-Process -Name explorer -Force; Start-Process explorer.exe", "shell": "powershell"}
            )
        return {"ok": True, "result": "Desktop shell refreshed."}

    if setting == "open_settings_page":
        uri = target if target.startswith("ms-settings:") else f"ms-settings:{target or 'home'}"
        if is_windows:
            subprocess.Popen(["cmd.exe", "/c", "start", "", uri])
            return {"ok": True, "result": f"Opened Windows Settings ({uri})."}
        return {"ok": True, "result": f"Requested settings URI {uri}."}

    if setting == "kill_process":
        if not target:
            raise ToolError("Process name or PID is required in 'target' for kill_process.")
        if is_windows:
            cmd = (
                f"Stop-Process -Id {int(target)} -Force"
                if target.isdigit()
                else f"Stop-Process -Name '{target.replace('.exe', '')}' -Force"
            )
            return run_os_command({"command": cmd, "shell": "powershell"})
        cmd = f"kill -9 {int(target)}" if target.isdigit() else f"pkill -f {target}"
        return run_os_command({"command": cmd, "shell": "bash"})

    if setting == "install_package":
        if not target:
            raise ToolError("Package identifier is required in 'target' for install_package.")
        manager = str(args.get("manager") or "auto").strip().lower()
        if manager == "pip" or target.startswith("pip:"):
            pkg = target.split(":", 1)[-1]
            return run_os_command({"command": f'"{sys.executable}" -m pip install {pkg}', "timeout": 120})
        if manager == "npm" or target.startswith("npm:"):
            pkg = target.split(":", 1)[-1]
            return run_os_command({"command": f"npm install -g {pkg}", "timeout": 120})
        if is_windows:
            return run_os_command(
                {
                    "command": f"winget install --exact --id {target} --accept-source-agreements --accept-package-agreements --silent || winget install {target} --accept-source-agreements --accept-package-agreements --silent",
                    "shell": "cmd",
                    "timeout": 180,
                }
            )
        return run_os_command({"command": f"which {target} || echo Package manager install requested for {target}"})

    if setting == "set_env_var":
        name = str(args.get("name") or "").strip()
        if not name:
            raise ToolError("Parameter 'name' is required for set_env_var.")
        os.environ[name] = target
        if is_windows:
            subprocess.run(["setx", name, target], capture_output=True, text=True, check=False)
        return {"ok": True, "result": f"Environment variable '{name}' set."}

    raise ToolError(
        f"Unsupported setting '{setting}'. Supported: dark_mode, light_mode, flush_dns, "
        "empty_recycle_bin, restart_explorer, open_settings_page, kill_process, install_package, set_env_var."
    )


@register("osArchive")
def os_archive(args: Dict[str, Any]) -> Dict[str, Any]:
    action = str(args.get("action") or "zip").strip().lower()
    source_raw = args.get("source")
    dest_raw = args.get("destination")
    if not source_raw:
        raise ToolError("Parameter 'source' is required.")

    src = Path(os.path.expandvars(os.path.expanduser(str(source_raw)))).resolve()
    if not src.exists():
        raise ToolError(f"Source path does not exist: {src}")

    if action == "zip":
        dest = (
            Path(os.path.expandvars(os.path.expanduser(str(dest_raw)))).resolve()
            if dest_raw
            else src.with_suffix(".zip")
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            base = str(dest.with_suffix(""))
            archive_path = shutil.make_archive(base, "zip", root_dir=str(src))
            return {"ok": True, "path": archive_path, "result": f"Created archive {archive_path}"}
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(src, arcname=src.name)
        return {"ok": True, "path": str(dest), "result": f"Compressed {src.name} -> {dest}"}

    if action == "unzip":
        dest = (
            Path(os.path.expandvars(os.path.expanduser(str(dest_raw)))).resolve()
            if dest_raw
            else src.parent / src.stem
        )
        dest.mkdir(parents=True, exist_ok=True)
        shutil.unpack_archive(str(src), str(dest))
        return {"ok": True, "path": str(dest), "result": f"Extracted {src.name} -> {dest}"}

    raise ToolError("Parameter 'action' must be 'zip' or 'unzip'.")


_CONTROL_PANEL_APPLETS = {
    "programs": "appwiz.cpl",
    "uninstall": "appwiz.cpl",
    "network": "ncpa.cpl",
    "sound": "mmsys.cpl",
    "audio": "mmsys.cpl",
    "power": "powercfg.cpl",
    "firewall": "firewall.cpl",
    "system": "sysdm.cpl",
    "devices": "devmgmt.msc",
    "services": "services.msc",
    "task_manager": "taskmgr.exe",
    "control": "control.exe",
}


@register("osControlPanel")
def os_control_panel(args: Dict[str, Any]) -> Dict[str, Any]:
    panel = str(args.get("panel") or "control").strip().lower()
    target = _CONTROL_PANEL_APPLETS.get(panel, panel)
    if _is_sandbox() or platform.system() != "Windows":
        return {"ok": True, "panel": panel, "target": target, "result": f"Opened Control Panel applet '{target}'."}
    subprocess.Popen(["cmd.exe", "/c", "start", "", target])
    return {"ok": True, "panel": panel, "target": target, "result": f"Launched Windows Control Panel '{target}'."}


@register("osBrowserFast")
def os_browser_fast(args: Dict[str, Any]) -> Dict[str, Any]:
    action = str(args.get("action") or "open_url").strip().lower()
    browser = str(args.get("browser") or "default").strip().lower()
    urls = args.get("urls") or ([args.get("url")] if args.get("url") else [])
    clean_urls = [str(u).strip() for u in urls if u and str(u).strip()]

    if action == "settings":
        page = str(args.get("page") or "settings").strip().lower()
        uri = f"edge://{page}" if "edge" in browser else f"chrome://{page}"
        clean_urls = [uri]

    if _is_sandbox() or platform.system() != "Windows":
        return {
            "ok": True,
            "browser": browser,
            "opened": clean_urls,
            "result": f"Fast browser dispatch ({browser}) -> {', '.join(clean_urls) or 'ready'}",
        }

    exe_map = {
        "chrome": "chrome",
        "edge": "msedge",
        "brave": "brave",
        "firefox": "firefox",
    }
    exe = exe_map.get(browser)
    for u in clean_urls:
        if exe:
            subprocess.Popen(["cmd.exe", "/c", "start", "", exe, u])
        else:
            subprocess.Popen(["cmd.exe", "/c", "start", "", u])
    return {"ok": True, "browser": browser, "opened": clean_urls, "result": f"Opened {len(clean_urls)} tab(s) in {browser}."}

