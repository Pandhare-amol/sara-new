import { randomUUID } from "node:crypto";

export type GenerativeCapability = "text" | "coding" | "image_analysis" | "document_analysis" | "file_generation";
export type GenerativeFormat = "text" | "markdown" | "code" | "pdf" | "docx" | "xlsx" | "pptx";

export interface GenerativeTaskRequest {
  prompt: string;
  capability?: GenerativeCapability;
  format?: GenerativeFormat;
  language?: string;
  tone?: string;
  modelId?: string;
  outputPath?: string;
  overwrite?: boolean;
}

export interface GenerativeTask {
  id: string;
  request: GenerativeTaskRequest;
  state: "queued" | "accepted" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  result?: { text: string; modelId?: string; format: GenerativeFormat; filePath?: string; verification?: { ok: boolean; extractedCharacters: number; citations: number; contentCoverage: number } };
  error?: string;
}

export function inferGenerativeRequest(request: GenerativeTaskRequest): GenerativeTaskRequest {
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error("A generation prompt is required.");
  if (request.capability && request.format) return { ...request, prompt };
  const lower = prompt.toLowerCase();
  const capability = request.capability || (/(summarize|read|analy[sz]e).*(pdf|doc|image|screenshot|document)/i.test(prompt)
    ? "document_analysis"
    : /(debug|code|typescript|javascript|python|function|class|test)/i.test(prompt) ? "coding" : "text");
  const format = request.format || (/(markdown|\.md\b)/i.test(lower) ? "markdown" : /\b(code|script|\.py\b|\.ts\b|\.js\b)/i.test(lower) ? "code" : "text");
  return { ...request, prompt, capability, format };
}

export function createGenerativeTask(request: GenerativeTaskRequest): GenerativeTask {
  const now = new Date().toISOString();
  return { id: randomUUID(), request: inferGenerativeRequest(request), state: "queued", createdAt: now, updatedAt: now };
}
