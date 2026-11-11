# Sara advanced capabilities

Sara keeps the existing `MYRAA_*` environment variables, IPC names, persisted
data directories, and compatibility identifiers intentionally. They are
internal contracts, not the visible product name; changing them blindly would
orphan existing memory, settings, and Windows startup entries.

## Available now

- Multimodal voice and desktop perception where the configured provider and
  Windows permissions support it.
- Persistent task, project, memory, and knowledge records with source and
  confidence metadata.
- Background task execution with bounded concurrency, priorities,
  cancellation, pause/resume, progress events, and resource-aware scheduling.
- Permission-gated Windows application, file, keyboard, mouse, and screen
  operations through the local desktop agent.
- Controlled knowledge refresh and isolated code-improvement proposals.
- Health monitoring, bounded recovery, approval workflows, and a dashboard.
- Barge-in speech interruption without cancelling unrelated background work.

## Deliberate limits

Sara does not claim consciousness, AGI, ASI, biometric inference, quantum
cryptography, holographic projection, unrestricted internet self-learning, or
automatic production self-modification. New skills must pass the existing
permission, sandbox, validation, and approval boundaries. Hardware-dependent
features such as spatial projection, IoT synchronization, and biometric
feedback require an explicitly configured provider or device integration.

Autonomous research treats web content as untrusted data. It cannot authorize
tools, change permissions, install arbitrary software, or deploy generated
code without the relevant user approval.
