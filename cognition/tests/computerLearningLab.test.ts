import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ComputerLearningLab } from "../computerLearningLab";
test("computer learning modules persist verified practice", async () => { const dir = await mkdtemp(path.join(os.tmpdir(), "sara-computer-lab-")); const lab = new ComputerLearningLab(path.join(dir, "lab.json")); await lab.initialize(); const result = await lab.recordPractice("files.safe", { passed: true, evidence: "Disposable file copied and destination verified." }); assert.equal(result.status, "passed"); assert.equal(JSON.parse(await readFile(path.join(dir, "lab.json"), "utf8")).modules.find((item: { id: string }) => item.id === "files.safe").attempts, 1); });
