import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { KnowledgeStore } from "./knowledgeStore";
import { fetchPage } from "../agent/webFetch";

export type LearningDepth = "beginner" | "intermediate" | "advanced";
export type LearningStatus = "planned" | "researching" | "practicing" | "completed" | "paused" | "failed";
export interface LearningSource {
  url: string;
  title: string;
  retrievedAt: string;
  confidence: number;
  review: "pending" | "saved" | "rejected";
  preview: string;
}
export interface LearningSession {
  id: string;
  topic: string;
  objective: string;
  depth: LearningDepth;
  status: LearningStatus;
  modules: string[];
  sources: LearningSource[];
  experiments: Array<{ id: string; objective: string; method: string; outcome: string; verified: boolean; at: string }>;
  assessment: { status: "not_assessed" | "needs_practice" | "demonstrated"; evidence: string | null; assessedAt: string | null };
  masterySummary?: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}
interface LearningFile {
  version: 1;
  sessions: LearningSession[];
}
interface ResearchDraft {
  sessionId: string;
  url: string;
  title: string;
  content: string;
}

export class LearningEngine {
  private sessions: LearningSession[] = [];
  private loaded = false;
  private write: Promise<void> = Promise.resolve();
  private drafts = new Map<string, ResearchDraft>();

  constructor(private readonly filePath: string, private readonly knowledge: KnowledgeStore) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const data = JSON.parse(await fs.readFile(this.filePath, "utf8")) as LearningFile;
      this.sessions = Array.isArray(data.sessions)
        ? data.sessions.map((session) => ({
            ...session,
            assessment: session.assessment || { status: "not_assessed", evidence: null, assessedAt: null },
            sources: (session.sources || []).map((source) => ({
              ...source,
              review: source.review || "saved",
              preview: source.preview || "",
            })),
          }))
        : [];
    } catch {
      this.sessions = [];
    }
    this.loaded = true;
  }

  list(): LearningSession[] {
    this.assert();
    return this.sessions.map((item) => structuredClone(item));
  }

  async start(input: { topic: string; objective?: string; depth?: LearningDepth }): Promise<LearningSession> {
    this.assert();
    const topic = String(input.topic || "").trim().slice(0, 200);
    if (!topic) throw new Error("topic is required");
    const depth = input.depth === "intermediate" || input.depth === "advanced" ? input.depth : "beginner";
    const now = new Date().toISOString();
    const session: LearningSession = {
      id: randomUUID(),
      topic,
      objective: String(input.objective || `Understand and practice ${topic}`).slice(0, 500),
      depth,
      status: "planned",
      modules: modulePlan(topic, depth),
      sources: [],
      experiments: [],
      assessment: { status: "not_assessed", evidence: null, assessedAt: null },
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.unshift(session);
    await this.persist();
    return structuredClone(session);
  }

  async research(id: string, urls: string[]): Promise<LearningSession> {
    this.assert();
    const session = this.require(id);
    session.status = "researching";
    session.updatedAt = new Date().toISOString();
    for (const raw of urls.slice(0, 8)) {
      let parsed: URL;
      try {
        parsed = new URL(String(raw || "").trim());
      } catch {
        continue;
      }
      if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) continue;
      const url = parsed.toString();
      if (session.sources.some((source) => source.url === url)) continue;
      try {
        const page = await fetchPage(url, AbortSignal.timeout(8_000));
        const content = page.text.slice(0, 12_000);
        if (!content) continue;
        const title = page.title || parsed.hostname;
        const source: LearningSource = {
          url,
          title,
          retrievedAt: new Date().toISOString(),
          confidence: 0.65,
          review: "pending",
          preview: content.slice(0, 900),
        };
        session.sources.push(source);
        this.drafts.set(`${id}:${url}`, { sessionId: id, url, title, content });
      } catch {
        /* an unavailable source does not destroy the learning session */
      }
    }
    session.progress = session.sources.length ? 0.25 : 0;
    session.status = session.sources.length ? "practicing" : "failed";
    session.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(session);
  }

  /**
   * 1-Click / Voice Internet Auto-Learner for SARA & J.A.R.V.I.S.:
   * Discovers real web sources from any topic/prompt (plus any embedded or supplied URLs),
   * uses Gemini Google Search Grounding + live page fetching to synthesize structured knowledge,
   * and saves it directly into SARA & J.A.R.V.I.S.'s shared KnowledgeStore.
   */
  async learnFromInternetPrompt(input: {
    prompt: string;
    depth?: LearningDepth;
    urls?: string[];
    geminiApiKey?: string;
    autoSave?: boolean;
  }): Promise<{ session: LearningSession; savedKnowledgeCount: number; summary: string }> {
    this.assert();
    const cleanPrompt = String(input.prompt || "").trim().slice(0, 300);
    if (!cleanPrompt) throw new Error("Learning prompt or topic is required.");
    const depth: LearningDepth =
      input.depth === "intermediate" || input.depth === "advanced" ? input.depth : "intermediate";
    const autoSave = input.autoSave !== false;

    const session = await this.start({
      topic: cleanPrompt,
      objective: `Master "${cleanPrompt}" from live internet sources & Gemini synthesis`,
      depth,
    });
    const liveSession = this.require(session.id);
    liveSession.status = "researching";

    // 1. Collect explicit URLs from prompt + input.urls + automatic web discovery
    const urlMatches = cleanPrompt.match(/https:\/\/[^\s"'<>]+/gi) || [];
    const candidateUrls = new Set<string>([...urlMatches, ...(input.urls || [])]);

    // Auto-discover authoritative web pages (DuckDuckGo HTML + Wikipedia REST)
    const cleanQuery = cleanPrompt.replace(/https:\/\/[^\s"'<>]+/gi, "").trim() || cleanPrompt;
    try {
      const ddgPage = await fetchPage(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`,
        AbortSignal.timeout(6_000),
      );
      for (const link of ddgPage.links) {
        if (/^https:\/\//i.test(link.href) && !/duckduckgo\.com/i.test(link.href)) {
          candidateUrls.add(link.href);
          if (candidateUrls.size >= 5) break;
        }
      }
    } catch {
      // Continue with Wikipedia / GitHub / Gemini Search Grounding
    }

    if (candidateUrls.size < 3) {
      try {
        const ghRes = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(cleanQuery)}&per_page=2`,
          {
            headers: { Accept: "application/vnd.github+json", "User-Agent": "SARA-LearningEngine" },
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (ghRes.ok) {
          const ghJson = (await ghRes.json()) as { items?: Array<{ html_url?: string }> };
          for (const repo of ghJson.items || []) {
            if (repo.html_url) candidateUrls.add(repo.html_url);
          }
        }
      } catch {
        // Optional discovery channel
      }
    }

    let savedKnowledgeCount = 0;
    const fetchedExcerpts: string[] = [];

    for (const rawUrl of [...candidateUrls].slice(0, 5)) {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        continue;
      }
      if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) continue;
      try {
        const page = await fetchPage(parsed.toString(), AbortSignal.timeout(7_000));
        const content = page.text.slice(0, 10_000);
        if (!content) continue;
        const title = page.title || parsed.hostname;
        liveSession.sources.push({
          url: page.finalUrl,
          title,
          retrievedAt: new Date().toISOString(),
          confidence: 0.78,
          review: autoSave ? "saved" : "pending",
          preview: content.slice(0, 700),
        });
        fetchedExcerpts.push(`[${title} (${page.finalUrl})]:\n${content.slice(0, 2000)}`);
        if (autoSave) {
          await this.knowledge.add({
            topic: cleanQuery.slice(0, 140),
            content: content.slice(0, 6000),
            source: { kind: "web", locator: page.finalUrl },
            confidence: 0.78,
            refreshAfter: new Date(Date.now() + 14 * 86_400_000).toISOString(),
          });
          savedKnowledgeCount += 1;
        }
      } catch {
        // Skip unreachable candidate
      }
    }

    // 2. Gemini Live Web Search Grounding + Mastery Synthesis
    let masterySummary = "";
    const apiKey = (input.geminiApiKey || process.env.GEMINI_API_KEY || "").trim();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const promptText = `Teach SARA & J.A.R.V.I.S. everything practically important about "${cleanQuery}" at ${depth} depth.\nProvide:\n1) Core mental model & architecture\n2) Practical commands / patterns / formulas\n3) Common pitfalls & verification steps.\n\nFetched Web Excerpts:\n${fetchedExcerpts.join("\n\n").slice(0, 6000) || "(Use live Google Search knowledge)"}`;
        let genRes;
        try {
          genRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: promptText,
            config: {
              tools: [{ googleSearch: {} }],
            },
          });
        } catch {
          genRes = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: promptText,
          });
        }
        masterySummary = String(genRes.text || "").trim();

        // Extract grounded web chunks if returned by Gemini Google Search
        const chunks = (genRes as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(chunks)) {
          for (const ch of chunks.slice(0, 5)) {
            const uri = ch?.web?.uri;
            const title = ch?.web?.title;
            if (typeof uri === "string" && !liveSession.sources.some((s) => s.url === uri)) {
              liveSession.sources.push({
                url: uri,
                title: String(title || "Grounded Web Source"),
                retrievedAt: new Date().toISOString(),
                confidence: 0.85,
                review: "saved",
                preview: "Verified via Gemini Google Search Grounding.",
              });
            }
          }
        }
      } catch {
        // Fall back to local excerpt synthesis below
      }
    }

    if (!masterySummary) {
      masterySummary = fetchedExcerpts.length > 0
        ? `Synthesized "${cleanQuery}" from ${fetchedExcerpts.length} internet source(s):\n${fetchedExcerpts[0].slice(0, 900)}`
        : `Structured study & execution blueprint created for "${cleanQuery}" (${depth} depth): ${liveSession.modules.join(" -> ")}.`;
    }

    if (autoSave && masterySummary) {
      await this.knowledge.add({
        topic: cleanQuery.slice(0, 140),
        content: masterySummary.slice(0, 8000),
        source: { kind: "web", locator: `internet-learn:${session.id}` },
        confidence: 0.85,
        refreshAfter: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      });
      savedKnowledgeCount += 1;
    }

    liveSession.masterySummary = masterySummary.slice(0, 4000);
    liveSession.progress = savedKnowledgeCount > 0 ? 0.85 : 0.45;
    liveSession.status = "practicing";
    liveSession.updatedAt = new Date().toISOString();
    await this.persist();

    return {
      session: structuredClone(liveSession),
      savedKnowledgeCount,
      summary: masterySummary.slice(0, 1500),
    };
  }

  async reviewSource(id: string, url: string, approved: boolean): Promise<LearningSession> {
    this.assert();
    const session = this.require(id);
    const source = session.sources.find((item) => item.url === url);
    if (!source) throw new Error("Source not found in this learning session.");
    const key = `${id}:${url}`;
    const draft = this.drafts.get(key);
    if (approved) {
      if (draft) {
        await this.knowledge.add({
          topic: session.topic,
          content: draft.content,
          source: { kind: "web", locator: draft.url },
          confidence: draft.content.length > 500 ? 0.65 : 0.4,
          refreshAfter: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        });
      }
      source.review = "saved";
    } else {
      source.review = "rejected";
    }
    this.drafts.delete(key);
    session.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(session);
  }

  async assess(id: string, input: { demonstrated: boolean; evidence: string }): Promise<LearningSession> {
    this.assert();
    const session = this.require(id);
    const evidence = input.evidence.trim().slice(0, 1000);
    if (!evidence) throw new Error("Assessment evidence is required.");
    const demonstrated = input.demonstrated === true && session.experiments.some((item) => item.verified);
    session.assessment = {
      status: demonstrated ? "demonstrated" : "needs_practice",
      evidence,
      assessedAt: new Date().toISOString(),
    };
    session.progress = demonstrated ? 1 : Math.max(session.progress, 0.5);
    session.status = demonstrated ? "completed" : "practicing";
    session.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(session);
  }

  async addExperiment(
    id: string,
    input: { objective: string; method: string; outcome: string; verified: boolean },
  ): Promise<LearningSession> {
    this.assert();
    const session = this.require(id);
    session.experiments.push({
      id: randomUUID(),
      objective: input.objective.slice(0, 500),
      method: input.method.slice(0, 1000),
      outcome: input.outcome.slice(0, 2000),
      verified: input.verified === true,
      at: new Date().toISOString(),
    });
    session.progress = Math.min(0.9, session.progress + (input.verified ? 0.2 : 0.05));
    session.assessment.status = "not_assessed";
    session.status = "practicing";
    session.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(session);
  }

  private require(id: string): LearningSession {
    const found = this.sessions.find((item) => item.id === id);
    if (!found) throw new Error("Learning session not found");
    return found;
  }

  private assert(): void {
    if (!this.loaded) throw new Error("LearningEngine.initialize() must be called first.");
  }

  private async persist(): Promise<void> {
    const temp = `${this.filePath}.${process.pid}.tmp`;
    this.write = this.write.then(async () => {
      await fs.writeFile(temp, JSON.stringify({ version: 1, sessions: this.sessions }, null, 2), "utf8");
      await fs.rename(temp, this.filePath);
    });
    await this.write;
  }
}

function modulePlan(topic: string, depth: LearningDepth): string[] {
  return [
    `Define ${topic} and prerequisites`,
    `Study core concepts at ${depth} depth`,
    "Practice a safe, measurable exercise",
    "Assess results and record gaps",
  ];
}

function isPrivateHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    value === "localhost" ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value === "::1" ||
    /^127\./.test(value) ||
    /^10\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^169\.254\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value)
  );
}
