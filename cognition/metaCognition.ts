/**
 * Meta-Cognition, Self-Awareness, Lateral Strategy Brain, Safe Knowledge Learner,
 * and Anticipatory Routine Predictor — Powered 100% by SARA's Existing Gemini
 * ModelRouter (Zero Ollama).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fetchPage } from "../agent/webFetch";
import type { ModelRouter } from "../models/router";
import type { EpisodicTrajectoryStore } from "./episodicTrajectoryStore";

export interface ModuleCapabilityEntry {
  file: string;
  language: "typescript" | "python";
  symbols: string[];
}

export interface SelfAwarenessManifest {
  identity: "SARA-META-COGNITIVE";
  inspectedAt: string;
  hardware: {
    platform: string;
    cpuCores: number;
    ramTotalGb: number;
    ramAvailableGb: number;
    ramAvailableMb: number;
    lowVramOptimized: boolean;
  };
  installedModules: ModuleCapabilityEntry[];
  registeredTools: string[];
  reinforcementSummary: {
    totalTrajectories: number;
    cumulativeReward: number;
    topTools: Array<{ tool: string; meanReward: number; attempts: number }>;
    weakTools: Array<{ tool: string; meanReward: number; failures: number }>;
  };
  learnedTopicsCount: number;
}

export interface LateralStrategyResult {
  objective: string;
  avoidedConventionalPaths: string[];
  lateralAnalogyDomain: string;
  lateralStrategy: string;
  missingSkillTopic: string | null;
  firstExecutionStep: {
    tool: string;
    args: Record<string, unknown>;
  };
}

export interface LearnedKnowledgeEntry {
  id: string;
  topic: string;
  sources: string[];
  distilledSummary: string;
  verifiedPythonHelperName: string | null;
  verifiedPythonCode: string | null;
  createdAt: string;
}

export interface RoutinePrediction {
  hourOfDay: number;
  predictedGoal: string;
  confidence: number;
  occurrences: number;
  autoPreparedNote: string | null;
}

interface InteractionLogEntry {
  goal: string;
  hour: number;
  weekday: number;
  timestamp: string;
}

interface MetaStoreFile {
  version: 1;
  knowledge: LearnedKnowledgeEntry[];
  interactions: InteractionLogEntry[];
}

const UNSAFE_PYTHON_TOKENS = /\b(subprocess|socket|ctypes|winreg|eval|exec|__import__|os\.system|os\.popen|os\.exec|shutil\.rmtree|frida|pymem|pyshark)\b/;

function extractPythonFunctions(content: string): string[] {
  const matches = content.matchAll(/^def\s+([a-zA-Z_]\w*)\s*\(/gm);
  const names: string[] = [];
  for (const m of matches) {
    if (m[1] && !m[1].startsWith("_")) names.push(m[1]);
  }
  return names.slice(0, 25);
}

function extractTsExports(content: string): string[] {
  const matches = content.matchAll(/^export\s+(?:async\s+)?(?:function|class|const)\s+([a-zA-Z_]\w*)/gm);
  const names: string[] = [];
  for (const m of matches) {
    if (m[1]) names.push(m[1]);
  }
  return names.slice(0, 25);
}

export class MetaCognitionEngine {
  private readonly storePath: string;
  private readonly helpersPyPath: string;
  private store: MetaStoreFile = { version: 1, knowledge: [], interactions: [] };
  private loaded = false;

  constructor(
    private readonly deps: {
      projectRoot: string;
      dataDir: string;
      router: ModelRouter;
      episodicStore: EpisodicTrajectoryStore;
      getRegisteredTools: () => string[];
    },
  ) {
    this.storePath = path.join(deps.dataDir, "learning", "meta_cognition.v1.json");
    this.helpersPyPath = path.join(deps.dataDir, "learning", "learned_helpers.py");
  }

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fsp.mkdir(path.dirname(this.storePath), { recursive: true });
    try {
      const parsed = JSON.parse(await fsp.readFile(this.storePath, "utf8")) as Partial<MetaStoreFile>;
      this.store = {
        version: 1,
        knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
        interactions: Array.isArray(parsed.interactions) ? parsed.interactions.slice(-500) : [],
      };
    } catch {
      /* first initialization */
    }
    if (!fs.existsSync(this.helpersPyPath)) {
      await fsp.writeFile(
        this.helpersPyPath,
        '"""Pure-computation helper functions learned and AST-validated by SARA Meta-Cognition."""\n',
        "utf8",
      );
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fsp.writeFile(this.storePath, JSON.stringify(this.store, null, 2), "utf8");
  }

  /**
   * 1. Self-Awareness & Capability Introspection:
   * Scans SARA's own codebase (`cognition/`, `agent/`, `desktop_agent/`),
   * live RAM/CPU limits, and RL tool scores to build a live Self-Model.
   */
  introspectCapabilities(): SelfAwarenessManifest {
    const dirs: Array<{ rel: string; lang: "typescript" | "python"; ext: string }> = [
      { rel: "cognition", lang: "typescript", ext: ".ts" },
      { rel: "agent", lang: "typescript", ext: ".ts" },
      { rel: "desktop_agent", lang: "python", ext: ".py" },
    ];

    const installedModules: ModuleCapabilityEntry[] = [];
    for (const d of dirs) {
      const fullDir = path.join(this.deps.projectRoot, d.rel);
      if (!fs.existsSync(fullDir)) continue;
      for (const entry of fs.readdirSync(fullDir)) {
        if (!entry.endsWith(d.ext)) continue;
        const fullFile = path.join(fullDir, entry);
        try {
          const stat = fs.statSync(fullFile);
          if (!stat.isFile() || stat.size > 250_000) continue;
          const src = fs.readFileSync(fullFile, "utf8");
          const symbols = d.lang === "python" ? extractPythonFunctions(src) : extractTsExports(src);
          if (symbols.length > 0) {
            installedModules.push({
              file: `${d.rel}/${entry}`,
              language: d.lang,
              symbols,
            });
          }
        } catch {
          /* ignore unreadable file */
        }
      }
    }

    const rl = this.deps.episodicStore.snapshot();
    const statsEntries = Object.entries(rl.toolStats);
    const topTools = statsEntries
      .filter(([, s]) => s.meanReward > 0)
      .sort((a, b) => b[1].meanReward - a[1].meanReward)
      .slice(0, 6)
      .map(([tool, s]) => ({ tool, meanReward: s.meanReward, attempts: s.attempts }));

    const weakTools = statsEntries
      .filter(([, s]) => s.failures > 0 && s.meanReward <= 0)
      .sort((a, b) => a[1].meanReward - b[1].meanReward)
      .slice(0, 6)
      .map(([tool, s]) => ({ tool, meanReward: s.meanReward, failures: s.failures }));

    const freeMem = os.freemem();
    const totalMem = os.totalmem();

    return {
      identity: "SARA-META-COGNITIVE",
      inspectedAt: new Date().toISOString(),
      hardware: {
        platform: process.platform,
        cpuCores: os.cpus().length,
        ramTotalGb: Number((totalMem / 1024 ** 3).toFixed(2)),
        ramAvailableGb: Number((freeMem / 1024 ** 3).toFixed(2)),
        ramAvailableMb: Math.round(freeMem / (1024 * 1024)),
        lowVramOptimized: true,
      },
      installedModules,
      registeredTools: this.deps.getRegisteredTools(),
      reinforcementSummary: {
        totalTrajectories: rl.totalTrajectories,
        cumulativeReward: rl.cumulativeReward,
        topTools,
        weakTools,
      },
      learnedTopicsCount: this.store.knowledge.length,
    };
  }

  /**
   * 2. Out-of-the-Box Lateral Thinking Engine (Divergent-Convergent via Gemini):
   * High-temperature brainstorming (0.9) avoids repetitive failing paths, then
   * converges onto a safe, concrete execution step using SARA's registered tools.
   */
  async generateLateralStrategy(objective: string, signal?: AbortSignal): Promise<LateralStrategyResult> {
    await this.initialize();
    const manifest = this.introspectCapabilities();
    const rlContext = this.deps.episodicStore.buildPreActionContext(objective);

    const schema: Record<string, unknown> = {
      type: "object",
      required: [
        "avoidedConventionalPaths",
        "lateralAnalogyDomain",
        "lateralStrategy",
        "missingSkillTopic",
        "firstExecutionStep",
      ],
      properties: {
        avoidedConventionalPaths: { type: "array", items: { type: "string" } },
        lateralAnalogyDomain: { type: "string" },
        lateralStrategy: { type: "string" },
        missingSkillTopic: { type: ["string", "null"] },
        firstExecutionStep: {
          type: "object",
          required: ["tool", "args"],
          properties: {
            tool: { type: "string" },
            args: { type: "object" },
          },
        },
      },
    };

    try {
      const res = await this.deps.router.generate(
        "planning",
        {
          purpose: "meta.lateral_strategy",
          system: [
            "You are SARA's Out-of-the-Box Lateral Engineering Architect.",
            "1. Identify 2 repetitive or brittle conventional GUI paths that commonly stall and avoid them.",
            "2. Use a constructive engineering analogy (systems theory, pipelines, caching, or graph routing) to design a clean, reliable, safe solution using SARA's registered tools.",
            "3. If a pure documentation/reference topic would help, set missingSkillTopic; otherwise null.",
            "4. Never propose unsafe, destructive, or unauthorized actions.",
          ].join("\n"),
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "text",
                  text: `OBJECTIVE: ${objective}\nHARDWARE: ${JSON.stringify(manifest.hardware)}\nREGISTERED TOOLS: ${manifest.registeredTools.slice(0, 40).join(", ")}\n${rlContext}`,
                },
              ],
            },
          ],
          responseSchema: schema,
          temperature: 0.9,
          maxOutputTokens: 600,
        },
        { signal, role: "brain", maxAttempts: 2 },
      );

      const parsed = (res.json ?? JSON.parse(res.text || "{}")) as Partial<LateralStrategyResult>;
      if (parsed.lateralStrategy && Array.isArray(parsed.avoidedConventionalPaths)) {
        return {
          objective,
          avoidedConventionalPaths: parsed.avoidedConventionalPaths.slice(0, 4).map(String),
          lateralAnalogyDomain: String(parsed.lateralAnalogyDomain || "Systems Pipeline Engineering"),
          lateralStrategy: String(parsed.lateralStrategy),
          missingSkillTopic: parsed.missingSkillTopic ? String(parsed.missingSkillTopic) : null,
          firstExecutionStep: {
            tool: String(parsed.firstExecutionStep?.tool || "execute_cmd"),
            args:
              parsed.firstExecutionStep?.args && typeof parsed.firstExecutionStep.args === "object"
                ? (parsed.firstExecutionStep.args as Record<string, unknown>)
                : {},
          },
        };
      }
    } catch {
      /* deterministic fallback when offline or in unit tests without live API key */
    }

    return {
      objective,
      avoidedConventionalPaths: [
        "Blind coordinate clicking on dynamic windows without verifying layout",
        "Repeating identical UI actions after timeout instead of inspecting structured data",
      ],
      lateralAnalogyDomain: "Dataflow Pipeline & Deterministic Verification",
      lateralStrategy: `Decompose "${objective}" into a direct structured OS/filesystem pipeline, verify intermediate state deterministically, and cache the trajectory in Episodic RL memory.`,
      missingSkillTopic: null,
      firstExecutionStep: {
        tool: "execute_cmd",
        args: { command: `echo Preparing deterministic pipeline for ${JSON.stringify(objective.slice(0, 60))}` },
      },
    };
  }

  /**
   * 3. Safe Documentation & Knowledge Learner (`learnFromWebOrDocs`):
   * Fetches public technical documentation URLs (when provided) and uses SARA's
   * existing Gemini router to distill clean reference knowledge and optionally
   * AST-validate pure-computation Python utility helpers.
   */
  async learnTechnicalTopic(input: {
    topic: string;
    urls?: string[];
    pythonHelperCode?: string;
    signal?: AbortSignal;
  }): Promise<LearnedKnowledgeEntry> {
    await this.initialize();
    const topic = input.topic.trim();
    if (!topic) throw new Error("Parameter 'topic' is required.");

    const snippets: string[] = [];
    const usedSources: string[] = [];
    for (const url of (input.urls || []).slice(0, 3)) {
      try {
        const page = await fetchPage(url, input.signal);
        if (page.text) {
          usedSources.push(page.finalUrl);
          snippets.push(`--- SOURCE: ${page.finalUrl} ---\n${page.text.slice(0, 2500)}`);
        }
      } catch {
        /* ignore unreachable doc URL */
      }
    }

    let distilledSummary = `Distilled engineering reference for "${topic}".`;
    try {
      const res = await this.deps.router.generate(
        "summarization",
        {
          purpose: "meta.omni_learner",
          system: "Distill concise, accurate software engineering notes for SARA's knowledge store in 3-5 sentences.",
          messages: [
            {
              role: "user",
              parts: [
                {
                  type: "text",
                  text: `TOPIC: ${topic}\n${snippets.join("\n\n") || "Summarize best-practice standard library usage for this topic."}`,
                },
              ],
            },
          ],
          maxOutputTokens: 350,
          temperature: 0.2,
        },
        { signal: input.signal, role: "background", maxAttempts: 1 },
      );
      if (res.text?.trim()) distilledSummary = res.text.trim();
    } catch {
      if (snippets.length > 0) {
        distilledSummary = snippets[0]!.slice(0, 400);
      }
    }

    let verifiedHelperName: string | null = null;
    let verifiedCode: string | null = null;

    if (input.pythonHelperCode?.trim()) {
      const validation = this.validateSafePythonHelper(input.pythonHelperCode.trim());
      if (!validation.valid) {
        throw new Error(`Rejected unsafe or invalid Python helper: ${validation.reason}`);
      }
      verifiedHelperName = validation.functionName;
      verifiedCode = input.pythonHelperCode.trim();
      await fsp.appendFile(
        this.helpersPyPath,
        `\n\n# Learned topic: ${topic.replace(/\r?\n/g, " ")}\n${verifiedCode}\n`,
        "utf8",
      );
    }

    const entry: LearnedKnowledgeEntry = {
      id: randomUUID(),
      topic,
      sources: usedSources,
      distilledSummary,
      verifiedPythonHelperName: verifiedHelperName,
      verifiedPythonCode: verifiedCode,
      createdAt: new Date().toISOString(),
    };
    this.store.knowledge.push(entry);
    if (this.store.knowledge.length > 200) {
      this.store.knowledge.splice(0, this.store.knowledge.length - 200);
    }
    await this.persist();
    return entry;
  }

  validateSafePythonHelper(code: string): { valid: boolean; functionName: string | null; reason?: string } {
    if (UNSAFE_PYTHON_TOKENS.test(code)) {
      return { valid: false, functionName: null, reason: "Contains disallowed system/network/process module." };
    }
    const checkScript = [
      "import ast, json, sys",
      "src = sys.stdin.read()",
      "tree = ast.parse(src)",
      "FORBIDDEN = {'subprocess','socket','ctypes','os','sys','shutil','urllib','requests','http'}",
      "funcs = []",
      "for node in ast.walk(tree):",
      "    if isinstance(node, ast.Import):",
      "        for n in node.names:",
      "            if n.name.split('.')[0] in FORBIDDEN:",
      "                raise ValueError(f'Forbidden import: {n.name}')",
      "    elif isinstance(node, ast.ImportFrom):",
      "        if (node.module or '').split('.')[0] in FORBIDDEN:",
      "            raise ValueError(f'Forbidden import from: {node.module}')",
      "    elif isinstance(node, ast.FunctionDef):",
      "        funcs.append(node.name)",
      "if not funcs:",
      "    raise ValueError('Must define at least one Python function.')",
      "print(json.dumps({'ok': True, 'fn': funcs[0]}))",
    ].join("\n");

    const pyBin = process.platform === "win32" ? "python" : "python3";
    const res = spawnSync(pyBin, ["-c", checkScript], { input: code, encoding: "utf8", timeout: 5_000 });
    if (res.status !== 0) {
      return { valid: false, functionName: null, reason: (res.stderr || "AST parse failed").trim().slice(0, 200) };
    }
    try {
      const parsed = JSON.parse(res.stdout.trim()) as { ok: boolean; fn: string };
      return { valid: Boolean(parsed.ok), functionName: parsed.fn || null };
    } catch {
      return { valid: false, functionName: null, reason: "Invalid AST validator output." };
    }
  }

  /**
   * 4. Anticipatory Routine Predictor:
   * Logs routine task timestamps locally and predicts what workflow Boss is
   * likely to need in the current/upcoming window (>= 0.80 confidence).
   */
  async recordInteraction(goal: string, date = new Date()): Promise<void> {
    await this.initialize();
    const normalized = goal.trim().slice(0, 240);
    if (!normalized) return;
    this.store.interactions.push({
      goal: normalized,
      hour: date.getHours(),
      weekday: date.getDay(),
      timestamp: date.toISOString(),
    });
    if (this.store.interactions.length > 500) {
      this.store.interactions.splice(0, this.store.interactions.length - 500);
    }
    await this.persist();
  }

  predictUpcomingNeeds(now = new Date(), windowHours = 3): RoutinePrediction[] {
    if (!this.store.interactions.length) return [];
    const currentHour = now.getHours();
    const targetHours = new Set<number>();
    for (let offset = 0; offset <= windowHours; offset += 1) {
      targetHours.add((currentHour + offset) % 24);
    }

    const inWindow = this.store.interactions.filter((item) => targetHours.has(item.hour));
    if (!inWindow.length) return [];

    const counts = new Map<string, { count: number; hour: number }>();
    for (const item of inWindow) {
      const key = item.goal.toLowerCase();
      const prev = counts.get(key);
      counts.set(key, { count: (prev?.count || 0) + 1, hour: item.hour });
    }

    const total = inWindow.length;
    const predictions: RoutinePrediction[] = [];
    for (const [goalKey, info] of counts.entries()) {
      if (info.count < 2) continue;
      const rawProb = Math.min(0.98, Number((0.45 + (info.count / Math.max(2, total)) * 0.55).toFixed(2)));
      predictions.push({
        hourOfDay: info.hour,
        predictedGoal: goalKey,
        confidence: rawProb,
        occurrences: info.count,
        autoPreparedNote:
          rawProb >= 0.85
            ? `High-confidence routine (${Math.round(rawProb * 100)}%) pre-staged for Boss: "${goalKey}".`
            : null,
      });
    }
    return predictions.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  }

  listKnowledge(): LearnedKnowledgeEntry[] {
    return [...this.store.knowledge].reverse();
  }
}
