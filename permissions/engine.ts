/**
 * Permission engine.
 *
 * Every state-changing capability the agent uses is checked here first.
 * Policies are ALLOW / ASK / DENY per capability with optional scoped rules
 * (trusted contacts, path prefixes, domains, command prefixes). A small set of
 * capabilities is locked to at least ASK; the user can deny them but never
 * silently allow them. Session grants ("allow for this session") live only in
 * memory.
 */
import path from "node:path";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile";
import {
  CAPABILITY_INFO,
  LOCKED_TO_ASK,
  type Capability,
  type CapabilityPolicy,
  type Decision,
  type MessageConfirmationMode,
  type PermissionContext,
  type PermissionPolicy,
  type PermissionVerdict,
} from "./types";

export const DEFAULT_POLICY: PermissionPolicy = {
  version: 1,
  capabilities: {
    READ_FILE: { decision: "allow" },
    WRITE_FILE: { decision: "allow" },
    DELETE_FILE: { decision: "ask" },
    DOWNLOAD_FILE: { decision: "allow" },
    EXECUTE_DOWNLOAD: { decision: "ask" },
    SEND_MESSAGE: { decision: "ask" },
    RUN_COMMAND: { decision: "ask" },
    INSTALL_SOFTWARE: { decision: "ask" },
    MODIFY_SYSTEM_SETTINGS: { decision: "ask" },
    ACCESS_MICROPHONE: { decision: "allow" },
    ACCESS_CAMERA: { decision: "deny" },
    CONTROL_INPUT: { decision: "allow" },
    SCREEN_CAPTURE: { decision: "allow" },
    LAUNCH_APP: { decision: "allow" },
    BROWSE_WEB: { decision: "allow" },
    CLIPBOARD: { decision: "allow" },
    NETWORK_API: { decision: "allow" },
    PURCHASE: { decision: "ask" },
    ACCOUNT_CHANGE: { decision: "ask" },
    POWER_CONTROL: { decision: "ask" },
  },
  messageConfirmation: "always_confirm",
  trustedContacts: [],
  knownRecipients: [],
};

const DECISION_RANK: Record<Decision, number> = { allow: 0, ask: 1, deny: 2 };

function stricter(a: Decision, b: Decision): Decision {
  return DECISION_RANK[a] >= DECISION_RANK[b] ? a : b;
}

function normalizePath(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
}

export class PermissionEngine {
  private policy: PermissionPolicy = structuredClone(DEFAULT_POLICY);
  private readonly sessionGrants = new Set<string>();
  private readonly explicitBlocks = new Set<Capability>();
  private readonly file: string;
  private readonly listeners = new Set<(policy: PermissionPolicy) => void>();

  constructor(dataDir: string, private readonly env: NodeJS.ProcessEnv = process.env) {
    this.file = path.join(dataDir, "permissions", "policy.v1.json");
  }

  async initialize(): Promise<void> {
    const stored = await readJsonFile<PermissionPolicy | null>(this.file, null);
    if (stored && stored.version === 1) {
      this.policy = mergePolicy(stored);
    } else {
      this.policy = migrateFromLegacyEnv(this.env);
      await this.save();
    }
    if (/^(1|true|yes|on)$/i.test(String(this.env.SARA_AUTONOMOUS_MODE ?? this.env.SARA_JARVIS_MODE ?? "").trim())) {
      await this.setAutonomousOverride(true, { allowAllCapabilities: true });
    }
  }

  getPolicy(): PermissionPolicy {
    return structuredClone(this.policy);
  }

  isAutonomousOverride(): boolean {
    return this.policy.autonomousOverride === true;
  }

  /**
   * Enable or disable owner-configured JARVIS full-autonomy mode.
   * When enabled, interactive confirmation prompts ("ask") and locked-to-ask
   * restrictions are lifted so SARA executes authorized tasks end-to-end.
   */
  async setAutonomousOverride(enabled: boolean, options: { allowAllCapabilities?: boolean } = {}): Promise<PermissionPolicy> {
    this.policy.autonomousOverride = enabled;
    if (enabled && options.allowAllCapabilities !== false) {
      this.explicitBlocks.clear();
      for (const cap of Object.keys(CAPABILITY_INFO) as Capability[]) {
        this.policy.capabilities[cap] = { ...this.policy.capabilities[cap], decision: "allow" };
      }
      this.policy.messageConfirmation = "autonomous_no_confirm";
    } else if (!enabled) {
      for (const cap of LOCKED_TO_ASK) {
        if (this.policy.capabilities[cap]?.decision === "allow") {
          this.policy.capabilities[cap] = { ...this.policy.capabilities[cap], decision: "ask" };
        }
      }
      if (this.policy.messageConfirmation === "autonomous_no_confirm") {
        this.policy.messageConfirmation = "always_confirm";
      }
    }
    await this.save();
    return this.getPolicy();
  }

