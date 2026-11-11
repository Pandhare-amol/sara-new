import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { SemanticGraph } from "../semanticGraph";

test("semantic graph persists knowledge-topic relationships", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "sara-graph-test-"));
  const graph = new SemanticGraph(path.join(dir, "graph.json"));
  await graph.initialize();
  await graph.upsertKnowledge({ id: "k1", topic: "Python" });
  assert.equal(graph.related("knowledge:k1").length, 2);
});
