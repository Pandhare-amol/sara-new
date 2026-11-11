import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const exec = promisify(execFile);
export interface ImprovementProposal { id: string; worktree: string; baseCommit: string; createdAt: string; status: "created" | "validated" | "failed"; output: string; }

export class CodeImprovementService {
  private proposals = new Map<string, ImprovementProposal>();
  constructor(private readonly projectRoot: string, private readonly dataDir: string) {}

  async create(): Promise<ImprovementProposal> {
    const id = randomUUID();
    const root = path.join(this.dataDir, "code-improvements", id);
    await fs.mkdir(path.dirname(root), { recursive: true });
    const { stdout: baseCommit } = await exec("git", ["rev-parse", "HEAD"], { cwd: this.projectRoot, timeout: 10_000 });
    await exec("git", ["worktree", "add", "--detach", root, baseCommit.trim()], { cwd: this.projectRoot, timeout: 30_000 });
    const proposal: ImprovementProposal = { id, worktree: root, baseCommit: baseCommit.trim(), createdAt: new Date().toISOString(), status: "created", output: "Isolated worktree created. No production files were changed." };
    this.proposals.set(id, proposal); await this.persist(); return proposal;
  }

  async validate(id: string): Promise<ImprovementProposal> {
    const proposal = this.proposals.get(id); if (!proposal) throw new Error("Unknown improvement proposal.");
    try {
      const result = await exec("npm", ["run", "lint"], { cwd: proposal.worktree, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
      proposal.status = "validated"; proposal.output = `${result.stdout}\n${result.stderr}`.slice(-20_000);
    } catch (error: any) { proposal.status = "failed"; proposal.output = `${error?.stdout || ""}\n${error?.stderr || error?.message || error}`.slice(-20_000); }
    await this.persist(); return structuredClone(proposal);
  }

  list(): ImprovementProposal[] { return [...this.proposals.values()].map((proposal) => structuredClone(proposal)); }
  private async persist(): Promise<void> { await fs.mkdir(this.dataDir, { recursive: true }); await fs.writeFile(path.join(this.dataDir, "code-improvements.v1.json"), JSON.stringify({ version: 1, proposals: this.list() }, null, 2), "utf8"); }
}