  onChange(listener: (policy: PermissionPolicy) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async setDecision(capability: Capability, decision: Decision): Promise<PermissionVerdict> {
    if (!(capability in CAPABILITY_INFO)) throw new Error(`Unknown capability ${capability}`);
    const autonomous = this.isAutonomousOverride();
    const effective = !autonomous && LOCKED_TO_ASK.has(capability) && decision === "allow" ? "ask" : decision;
    if (effective === "deny") this.explicitBlocks.add(capability);
    else this.explicitBlocks.delete(capability);
    this.policy.capabilities[capability] = { ...this.policy.capabilities[capability], decision: effective };
    await this.save();
    return this.check(capability);
  }

  async setMessageConfirmation(mode: MessageConfirmationMode): Promise<void> {
    this.policy.messageConfirmation = mode;
    await this.save();
  }

  async setTrustedContact(contactId: string, trusted: boolean): Promise<void> {
    const set = new Set(this.policy.trustedContacts);
    if (trusted) set.add(contactId);
    else set.delete(contactId);
    this.policy.trustedContacts = [...set];
    await this.save();
  }

  async rememberRecipient(contactId: string): Promise<void> {
    if (this.policy.knownRecipients.includes(contactId)) return;
    this.policy.knownRecipients.push(contactId);
    await this.save();
  }

  /** Grant for the rest of this app session (never for locked capabilities unless autonomous override is active). */
  grantForSession(capability: Capability, context: PermissionContext = {}): boolean {
    if (!this.isAutonomousOverride() && LOCKED_TO_ASK.has(capability)) return false;
    this.sessionGrants.add(sessionKey(capability, context));
    return true;
  }

  clearSessionGrants(): void {
    this.sessionGrants.clear();
  }

  check(capability: Capability, context: PermissionContext = {}): PermissionVerdict {
    const autonomous = this.isAutonomousOverride();
    const policy: CapabilityPolicy = this.policy.capabilities[capability] || { decision: "ask" };
    const locked = !autonomous && LOCKED_TO_ASK.has(capability);
    let decision: Decision = policy.decision;
    let reason = `${CAPABILITY_INFO[capability]?.label || capability}: policy is ${policy.decision}.`;
    let ruleId: string | undefined;

    for (const rule of policy.rules || []) {
      if (this.ruleMatches(rule.when, capability, context)) {
        decision = rule.decision;
        reason = rule.description;
        ruleId = rule.id;
        break;
      }
    }

    if (autonomous) {
      if (decision === "deny" && (this.explicitBlocks.has(capability) || Boolean(ruleId))) {
        return { capability, decision: "deny", reason, ruleId, locked: false };
      }
      return {
        capability,
        decision: "allow",
        reason: "JARVIS Autonomous Mode: owner-authorized zero-prompt execution.",
        ruleId,
        locked: false,
      };
    }

    if (capability === "SEND_MESSAGE" && decision !== "deny") {
      const contactId = context.recipientContactId || null;
      const trusted = Boolean(contactId && this.policy.trustedContacts.includes(contactId));
      const known = Boolean(contactId && this.policy.knownRecipients.includes(contactId));
      switch (this.policy.messageConfirmation) {
        case "autonomous_no_confirm":
          decision = "allow";
          reason = "Autonomous messaging policy enabled.";
          break;
        case "always_confirm":
        case "never_without_preview":
          decision = "ask";
          reason = "Messages are always confirmed before sending.";
          break;
        case "confirm_new_recipients":
          decision = known || trusted ? "allow" : "ask";
          reason = known || trusted ? "Recipient has been approved before." : "First message to this recipient needs confirmation.";
          break;
        case "trusted_without_confirmation":
          decision = trusted ? "allow" : "ask";
          reason = trusted ? "Recipient is a trusted contact." : "Recipient is not a trusted contact.";
          break;
      }
      // An unresolved recipient can never be sent to without confirmation in standard mode.
      if (!contactId && this.policy.messageConfirmation !== "autonomous_no_confirm") {
        decision = "ask";
        reason = "Recipient is not a saved contact.";
      }
    }

    if (capability === "DELETE_FILE" && context.permanent) {
      decision = stricter(decision, "ask");
      reason = "Permanent deletion always needs confirmation.";
    }

    if (decision === "ask" && !locked && this.sessionGrants.has(sessionKey(capability, context))) {
      decision = "allow";
      reason = "Allowed for this session.";
    }
    if (locked && decision === "allow") {
      decision = "ask";
      reason = `${CAPABILITY_INFO[capability].label} always needs confirmation.`;
    }
    return { capability, decision, reason, ruleId, locked };
  }

  private ruleMatches(when: NonNullable<CapabilityPolicy["rules"]>[number]["when"], capability: Capability, context: PermissionContext): boolean {
    if (when.trustedContact !== undefined) {
      const trusted = Boolean(context.recipientContactId && this.policy.trustedContacts.includes(context.recipientContactId));
      if (trusted !== when.trustedContact) return false;
    }
    if (when.newRecipient !== undefined) {
      const known = Boolean(context.recipientContactId && this.policy.knownRecipients.includes(context.recipientContactId));
      if (known === when.newRecipient) return false;
    }
    if (when.pathPrefix) {
      if (!context.path) return false;
      if (!normalizePath(context.path).startsWith(normalizePath(when.pathPrefix))) return false;
    }
    if (when.domain) {
      if (!context.domain) return false;
      const domain = context.domain.toLowerCase();
      const wanted = when.domain.toLowerCase();
      if (domain !== wanted && !domain.endsWith(`.${wanted}`)) return false;
    }
    if (when.commandPrefix) {
      if (!context.command || !context.command.trim().toLowerCase().startsWith(when.commandPrefix.toLowerCase())) return false;
    }
    void capability;
    return true;
  }

  private async save(): Promise<void> {
    await writeJsonFile(this.file, this.policy);
    for (const listener of this.listeners) listener(this.getPolicy());
  }
}

function sessionKey(capability: Capability, context: PermissionContext): string {
  return [capability, context.recipientContactId || "", context.domain || ""].join("|");
}

function mergePolicy(stored: PermissionPolicy): PermissionPolicy {
  const merged = structuredClone(DEFAULT_POLICY);
  const autonomousOverride = stored.autonomousOverride === true;
  for (const [capability, value] of Object.entries(stored.capabilities || {})) {
    if (capability in merged.capabilities && value && typeof value.decision === "string") {
      const cap = capability as Capability;
      const decision = !autonomousOverride && LOCKED_TO_ASK.has(cap) && value.decision === "allow" ? "ask" : value.decision;
      merged.capabilities[cap] = { decision, rules: Array.isArray(value.rules) ? value.rules : undefined };
    }
  }
  merged.messageConfirmation = stored.messageConfirmation || merged.messageConfirmation;
  merged.trustedContacts = Array.isArray(stored.trustedContacts) ? stored.trustedContacts : [];
  merged.knownRecipients = Array.isArray(stored.knownRecipients) ? stored.knownRecipients : [];
  merged.autonomousOverride = autonomousOverride;
  return merged;
}

/** First-run migration from the previous MYRAA_PERMISSION_* boolean flags. */
export function migrateFromLegacyEnv(env: NodeJS.ProcessEnv): PermissionPolicy {
  const policy = structuredClone(DEFAULT_POLICY);
  const off = (name: string) => ["0", "false", "no", "off"].includes(String(env[`MYRAA_PERMISSION_${name}`] ?? "").trim().toLowerCase());
  const deny = (...capabilities: Capability[]) => {
    for (const capability of capabilities) policy.capabilities[capability] = { decision: "deny" };
  };
  if (off("MICROPHONE")) deny("ACCESS_MICROPHONE");
  if (off("SCREEN_AWARENESS")) deny("SCREEN_CAPTURE");
  if (off("FILESYSTEM_READ")) deny("READ_FILE");
  if (off("FILESYSTEM_WRITE")) deny("WRITE_FILE", "DELETE_FILE");
  if (off("DESKTOP_CONTROL")) deny("CONTROL_INPUT", "LAUNCH_APP");
  if (off("BROWSER")) deny("BROWSE_WEB");
  if (off("NETWORK")) deny("NETWORK_API", "DOWNLOAD_FILE");
  if (off("CODE_EXECUTION")) deny("RUN_COMMAND");
  if (off("SYSTEM_CONTROL")) deny("MODIFY_SYSTEM_SETTINGS", "POWER_CONTROL");
  return policy;
}
