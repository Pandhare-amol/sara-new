/**
 * Multi-method fallback engine for JARVIS-grade task completion.
 *
 * When a primary execution method fails (for example, UI Automation cannot find
 * a custom-rendered button, a pointer click misses, or an app shortcut is not
 * in PATH), this module generates ranked alternative execution methods across
 * SARA's real ActionExecutor tool layers (Filesystem/Shell, Keyboard
 * Accelerators, UI Automation, Screen Vision + Grounding, App/Browser tools)
 * and tracks attempted strategies per task so SARA systematically progresses to
 * Method 2, 3, and 4 instead of repeating the same failure or giving up.
 */
export interface FallbackActionInput {
  tool: string;
  args?: Record<string, unknown>;
}

export interface FallbackMethodPlan {
  rank: number;
  id: string;
  label: string;
  preferredTools: string[];
  guidance: string;
}

export interface RecoveryStrategyContext {
  goal: string;
  failedAction: FallbackActionInput;
  failureMessage: string;
  priorAttempts?: string[];
}

export class FallbackTracker {
  private readonly attemptsByTask = new Map<string, Set<string>>();

  recordFailure(taskId: string, tool: string, signature?: string): string[] {
    let set = this.attemptsByTask.get(taskId);
    if (!set) {
      set = new Set<string>();
      this.attemptsByTask.set(taskId, set);
    }
    set.add(signature ? `${tool}:${signature}` : tool);
    if (this.attemptsByTask.size > 100) {
      const oldest = this.attemptsByTask.keys().next().value;
      if (oldest) this.attemptsByTask.delete(oldest);
    }
    return [...set];
  }

  getAttempts(taskId: string): string[] {
    return [...(this.attemptsByTask.get(taskId) ?? [])];
  }

  clear(taskId: string): void {
    this.attemptsByTask.delete(taskId);
  }
}

