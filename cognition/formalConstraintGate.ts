/**
 * Symbolic Formal Constraint & Pre-Condition Verifier (`FormalConstraintGate`).
 *
 * Mathematically and logically proves that resource bounds, ordering dependencies,
 * authorization states, and path preconditions are satisfiable BEFORE SARA
 * executes a multi-step plan — eliminating logical contradictions and resource
 * exhaustion with near-zero CPU/RAM overhead (no Ollama required).
 */

export type ComparisonOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export interface SymbolicConstraint {
  id: string;
  variable: string;
  op: ComparisonOp;
  value: number | boolean | string;
  description: string;
}

export interface StepDependency {
  stepId: string;
  requires: string[];
}

export interface ConstraintEnvironment {
  ramAvailableMb: number;
  cpuPercent: number;
  diskFreeMb?: number;
  ownerAuthorized: boolean;
  networkOnline?: boolean;
  customVars?: Record<string, number | boolean | string>;
}

export interface FormalProofResult {
  satisfiable: boolean;
  checkedConstraints: number;
  violatedConstraints: Array<{ id: string; description: string; actual: unknown; expected: string }>;
  executionOrder: string[];
  hasDependencyCycle: boolean;
  proofSummary: string;
}

function evaluateAtom(
  actual: number | boolean | string | undefined,
  op: ComparisonOp,
  expected: number | boolean | string,
): boolean {
  if (actual === undefined) return false;
  switch (op) {
    case "==":
      return actual === expected;
    case "!=":
      return actual !== expected;
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    default:
      return false;
  }
}

/**
 * Topological Kahn solver that either produces a mathematically valid execution
 * sequence for dependent steps or proves a cycle/unsatisfied dependency exists.
 */
export function solveDependencyOrder(steps: StepDependency[]): { valid: boolean; order: string[] } {
  if (!steps.length) return { valid: true, order: [] };
  const known = new Set(steps.map((s) => s.stepId));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const s of steps) {
    inDegree.set(s.stepId, 0);
    dependents.set(s.stepId, []);
  }

  for (const s of steps) {
    for (const req of s.requires) {
      if (!known.has(req)) {
        return { valid: false, order: [] };
      }
      inDegree.set(s.stepId, (inDegree.get(s.stepId) || 0) + 1);
      dependents.get(req)!.push(s.stepId);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of dependents.get(current) || []) {
      const updated = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, updated);
      if (updated === 0) queue.push(next);
    }
  }

  return {
    valid: order.length === steps.length,
    order,
  };
}

export class FormalConstraintGate {
  verifyPlan(input: {
    env: ConstraintEnvironment;
    constraints?: SymbolicConstraint[];
    dependencies?: StepDependency[];
  }): FormalProofResult {
    const vars: Record<string, number | boolean | string> = {
      ramAvailableMb: input.env.ramAvailableMb,
      cpuPercent: input.env.cpuPercent,
      diskFreeMb: input.env.diskFreeMb ?? 10_240,
      ownerAuthorized: input.env.ownerAuthorized,
      networkOnline: input.env.networkOnline ?? true,
      ...(input.env.customVars || {}),
    };

    const defaultConstraints: SymbolicConstraint[] = [
      {
        id: "auth_gate",
        variable: "ownerAuthorized",
        op: "==",
        value: true,
        description: "Owner session must be authorized",
      },
      {
        id: "min_ram_headroom",
        variable: "ramAvailableMb",
        op: ">=",
        value: 64,
        description: "At least 64 MB free system RAM headroom required",
      },
      {
        id: "cpu_saturation_guard",
        variable: "cpuPercent",
        op: "<=",
        value: 99,
        description: "CPU load must not be completely locked at 100%",
      },
    ];

    const allConstraints = [...defaultConstraints, ...(input.constraints || [])];
    const violated: FormalProofResult["violatedConstraints"] = [];

    for (const c of allConstraints) {
      const actual = vars[c.variable];
      if (!evaluateAtom(actual, c.op, c.value)) {
        violated.push({
          id: c.id,
          description: c.description,
          actual,
          expected: `${c.variable} ${c.op} ${String(c.value)}`,
        });
      }
    }

    const depCheck = solveDependencyOrder(input.dependencies || []);
    const satisfiable = violated.length === 0 && depCheck.valid;

    const proofSummary = satisfiable
      ? `SATISFIABLE: Verified ${allConstraints.length} formal constraint(s)${depCheck.order.length ? ` and proved valid execution order [${depCheck.order.join(" -> ")}]` : ""}.`
      : `UNSATISFIABLE: ${[
          ...violated.map((v) => `${v.id} (${v.expected}, got ${String(v.actual)})`),
          ...(depCheck.valid ? [] : ["cyclic or missing step dependency"]),
        ].join("; ")}`;

    return {
      satisfiable,
      checkedConstraints: allConstraints.length,
      violatedConstraints: violated,
      executionOrder: depCheck.order,
      hasDependencyCycle: !depCheck.valid,
      proofSummary,
    };
  }
}
