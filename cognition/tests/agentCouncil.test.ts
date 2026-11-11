import assert from "node:assert/strict";
import test from "node:test";
import { createCouncilPlan } from "../agentCouncil";
test("council selects bounded specialists from the goal", () => { const plan = createCouncilPlan("research and build a website, run tests, and publish it"); const roles = plan.members.map((member) => member.role); assert.ok(roles.includes("research")); assert.ok(roles.includes("coding")); assert.ok(roles.includes("testing")); assert.ok(roles.includes("security")); assert.ok(roles.includes("verification")); assert.equal(plan.approvalRequired, true); });