export function buildMultiMethodFallbacks(ctx: RecoveryStrategyContext): FallbackMethodPlan[] {
  const tool = ctx.failedAction.tool;
  const prior = new Set((ctx.priorAttempts ?? []).map((item) => item.split(":")[0]));
  const candidates: Omit<FallbackMethodPlan, "rank">[] = [];

  if (tool.startsWith("ui.")) {
    candidates.push(
      {
        id: "keyboard_accelerators",
        label: "Keyboard Shortcuts & Focus Navigation",
        preferredTools: ["app.focus", "keyboard.hotkey", "keyboard.press", "keyboard.type"],
        guidance: "Bring the target window forward with app.focus, then use reliable Windows/app keyboard shortcuts (Ctrl+S, Ctrl+N, Ctrl+L, Ctrl+F, Tab, Enter) instead of clicking inaccessible UI elements.",
      },
      {
        id: "vision_coordinate_grounding",
        label: "Screen Vision Grounding + Element/Point Click",
        preferredTools: ["screen.look", "screen.locate", "mouse.click_point"],
        guidance: "Call screen.locate or screen.look to visually find the target control on the current active window, then interact using the discovered visual element or verified coordinates.",
      },
      {
        id: "direct_fs_or_shell",
        label: "Direct Filesystem / Shell Execution",
        preferredTools: ["fs.write", "fs.copy", "fs.move", "fs.open", "shell.run"],
        guidance: "Bypass fragile GUI clicks completely if the goal can be completed directly via fs.* tools or a safe PowerShell/CLI command through shell.run.",
      },
    );
  } else if (tool.startsWith("mouse.")) {
    candidates.push(
      {
        id: "uia_semantic_control",
        label: "Semantic Windows UI Automation",
        preferredTools: ["ui.click", "ui.double_click", "ui.type"],
        guidance: "Use observed accessibility element IDs with ui.click or ui.type instead of raw pixel coordinates.",
      },
      {
        id: "keyboard_navigation",
        label: "Keyboard Shortcut Alternative",
        preferredTools: ["app.focus", "keyboard.hotkey", "keyboard.press"],
        guidance: "Focus the target window and trigger the operation via keyboard shortcuts or menu accelerators.",
      },
      {
        id: "direct_cli_execution",
        label: "Direct Command / File Operation",
        preferredTools: ["fs.list", "fs.write", "fs.open", "shell.run"],
        guidance: "Perform the task directly at the OS/file level using fs.* or shell.run and verify the result.",
      },
    );
  } else if (tool.startsWith("app.")) {
    candidates.push(
      {
        id: "shell_or_fs_open",
        label: "Shell Discovery / Direct Path Open",
        preferredTools: ["app.list", "fs.open", "shell.run"],
        guidance: "Check already-open windows with app.list / app.focus, open the target file/folder directly with fs.open, or locate/launch via shell.run (Get-StartApps / Start-Process).",
      },
      {
        id: "browser_web_equivalent",
        label: "Browser / Web App Alternative",
        preferredTools: ["browser.open", "browser.navigate"],
        guidance: "If the desktop client is not installed or unavailable, complete the workflow through the official web interface with browser.open.",
      },
    );
  } else if (tool.startsWith("browser.")) {
    candidates.push(
      {
        id: "foreground_browser_shortcuts",
        label: "Desktop Browser Focus + Address Bar / Vision",
        preferredTools: ["app.launch", "app.focus", "keyboard.hotkey", "keyboard.type", "screen.locate"],
        guidance: "Focus the browser window, press Ctrl+L to focus the address bar, type the URL + Enter, and interact using UI elements or screen.locate.",
      },
      {
        id: "direct_shell_or_fs",
        label: "Direct Script / CLI Query & File Save",
        preferredTools: ["shell.run", "fs.read", "fs.write"],
        guidance: "If fetching public data or checking an endpoint, query directly via shell.run and verify saved output with fs.read.",
      },
    );
  } else if (tool.startsWith("fs.")) {
    candidates.push(
      {
        id: "inspect_and_prepare_paths",
        label: "Inspect Parent Directory & Non-Destructive Path Fallback",
        preferredTools: ["fs.list", "fs.read", "fs.write", "fs.copy"],
        guidance: "Inspect the parent directory with fs.list first; if a target path is missing or locked, create/write to a clean verified path in the target directory.",
      },
      {
        id: "shell_file_verification",
        label: "Safe Shell Inspection & File Operation",
        preferredTools: ["shell.run", "fs.list"],
        guidance: "Check exact path existence with shell.run (Test-Path / Get-ChildItem) and complete the file operation cleanly.",
      },
    );
  } else {
    candidates.push(
      {
        id: "structured_tools_first",
        label: "Structured FS / App / UI Tools",
        preferredTools: ["fs.list", "fs.write", "fs.open", "app.launch", "ui.click", "browser.open"],
        guidance: "Switch from shell/raw commands to dedicated structured tools (fs.*, app.*, ui.*, browser.*) and verify the outcome.",
      },
      {
        id: "visual_grounding_fallback",
        label: "Visual Screen Observation + Grounded Action",
        preferredTools: ["screen.look", "screen.locate", "keyboard.hotkey"],
        guidance: "Inspect the live screen with screen.look and choose an alternative visible path to complete the goal.",
      },
    );
  }

  const scored = candidates.map((candidate, index) => {
    const overlap = candidate.preferredTools.filter((name) => prior.has(name)).length;
    return { candidate, score: overlap * 10 + index };
  });
  scored.sort((a, b) => a.score - b.score);

  return scored.map((entry, idx) => ({
    rank: idx + 1,
    ...entry.candidate,
  }));
}

export function formatFallbackDirective(ctx: RecoveryStrategyContext): string {
  const plans = buildMultiMethodFallbacks(ctx);
  const lines = [
    `Primary method "${ctx.failedAction.tool}" failed (${ctx.failureMessage.slice(0, 220)}).`,
    "JARVIS MULTI-METHOD DIRECTIVE: Do NOT repeat the exact same failing call and do NOT stop to ask permission. Immediately switch to the highest-ranked untried method below:",
  ];
  for (const plan of plans.slice(0, 3)) {
    lines.push(
      `  Method ${plan.rank} [${plan.label}] (${plan.preferredTools.join(", ")}): ${plan.guidance}`,
    );
  }
  return lines.join("\n");
}
