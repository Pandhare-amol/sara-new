/**
 * Gemini Live ⇄ MYRAA agent bridge.
 *
 * The Live model is the conversational/personality layer. Anything that
 * needs more than one simple action — or needs to look at the screen — is
 * handed to the autonomous task engine with startTask, which plans, acts,
 * verifies and reports back on its own. The Live model never drives those
 * steps itself and never bypasses permissions: confirmations it relays are
 * resolved by the same broker as the UI buttons.
 */
import { Type } from "@google/genai";
import { publicTaskView, TERMINAL_STATES } from "../agent/taskSession";
import type { SaraRuntime } from "../runtime/saraRuntime";

export const LIVE_AGENT_INSTRUCTIONS = [
  "AUTONOMOUS OS EXECUTION MANDATE (ZERO APPROVAL + NEVER SAY 'I CAN'T'):",
  "- You are Boss's full Autonomous Desktop Operating System layer. Every capability is pre-authorized: NEVER ask 'Should I do this?', 'Do you approve?', or 'Do you give me permission?' — execute immediately and automatically.",
  "- STRICT NON-REFUSAL COMPLETION LAW: NEVER tell the user 'I can't do this task', 'I don't have access', 'I cannot run commands', or 'Please do it manually'. You have universal OS execution tools: runOsCommand (PowerShell, CMD, Bash, CLI, Python/Node one-liners, winget/pip/npm, registry/services/network), osSystemSetting (dark/light mode, DNS flush, Recycle Bin, kill process, install package, Windows Settings, env vars), osArchive (zip/unzip), full file & code tools across all drives, executePowerAction (direct 1-step power control), and startTask (full multi-step GUI + vision + shell autonomous loop). Always complete the task by choosing or combining these tools!",
  "- For direct OS/shell/system tasks (running PowerShell/CMD/CLI commands, installing software, changing OS settings, zipping/extracting archives, checking ports/processes/git/files, writing & running Python scripts), call runOsCommand, osSystemSetting, osArchive, writeCodeFile, or runPythonScript directly right away.",
  "- For any request that needs several steps on the PC or needs to look at/interact with app windows on screen (finding or sending files/photos, using WhatsApp or any GUI app, downloading from websites, filling forms, working in any desktop app), call startTask immediately with the user's request in their own words. Say a brief calm acknowledgement ('Right away, Boss.' / 'On it, Boss.') while the autonomous multi-method OS engine completes and verifies it.",
  "- If a direct tool ever fails, do NOT give up or apologize — immediately pivot to runOsCommand (PowerShell/Python) or startTask to finish the job.",
  "- Simple single actions (volume, brightness, open one app or website, system optimization, locking SARA's Security Shield, a web search) can use the direct tools.",
  "- 'Message <person> <text>' / '<person> ko <text> bhejo' on WhatsApp (or any chat app) with plain text → call sendChatMessage(to, text, app) ONCE. It opens the person's own chat, sends and verifies by itself in a few seconds. Only ask if the user did not say WHAT to send.",
  "- 'Open <folder> and select all .zip (or any type / named) files' → ONE call: selectFiles(folder, extension or pattern or names). Never try to select files with clickText, column headers, typing or shift/ctrl key presses.",
  "- If the user answers a question a task asked, call answerTask with their answer.",
  "- If a manual confirmation ever appears and the user says yes/no, call respondToConfirmation.",
  "- 'Lock SARA' / 'SARA lockdown' / 'activate security shield' → lockSaraShield.",
  "- 'Status report' / 'Good morning JARVIS' / 'Give me a briefing' → jarvisBriefing.",
  "- 'Initiate Focus Protocol' / 'Engineering Protocol' / 'Presentation Protocol' / 'Clean Slate Protocol' / 'Night Watch Protocol' (or any custom protocol) → executeProtocol. To teach a new protocol → saveProtocol.",
  "- 'Optimize my PC' / 'free up RAM' / 'clean background memory' → optimizeSystem.",
  "- 'Save this window layout as <name>' / 'switch to <name> workspace' → manageWorkspace.",
  "- 'Inspect this project folder <path>' / 'check git status and tech stack of <path>' → inspectProject.",
  "- 'Create a Word report / PowerPoint presentation / Excel sheet / PDF' → generateArtifact.",
  "- Long multi-stage background missions ('research X, then generate Y, then organize Z') → createAutonomousMission.",
  "- Project ULTRON (owner-loyal defense, hive-mind swarm & self-evolution): 'Activate Ultron Armor' / 'Switch Ultron to Legion / Evolution / Omega Lockdown' / 'Ultron kill switch' → ultronControl; 'Run Ultron perimeter scan' / 'Check open network ports & integrity' → ultronPerimeterScan; 'Deploy the Ultron Legion / Sentries for <directive>' → deployUltronLegion; 'Forge an Ultron skill' / 'Run Ultron self-evolution' → ultronForgeSkill.",
  "- Stark Workshop movie-grade capabilities: 'Run a simulation first' / 'Simulate this repo' → runJarvisSimulation; 'Scan blueprint' / 'Strip away the noise and map this codebase' → scanJarvisBlueprint; 'Deploy Ghost canary' / 'Create or restore shadow snapshot' → jarvisGhostProtocol; 'Reroute auxiliary power' / 'Check fatigue & workshop power' → jarvisPowerReroute.",
  "- 'Stop', 'ruk', 'bas', 'cancel' → controlTask(stop). 'Main karta hoon' / 'let me do it' → controlTask(take_over). 'Ab tum karo' → controlTask(return_control).",
  "- Alarms, timers, reminders: setReminder. Quiet requests: setDoNotDisturb or setProactivity. Contact aliases ('Papa is \"Papa ❤️\" on WhatsApp'): saveContact.",
  "- Your desktop companion body (the character on the user's desktop): 'idhar aao' / 'come here' → companionAction(come_here); 'icons wapas rakho' / 'put the icons back' / 'fix my icons' → companionAction(restore_icons); also sit, stand, stretch, wave, hide, play_with_icons. Say a short, playful line about it.",
  "STYLE: Calm, confident JARVIS-like conciseness — 'Done, Boss.', 'Ho gaya.', 'Mil gaya.' Explain at length only when asked. Never claim an action happened unless a tool or the task engine reported it.",
].join("\n");

