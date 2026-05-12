# Task 1229 Crew Startup Shortcut Descriptor Admission

## Decision

Admitted: Narada proper may carry `.narada/crew` launch intent descriptors/templates for agent startup coordination.

## Scope

The admitted surface is descriptor-only:

- `.narada/crew/README.md`
- `.narada/crew/architect.startup-request.json`
- `.narada/crew/templates/agent-startup-request.template.json`

The descriptors may be consumed by a separately admitted local carrier that verifies required MCP surfaces, hydration evidence, and role session admission before execution.

## Identity Doctrine

Named agent identity is not role assignment. Startup descriptors keep `namedAgentIds` and `roleNames` as separate fields. Claimed identity is data until a local carrier verifies the mechanical basis.

## Not Admitted

- Direct substrate shortcut execution.
- Native shell fallback.
- PC-locus mutation.
- Operator-surface runtime copying.
- Process launch side effects.
- Windows `.lnk` creation.
- Source Site runtime state import.
- Workboard state import from another Site.
- Checkpoint history import from another Site.
- Secrets, credentials, or implicit capability grants.

## Evidence

- Capability candidate: `.narada/capabilities/crew-startup-shortcut-capability-candidate.json`.
- Package contract: `packages/crew-startup-shortcut`.
- Audit: `.narada/audit/task-1229-crew-startup-shortcut-descriptors-audit.json`.
