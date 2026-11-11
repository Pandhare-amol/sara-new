# Sara 10.0 implementation plan

This plan extends the existing Sara/MYRAA desktop assistant. It does not
replace its voice, task, memory, Windows-agent, or Electron architecture.

## Preservation baseline

The following are compatibility-critical and must remain stable:

- Electron lifecycle, tray, close-to-background, startup, and quit behavior.
- The existing WebSocket voice session, microphone capture, VAD, TTS queue,
  barge-in, and reconnection flow.
- Existing task IDs, task persistence, approvals, cancellation, and recovery.
- Existing `MYRAA_*` environment variables, IPC names, data paths, and API
  contracts. These are internal compatibility identifiers.
- Existing Windows agent permissions, safety checks, and user data.

Baseline recorded on 2026-10-20: TypeScript validation passed; 47 agent tests,
8 character tests, and 32 desktop-agent tests passed. One character archive
fixture test was skipped because the fixture was not present.

## Phased implementation

### Phase A — always-ready reliability and observability

Existing work: tray/background mode, pause/resume listening, speech mute,
barge-in, task HUD, bounded scheduler, health monitoring, dashboard controls,
and native Windows perception fallback.

Remaining verification: packaged Electron runtime tests for minimize, close to
tray, quit, microphone recovery, and interruption while a real task runs.

Gate: regression suite, production build, packaged smoke test, and no orphaned
Sara-owned worker processes after quit.

### Phase B — multimodal perception and contextual memory

Extend `cognition/perceptionContext.ts` and the existing document/artifact
pipeline for source-tagged voice, desktop, screen, document, and authorized
sensor observations. Keep facts separate from model interpretations.

Extend existing memory and knowledge stores with provenance, correction history,
retention, export, deletion propagation, and hybrid retrieval evaluations.

Gate: unavailable-input tests, stale-observation tests, memory isolation,
correction, deletion, retrieval relevance, and restart persistence.

### Phase C — controlled skills and Windows control

Add a versioned skill manifest containing source, license, permissions,
dependencies, validation evidence, and rollback information. Generate and test
candidate skills in isolated Git worktrees or restricted environments.

Reuse the existing permission-controlled Windows agent for structured app,
file, UI, keyboard, mouse, and document operations. Require approval for
installation, privileged actions, external communication, deletion, and
overwrites.

Gate: malicious-source and prompt-injection tests, invalid manifest tests,
approval expiry, rollback, path validation, and no direct execution of
downloaded code.

### Phase D — adaptive assistance and device boundaries

Add opt-in response-style adaptation using uncertain conversational cues only.
Never diagnose or retain sensitive emotional inferences by default.

Add authenticated device registration, capability discovery, revocation,
encrypted transport, offline queues, duplicate-event protection, and scoped
remote commands. Local Sara must remain functional if all remote devices are
offline.

Gate: device authentication, scope enforcement, revocation, replay/duplicate
tests, offline recovery, and explicit consent tests.

### Phase E — secure storage and self-evolution evidence

Extend the existing secret store and privacy controls with encrypted sensitive
records, rotation, retention, export, and deletion. Use maintained platform
cryptography and document algorithms and limitations; do not claim universal
post-quantum security without verified support.

Extend the isolated code-improvement workflow with baseline comparison,
security checks, regression benchmarks, review reports, approval, and rollback.
Production code, permissions, model weights, and safety controls remain
approval-gated.

Gate: secret-redaction tests, rotation/recovery tests, worktree isolation,
failed-candidate rejection, and promotion approval tests.

### Phase F — optional immersive adapters

Detect supported spatial-audio, AR/VR, camera, wearable, or IoT capabilities
before enabling them. Keep camera, microphone, screen, biometric, and remote
device permissions independent and visible. If hardware is absent, leave the
existing 2D/3D avatar and voice experience unchanged.

Gate: capability detection, permission denial, device removal, resource
pressure, and graceful fallback tests.

## Feature-toggle policy

New sensor, remote-device, skill-installation, predictive, and immersive
features are disabled until explicitly configured. Existing user settings and
data are migrated additively only; no destructive schema replacement is
allowed.

## Rollback

1. Disable the new feature toggle.
2. Stop only Sara-owned background workers through the existing stop path.
3. Preserve user data and export any new records before removal.
4. Revert the isolated Git change or restore the prior packaged build.
5. Re-run the baseline regression suite and health check.

## Honest capability boundary

The system can provide measurable multimodal perception, controlled automation,
persistent memory, bounded background work, and evidence-based improvement. It
does not claim consciousness, AGI/ASI, unrestricted self-modification,
quantum-safe protection without a verified implementation, or unsupported
holographic/biometric capabilities.