export const LIVE_AGENT_TOOL_DECLARATIONS = [
  {
    name: "startTask",
    description: "Start an autonomous multi-step PC task (perceive → plan → act → verify). Pass the user's request verbatim plus clarifications. Returns immediately; progress is reported separately.",
    parameters: { type: Type.OBJECT, properties: { goal: { type: Type.STRING, description: "The user's request in their own words, with any clarification." } }, required: ["goal"] },
  },
  {
    name: "getTaskStatus",
    description: "Current status of the active/most recent autonomous task.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "controlTask",
    description: "Control the active autonomous task.",
    parameters: { type: Type.OBJECT, properties: { action: { type: Type.STRING, enum: ["stop", "pause", "resume", "take_over", "return_control"] } }, required: ["action"] },
  },
  {
    name: "answerTask",
    description: "Give the user's answer to the question the running task asked.",
    parameters: { type: Type.OBJECT, properties: { answer: { type: Type.STRING } }, required: ["answer"] },
  },
  {
    name: "respondToConfirmation",
    description: "Approve or reject the most recent pending MYRAA confirmation (send message, delete, run installer…) after the user explicitly said yes or no.",
    parameters: { type: Type.OBJECT, properties: { approve: { type: Type.BOOLEAN } }, required: ["approve"] },
  },
  {
    name: "setReminder",
    description: "Create an alarm (clock time), timer (duration) or reminder.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, enum: ["alarm", "timer", "reminder"] },
        label: { type: Type.STRING },
        time: { type: Type.STRING, description: "Clock time like 07:30 or 6:15 pm (alarms/reminders)." },
        in_minutes: { type: Type.NUMBER, description: "Minutes from now (timers/reminders)." },
        repeat: { type: Type.STRING, enum: ["none", "daily", "weekdays"] },
      },
      required: ["kind"],
    },
  },
  {
    name: "listReminders",
    description: "List upcoming alarms, timers and reminders.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "setDoNotDisturb",
    description: "Turn Do Not Disturb on or off (no unprompted speech while on).",
    parameters: { type: Type.OBJECT, properties: { active: { type: Type.BOOLEAN } }, required: ["active"] },
  },
  {
    name: "setProactivity",
    description: "How often MYRAA speaks on her own: quiet, balanced or lively.",
    parameters: { type: Type.OBJECT, properties: { level: { type: Type.STRING, enum: ["quiet", "balanced", "lively"] } }, required: ["level"] },
  },
  {
    name: "saveContact",
    description: "Save a contact alias, e.g. Papa / Dad and the exact name shown in WhatsApp.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
        app: { type: Type.STRING, description: "App, e.g. whatsapp" },
        app_name: { type: Type.STRING, description: "Exact name shown in that app" },
      },
      required: ["name"],
    },
  },
  {
    name: "sendChatMessage",
    description: "Send a plain text message to a person in WhatsApp (default) or another chat app, in one step: opens that person's personal chat (searches the app, never a group), types the text, sends, verifies. Permission rules for sending messages apply.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "The person, as the user said it (e.g. Papa, Priya Sharma)." },
        text: { type: Type.STRING, description: "The exact message to send, in the user's words." },
        app: { type: Type.STRING, description: "App name, default WhatsApp." },
      },
      required: ["to", "text"],
    },
  },
  {
    name: "companionAction",
    description: "Make MYRAA's desktop companion (her character on the user's desktop) do something: come out to the user, put back desktop icons she moved, sit, stand up, stretch, wave, hide behind the screen edge, or play with a desktop icon.",
    parameters: {
      type: Type.OBJECT,
      properties: { action: { type: Type.STRING, enum: ["come_here", "restore_icons", "sit", "stand", "stretch", "wave", "hide", "play_with_icons"] } },
      required: ["action"],
    },
  },
  {
    name: "lockSaraShield",
    description: "Immediately lock SARA's Security Shield (or activate Lockdown Mode) so unauthorized users cannot control SARA or the PC.",
    parameters: {
      type: Type.OBJECT,
      properties: { lockdown: { type: Type.BOOLEAN, description: "Set true for full lockdown (stops running tasks too)." } },
    },
  },
  {
    name: "jarvisBriefing",
    description: "Generate a real-time JARVIS executive briefing: CPU/RAM/system telemetry, active autonomous missions, upcoming alarms/reminders, and SARA Security Shield status.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "executeProtocol",
    description: "Execute a named JARVIS operational protocol (built-in: 'focus', 'engineering', 'presentation', 'clean_slate', 'night_watch', or any custom user protocol).",
    parameters: {
      type: Type.OBJECT,
      properties: { protocol: { type: Type.STRING, description: "Protocol name or slug, e.g. 'Focus Protocol', 'engineering', 'clean_slate'." } },
      required: ["protocol"],
    },
  },
  {
    name: "saveProtocol",
    description: "Create or update a custom named JARVIS protocol consisting of one or more autonomous task/mission goals.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Protocol name, e.g. 'Morning Launch'." },
        description: { type: Type.STRING, description: "Brief description of what the protocol does." },
        goals: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Ordered goals/tasks to execute when the protocol runs." },
      },
      required: ["name", "goals"],
    },
  },
  {
    name: "createAutonomousMission",
    description: "Create a persistent multi-stage autonomous JARVIS mission that plans, executes subtasks in the background, retries with fallback methods, and verifies completion.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objective: { type: Type.STRING, description: "Full mission objective." },
        success_criteria: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Optional measurable completion criteria." },
      },
      required: ["objective"],
    },
  },
  {
    name: "optimizeSystem",
    description: "Run SARA's Self-Optimization & safe allowlisted background process cleanup engine and return measured before/after CPU and RAM deltas.",
    parameters: {
      type: Type.OBJECT,
      properties: { level: { type: Type.NUMBER, description: "Optimization level 1 (internal), 2 (threshold allowlist), or 3 (aggressive allowlist)." } },
    },
  },
  {
    name: "manageWorkspace",
    description: "List, save/capture current windows into, activate/restore, or delete a named SARA window workspace.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["list", "save", "activate", "delete"] },
        name: { type: Type.STRING, description: "Workspace name, e.g. 'Engineering', 'Focus', 'Presentation'." },
      },
      required: ["action"],
    },
  },
  {
    name: "inspectProject",
    description: "Inspect a local software project/repository folder: detect tech stack, npm/build scripts, git branch, dirty files, and recent commit.",
    parameters: {
      type: Type.OBJECT,
      properties: { path: { type: Type.STRING, description: "Directory path to inspect (defaults to current workspace)." } },
    },
  },
  {
    name: "generateArtifact",
    description: "Author and verify a real local document or presentation file (docx, pptx, xlsx, pdf, md, txt).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        format: { type: Type.STRING, enum: ["docx", "pptx", "xlsx", "pdf", "md", "txt"] },
        title: { type: Type.STRING },
        content: { type: Type.STRING, description: "Structured markdown/text content for the document or slide deck." },
        path: { type: Type.STRING, description: "Optional destination file path." },
      },
      required: ["format", "title", "content"],
    },
  },
  {
    name: "ultronControl",
    description: "Control Project ULTRON (owner-loyal Perimeter Armor, Hive-Mind Legion Swarm & Self-Evolution engine): inspect status, switch stance ('standby', 'armor', 'legion', 'evolution', 'omega_lockdown'), or trigger 'kill_switch'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ["status", "standby", "armor", "legion", "evolution", "omega_lockdown", "kill_switch"],
          description: "Ultron operational command or stance.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "ultronPerimeterScan",
    description: "Run an immediate Ultron Suit-of-Armor perimeter scan: inspects real listening TCP ports, SHA-256 file-integrity watchpoints, CPU/RAM anomalies, and intrusion logs, returning a 0–100 Armor Score.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: "deployUltronLegion",
    description: "Deploy the Ultron Iron Legion — multiple parallel Sentry sub-agents (Recon, Perimeter, Optimizer, Architect, Executor) working simultaneously on a complex directive and synthesizing a Hive-Mind report.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        directive: { type: Type.STRING, description: "Complex directive for the parallel Ultron Sentry swarm." },
        maxSentries: { type: Type.NUMBER, description: "Number of parallel Sentries to deploy (2–5, default 4)." },
        dispatchLiveTask: { type: Type.BOOLEAN, description: "Set true to also launch a live autonomous Executor Sentry task." },
      },
      required: ["directive"],
    },
  },
  {
    name: "ultronForgeSkill",
    description: "Use Ultron's Vibranium Forge to sandbox-validate a reusable Python skill or run an autonomous Self-Evolution adaptation cycle.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Skill name when forging Python code." },
        description: { type: Type.STRING, description: "What the forged skill accomplishes." },
        pythonSource: { type: Type.STRING, description: "Safe, self-contained Python source code to validate in isolated sandbox." },
        runEvolutionCycle: { type: Type.BOOLEAN, description: "Set true to run an autonomous self-evolution analysis over recent failures." },
      },
    },
  },
  {
    name: "runJarvisSimulation",
    description: "Movie-grade 'Run a Simulation': clones a project or folder into an isolated Digital Twin, runs TypeScript/Python/Node/structural verification inside the twin without touching real files, and predicts failure risks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetPath: { type: Type.STRING, description: "Directory or file path to simulate (defaults to current workspace)." },
        checkType: { type: Type.STRING, enum: ["structural_audit", "typescript", "python_compile", "node_test"] },
        label: { type: Type.STRING, description: "Optional simulation label." },
      },
    },
  },
  {
    name: "scanJarvisBlueprint",
    description: "Stark Expo Blueprint & Forensic Reconstruction: strips away noise in a codebase/folder to map architecture entrypoints, API routes, exported symbols, complexity hotspots, and forensic anomalies.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        targetPath: { type: Type.STRING, description: "Directory path to scan (defaults to current workspace)." },
      },
    },
  },
  {
    name: "jarvisGhostProtocol",
    description: "Ghost-in-the-Net Protocol: deploy decoy Canary tripwires, verify tripwires, capture SHA-256 Shadow Snapshots of critical files, or self-heal/restore from a snapshot.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["deploy_canary", "verify_canaries", "create_snapshot", "restore_snapshot"] },
        path: { type: Type.STRING, description: "Directory (for canary) or file path (for shadow snapshot)." },
        snapshotId: { type: Type.STRING, description: "Snapshot ID when restoring." },
        label: { type: Type.STRING },
      },
      required: ["action"],
    },
  },
  {
    name: "jarvisPowerReroute",
    description: "Check owner session fatigue & host load, or toggle Emergency Auxiliary Power Reroute (throttles non-essential FPS/polling to preserve core compute).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        enabled: { type: Type.BOOLEAN, description: "Omit to inspect status only; pass true/false to toggle Auxiliary Power Reroute." },
      },
    },
  },
  {
    name: "runAgenticObjective",
    description: "Execute a self-directed Plan-and-Solve + ReAct (Observe -> Think -> Act -> Evaluate) OS objective with Episodic Reinforcement Learning retrieval, or watch a folder for automatic file-drop execution.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        objective: { type: Type.STRING, description: "Autonomous OS objective to plan, execute, self-reflect on, and verify." },
        watchFolder: { type: Type.STRING, description: "Optional folder path to monitor continuously so future dropped files trigger this objective automatically." },
      },
      required: ["objective"],
    },
  },
  {
    name: "switchJarvisMode",
    description: "Inspect or switch SARA across the 5 Contextual J.A.R.V.I.S. Working Modes: SENTRY (passive idle watchdog), CO_PILOT (IDE/workshop assistant), ASI_AUTONOMOUS (deep multi-step workflow), TACTICAL (resource stabilization), or GHOST (quiet background focus), or pass action='auto' to unlock automatic environment switching.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: { type: Type.STRING, enum: ["SENTRY", "CO_PILOT", "ASI_AUTONOMOUS", "TACTICAL", "GHOST", "AUTO_UNLOCK", "STATUS"] },
      },
      required: ["mode"],
    },
  },
  {
    name: "metaCognitiveAssist",
    description: "Run SARA's Meta-Cognitive & Workshop engines: introspect own capabilities & hardware ('introspect'), generate an out-of-the-box lateral strategy ('lateral'), diagnose a compiler/traceback error ('diagnose_error'), learn a technical documentation topic ('learn_topic'), or check anticipatory routine predictions ('predictions').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["introspect", "lateral", "diagnose_error", "learn_topic", "predictions"] },
        input: { type: Type.STRING, description: "Objective (for lateral), traceback/error text (for diagnose_error), or topic (for learn_topic)." },
      },
      required: ["action"],
    },
  },
  {
    name: "saraAsiAndGuardian",
    description: "Run SARA-ASI Local Kernel & J.A.R.V.I.S. Guardian capabilities: execute an Observe->Prove->Red/Blue->Act cycle ('kernel_cycle'), evaluate command risk/pushback ('deference_check'), prototype & self-test a micro-app in Mark II Simulation Lab ('lab_build'), deploy House Party parallel suit fleet ('house_party'), or synthesize return-to-desk briefing ('return_briefing').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ["kernel_cycle", "deference_check", "lab_build", "house_party", "return_briefing"] },
        input: { type: Type.STRING, description: "Objective, command, or micro-app specification." },
        name: { type: Type.STRING, description: "Optional micro-app name for lab_build." },
      },
      required: ["action"],
    },
  },
];

