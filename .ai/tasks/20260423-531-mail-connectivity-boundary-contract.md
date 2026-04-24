---
status: closed
closed: 2026-04-23
governed_by: task_close:a2
created: 2026-04-23
depends_on: [394]
---

# Task 531 - Mail Connectivity Boundary Contract

## Goal

Define the canonical provider-agnostic mail-connectivity boundary in Narada terms: what belongs to the mail family, what is provider-specific, and what the kernel must never assume.

## Required Work

1. Define the canonical mail-connectivity boundary over the existing Microsoft Graph path.
2. Separate provider-agnostic concerns from provider-specific concerns:
   - authentication,
   - source delta read,
   - message/thread identity,
   - draft/send boundary,
   - confirmation/reconciliation,
   - credential binding.
3. State what the kernel and control plane must never assume about any one provider.
4. Identify the minimum stable seam needed to host multiple providers.
5. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Provider-agnostic vs provider-specific seams are explicit.
- [x] Kernel/control-plane anti-assumptions are explicit.
- [x] Minimum stable seam is explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Boundary artifact produced:** `.ai/decisions/20260423-531-mail-connectivity-boundary-contract.md` documents:
   - The canonical mail-connectivity boundary over the existing Microsoft Graph path
   - Provider-agnostic vs provider-specific seams for ingress, normalized message shape, egress, identity, auth, and reconciliation
   - 13 kernel/control-plane anti-assumptions (4 source, 3 egress, 3 auth, 3 general)
   - Minimum stable seam: 7 required implementations for a new provider
   - Capability degradation matrix for Graph/Gmail/IMAP
   - Adjacent source family boundary preview (GitHub, Slack, Klaviyo, SMS)
   - 6 invariants

2. **No code changes required.** This is a documentation and contract task.

## Verification

- `pnpm verify` — all 5 steps pass (task file guard, typecheck, build, charters tests, ops-kit tests).
- `pnpm typecheck` — all packages pass.
- Existing `ExchangeSource` implements `Source` interface with opaque payload.
- `NormalizedMessage` fields are provider-agnostic except for `source_extensions.graph`.
- `OutboundCommand` state machine contains no Graph-specific references.
- `MessageFinder` interface is abstraction-based.
- `INTENT_FAMILIES` registry uses `mail.*` family names, not `graph.*`.

**governed_by: task_close:a2**


