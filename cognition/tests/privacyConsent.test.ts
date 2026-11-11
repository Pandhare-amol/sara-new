import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrivacyConsentStore } from "../privacyConsent";

test("upload consent is exact-file, provider-specific, expiring, and revocable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sara-consent-"));
  try {
    const store = new PrivacyConsentStore(path.join(dir, "consent.json")); await store.initialize();
    const first = path.join(dir, "a", "report.pdf"); const sameName = path.join(dir, "b", "report.pdf");
    const consent = await store.grant({ purpose: "Summarize this report", provider: "gemini", fileNames: [first] });
    assert.equal(store.has(consent.id, "gemini", [first]), true);
    assert.equal(store.has(consent.id, "other", [first]), false);
    assert.equal(store.has(consent.id, "gemini", [sameName]), false);
    assert.equal(await store.revoke(consent.id), true);
    assert.equal(store.has(consent.id, "gemini", [first]), false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