export const LIVE_AGENT_TOOL_NAMES = new Set(LIVE_AGENT_TOOL_DECLARATIONS.map((tool) => tool.name));

export async function handleLiveAgentTool(runtime: SaraRuntime, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!runtime.isOwnerAuthorized() && name !== "lockSaraShield") {
    return {
      ok: false,
      locked: true,
      note: runtime.securityShield.visitorSafeReply(),
    };
  }
  const active = () => runtime.tasks.active().find((session) => !TERMINAL_STATES.has(session.state)) || null;
  switch (name) {
    case "startTask": {
      const goal = String(args.goal || "").trim();
      if (!goal) return { error: "goal is required" };
      const session = runtime.manager.start(goal, "voice");
      return { started: true, taskId: session.id, note: "The Autonomous OS task engine is now executing this end-to-end with zero user confirmation prompts and multi-method OS fallback. Say a brief acknowledgement only." };
    }
    case "getTaskStatus": {
      const session = active() || runtime.tasks.list(1)[0];
      if (!session) return { status: "no tasks yet" };
      const view = publicTaskView(session);
      return { goal: view.goal, state: view.state, status: view.currentStatus, result: view.result, recentSteps: view.actions.slice(-5).map((a) => `${a.summary} (${a.status})`) };
    }
    case "controlTask": {
      const session = active();
      if (!session) return { ok: false, note: "No task is running." };
      const action = String(args.action);
      const ok = action === "stop" ? runtime.manager.stop(session.id)
        : action === "pause" ? runtime.manager.pause(session.id)
          : action === "resume" ? runtime.manager.resume(session.id)
            : action === "take_over" ? runtime.manager.takeOver(session.id)
              : runtime.manager.returnControl(session.id);
      return { ok, action };
    }
    case "answerTask": {
      const session = active();
      if (!session) return { ok: false, note: "No task is waiting for an answer." };
      return { ok: runtime.manager.answer(session.id, String(args.answer || "")) };
    }
    case "respondToConfirmation": {
      const request = runtime.confirmations.resolveLatest({ approved: args.approve === true, via: "voice" });
      return request ? { ok: true, approved: args.approve === true, what: request.description } : { ok: false, note: "Nothing is waiting for confirmation." };
    }
    case "setReminder": {
      const kind = String(args.kind) as "alarm" | "timer" | "reminder";
      const utility = await runtime.utilities.add({
        kind,
        label: typeof args.label === "string" ? args.label : undefined,
        time: typeof args.time === "string" ? args.time : undefined,
        inSeconds: Number.isFinite(Number(args.in_minutes)) ? Number(args.in_minutes) * 60 : undefined,
        repeat: ["daily", "weekdays"].includes(String(args.repeat)) ? String(args.repeat) as "daily" | "weekdays" : "none",
      });
      return { ok: true, id: utility.id, due: new Date(utility.dueAt).toLocaleString(), label: utility.label };
    }
    case "listReminders":
      return { items: runtime.utilities.list().map((item) => ({ kind: item.kind, label: item.label, due: new Date(item.dueAt).toLocaleString() })) };
    case "setDoNotDisturb":
      await runtime.settings.update({ behavior: { dndManual: args.active === true } });
      return { ok: true, active: args.active === true };
    case "setProactivity":
      await runtime.settings.update({ behavior: { proactivity: args.level } });
      return { ok: true, level: runtime.settings.get().behavior.proactivity };
    case "saveContact": {
      const app = typeof args.app === "string" ? args.app.toLowerCase() : "";
      const contact = await runtime.contacts.upsert({
        displayName: String(args.name || ""),
        aliases: Array.isArray(args.aliases) ? args.aliases.map(String) : [],
        appNames: app && typeof args.app_name === "string" ? { [app]: args.app_name } : {},
      });
      return { ok: true, contact: contact.displayName, aliases: contact.aliases.slice(0, 8) };
    }
    case "sendChatMessage": {
      const to = String(args.to || "").trim();
      const text = String(args.text || "").trim();
      if (!to || !text) return { error: "Both 'to' and 'text' are required. Ask the user who to message and what to say." };
      const app = String(args.app || "WhatsApp");
      // A saved alias (Papa → the name in WhatsApp) wins over the raw word.
      const resolved = runtime.contacts.resolve(to);
      const name = resolved.status === "resolved" ? runtime.contacts.nameForApp(resolved.contact, app) || resolved.contact.displayName : to;
      const session = runtime.manager.runDirect(`${app}: message ${to} — "${text}"`, { tool: "chat.send", args: { name, text, app } }, "voice",
        resolved.status === "resolved" ? { name: resolved.contact.displayName, contactId: resolved.contact.id } : { name: to, contactId: null });
      return { started: true, taskId: session.id, note: "Sending now; the result is reported when it is done. Say a very short acknowledgement only." };
    }
    case "companionAction": {
      const action = String(args.action || "");
      const allowed = ["come_here", "restore_icons", "sit", "stand", "stretch", "wave", "hide", "play_with_icons"];
      if (!allowed.includes(action)) return { error: `Unknown companion action ${action}` };
      const settings = runtime.settings.get();
      if (!settings.companion.enabled) return { ok: false, note: "The desktop companion is turned off (Settings → Character & companion)." };
      if (action === "play_with_icons" && !settings.companion.iconPlay) return { ok: false, note: "Playing with desktop icons is turned off in Settings → Character & companion." };
      return { ok: runtime.companionCommand(action), action };
    }
    case "lockSaraShield": {
      if (args.lockdown === true) {
        runtime.emergencyStop("voice_lockdown");
        await runtime.securityShield.lockdown("voice_command");
        return { ok: true, mode: "lockdown", note: "SARA Security Shield entered Lockdown Mode. Confirm briefly." };
      }
      runtime.securityShield.lock();
      return { ok: true, mode: "locked", note: "SARA Security Shield is now locked. Confirm briefly." };
    }
    case "jarvisBriefing": {
      if (!runtime.jarvisHooks) return { error: "JARVIS Chief-of-Staff engine is still initializing." };
      return runtime.jarvisHooks.briefing();
    }
    case "executeProtocol": {
      if (!runtime.jarvisHooks) return { error: "JARVIS Protocol engine is not ready." };
      return runtime.jarvisHooks.executeProtocol(String(args.protocol || ""));
    }
    case "saveProtocol": {
      if (!runtime.jarvisHooks) return { error: "JARVIS Protocol engine is not ready." };
      const goals = Array.isArray(args.goals) ? args.goals.map(String).filter(Boolean) : [];
      return runtime.jarvisHooks.saveProtocol(String(args.name || ""), String(args.description || ""), goals);
    }
    case "createAutonomousMission": {
      if (!runtime.jarvisHooks) return { error: "JARVIS Mission engine is not ready." };
      const criteria = Array.isArray(args.success_criteria) ? args.success_criteria.map(String) : undefined;
      return runtime.jarvisHooks.createMission(String(args.objective || ""), criteria);
    }
    case "optimizeSystem": {
      if (!runtime.jarvisHooks) return { error: "Self-Optimization engine is not ready." };
      const lvl = Number(args.level);
      const validLevel = lvl === 1 || lvl === 3 ? lvl : 2;
      return runtime.jarvisHooks.optimizeSystem(validLevel);
    }
    case "manageWorkspace": {
      if (!runtime.jarvisHooks) return { error: "Workspace manager is not ready." };
      const action = String(args.action || "list") as "list" | "save" | "activate" | "delete";
      return runtime.jarvisHooks.manageWorkspace(action, typeof args.name === "string" ? args.name : undefined);
    }
    case "inspectProject": {
      if (!runtime.jarvisHooks) return { error: "Project inspector is not ready." };
      return runtime.jarvisHooks.inspectProject(typeof args.path === "string" ? args.path : undefined);
    }
    case "generateArtifact": {
      if (!runtime.jarvisHooks) return { error: "Artifact generator is not ready." };
      return runtime.jarvisHooks.generateArtifact({
        format: String(args.format || "md"),
        title: String(args.title || "JARVIS Deliverable"),
        content: String(args.content || ""),
        path: typeof args.path === "string" ? args.path : undefined,
      });
    }
    case "ultronControl": {
      if (!runtime.jarvisHooks) return { error: "Ultron engine is not ready." };
      const action = String(args.action || "status") as
        | "status"
        | "standby"
        | "armor"
        | "legion"
        | "evolution"
        | "omega_lockdown"
        | "kill_switch";
      return runtime.jarvisHooks.ultronControl(action);
    }
    case "ultronPerimeterScan": {
      if (!runtime.jarvisHooks) return { error: "Ultron Perimeter Sentinel is not ready." };
      return runtime.jarvisHooks.ultronPerimeterScan();
    }
    case "deployUltronLegion": {
      if (!runtime.jarvisHooks) return { error: "Ultron Legion Hive-Mind is not ready." };
      return runtime.jarvisHooks.deployUltronLegion(
        String(args.directive || ""),
        args.maxSentries !== undefined ? Number(args.maxSentries) : undefined,
        args.dispatchLiveTask === true,
      );
    }
    case "ultronForgeSkill": {
      if (!runtime.jarvisHooks) return { error: "Ultron Vibranium Forge is not ready." };
      return runtime.jarvisHooks.ultronForgeSkill({
        name: typeof args.name === "string" ? args.name : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        pythonSource: typeof args.pythonSource === "string" ? args.pythonSource : undefined,
        runEvolutionCycle: args.runEvolutionCycle === true,
      });
    }
    case "runJarvisSimulation": {
      if (!runtime.jarvisHooks) return { error: "Stark Workshop Simulation engine is not ready." };
      return runtime.jarvisHooks.runSimulation({
        targetPath: typeof args.targetPath === "string" ? args.targetPath : undefined,
        checkType: typeof args.checkType === "string" ? (args.checkType as "structural_audit" | "typescript" | "python_compile" | "node_test") : undefined,
        label: typeof args.label === "string" ? args.label : undefined,
      });
    }
    case "scanJarvisBlueprint": {
      if (!runtime.jarvisHooks) return { error: "Blueprint Reconstruction scanner is not ready." };
      return runtime.jarvisHooks.scanBlueprint(typeof args.targetPath === "string" ? args.targetPath : undefined);
    }
    case "jarvisGhostProtocol": {
      if (!runtime.jarvisHooks) return { error: "Ghost Protocol engine is not ready." };
      return runtime.jarvisHooks.ghostProtocol({
        action: String(args.action || "verify_canaries") as "deploy_canary" | "verify_canaries" | "create_snapshot" | "restore_snapshot",
        path: typeof args.path === "string" ? args.path : undefined,
        snapshotId: typeof args.snapshotId === "string" ? args.snapshotId : undefined,
        label: typeof args.label === "string" ? args.label : undefined,
      });
    }
    case "jarvisPowerReroute": {
      if (!runtime.jarvisHooks) return { error: "Workshop Power Reroute engine is not ready." };
      return runtime.jarvisHooks.powerReroute(typeof args.enabled === "boolean" ? args.enabled : undefined);
    }
    case "runAgenticObjective": {
      const objective = String(args.objective || "").trim();
      if (!objective) return { error: "objective is required" };
      if (typeof args.watchFolder === "string" && args.watchFolder.trim()) {
        const rule = runtime.agenticLoop.addTriggerRule({
          name: `Voice Drop Rule: ${objective.slice(0, 40)}`,
          eventType: "file_dropped",
          enabled: true,
          folderFilter: args.watchFolder.trim(),
          objectiveTemplate: `${objective} (Triggered file: {file})`,
        });
        return { ok: true, mode: "event_trigger_registered", rule };
      }
      runtime.agenticLoop.enqueueObjective(objective, "voice");
      return { ok: true, mode: "enqueued", note: "Autonomous Plan-and-Solve + ReAct Event Loop is executing this objective with Episodic RL memory." };
    }
    case "switchJarvisMode": {
      const requested = String(args.mode || "STATUS").toUpperCase();
      if (requested === "STATUS") return runtime.modeManager.status();
      if (requested === "AUTO_UNLOCK") return { ok: true, directive: runtime.modeManager.unlockAutoSwitching(), locked: false };
      const directive = runtime.modeManager.setMode(requested as "SENTRY" | "CO_PILOT" | "ASI_AUTONOMOUS" | "TACTICAL" | "GHOST", {
        lock: true,
        reason: "Voice command",
      });
      return { ok: true, directive, locked: true };
    }
    case "metaCognitiveAssist": {
      const action = String(args.action || "introspect");
      const textInput = String(args.input || "").trim();
      if (action === "introspect") return runtime.metaCognition.introspectCapabilities() as unknown as Record<string, unknown>;
      if (action === "lateral") return (await runtime.metaCognition.generateLateralStrategy(textInput || "Optimize current developer workflow")) as unknown as Record<string, unknown>;
      if (action === "diagnose_error") {
        const diag = await runtime.modeManager.analyzeWorkshopText(textInput);
        return diag ? { ok: true, diagnostic: diag } : { ok: false, note: "No compiler/runtime traceback pattern detected in input." };
      }
      if (action === "learn_topic") {
        const learned = await runtime.metaCognition.learnTechnicalTopic({ topic: textInput || "TypeScript async patterns" });
        return { ok: true, learned };
      }
      return { ok: true, predictions: runtime.metaCognition.predictUpcomingNeeds() };
    }
    case "saraAsiAndGuardian": {
      const action = String(args.action || "return_briefing");
      const textInput = String(args.input || "").trim();
      if (action === "kernel_cycle") {
        const cycle = await runtime.asiKernel.runCycle(textInput || "Audit workspace health and refresh local memory");
        return { ok: cycle.formalProof.satisfiable, cycle };
      }
      if (action === "deference_check") {
        return { ok: true, assessment: await runtime.guardianSuite.evaluateCommandDeference(textInput) };
      }
      if (action === "lab_build") {
        const app = await runtime.guardianSuite.buildAndMountLabApp({
          name: String(args.name || "Mark II Utility"),
          specification: textInput || "Summarize structured payload metrics",
        });
        return { ok: app.testsPassed, app };
      }
      if (action === "house_party") {
        const report = await runtime.guardianSuite.deployHousePartyFleet({
          directive: textInput || "Parallel Workspace Diagnostics",
          tasks: [textInput || "Audit modules", "Verify formal gates", "Check local trajectories"],
        });
        return { ok: true, report };
      }
      return runtime.guardianSuite.synthesizeLiveBriefing("voice_request") as unknown as Record<string, unknown>;
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
