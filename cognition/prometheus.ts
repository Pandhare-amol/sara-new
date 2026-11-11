import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface PythonSkillProposal { id: string; name: string; source: string; approved: boolean; status: "draft" | "validated" | "rejected"; validation?: string; }
const FORBIDDEN = /(?:subprocess|os\.system|Popen|socket|ctypes|winreg|shutil\.rmtree|__import__|eval\s*\(|exec\s*\()/i;

/** Approval-gated Python skill lab. Validation runs in a disposable subprocess. */
export async function validatePythonSkill(proposal: PythonSkillProposal): Promise<PythonSkillProposal> {
  if (!proposal.source.trim() || FORBIDDEN.test(proposal.source)) return { ...proposal, status: "rejected", validation: "Rejected by static safety policy." };
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-prometheus-")); const file = path.join(dir, "skill.py");
  try {
    await fs.writeFile(file, proposal.source, "utf8");
    const result = await new Promise<{ ok: boolean; output: string }>((resolve) => { const child = spawn(process.env.SARA_PYTHON || "python", ["-I", "-m", "py_compile", file], { cwd: dir, windowsHide: true }); let output = ""; child.stderr.on("data", (data) => { output += String(data); }); child.stdout.on("data", (data) => { output += String(data); }); const timer = setTimeout(() => { child.kill(); resolve({ ok: false, output: "Validation timed out." }); }, 8_000); child.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, output }); }); child.on("error", (error) => { clearTimeout(timer); resolve({ ok: false, output: error.message }); }); });
    return { ...proposal, status: result.ok ? "validated" : "rejected", validation: result.ok ? "Compiled in isolated validation process." : result.output.slice(0, 500) };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
