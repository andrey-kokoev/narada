---
status: closed
created: 2026-04-23
depends_on: [394, 534]
closed_at: 2026-04-24T00:21:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 541 - Messaging Family Boundary Contract

## Goal

Define the canonical provider-agnostic messaging-connectivity boundary in Narada terms, distinct from the mail-connectivity family.

## Required Work

1. Define the messaging family as a distinct connectivity family.
2. Identify provider-agnostic messaging concerns:
   - inbound update model,
   - chat/thread context,
   - outbound action surface,
   - confirmation/reconciliation,
   - auth posture.
3. State what mail assumptions must not leak into messaging.
4. Define the minimum stable seam needed to host multiple messaging providers.
5. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Messaging-family concerns are explicit.
- [x] Anti-mail-leakage rules are explicit.
- [x] Minimum stable seam is explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Read prerequisite Task 531** (Mail Connectivity Boundary Contract) to establish the structural template for provider-family boundary contracts.
2. **Read prerequisite Task 534** (Mail vs Adjacent Source Family Boundary) to confirm that messaging is an adjacent source family, not a mail provider.
3. **Read `SEMANTICS.md`** to confirm vertical definitions and source-family neutrality.
4. **Read `packages/layers/control-plane/src/types/source.ts`** to confirm `Source` interface is domain-neutral and supports opaque payload/checkpoint.
5. **Read `packages/layers/control-plane/src/types/normalized.ts`** to confirm `NormalizedMessage` is mail-specific and not reusable for messaging.
6. **Read `packages/layers/control-plane/src/facts/types.ts`** to confirm fact type taxonomy has expansion points.
7. **Read `packages/layers/control-plane/src/intent/registry.ts`** to confirm intent family naming pattern (`mail.*`, `process.run`, `campaign.brief`).
8. **Produced boundary artifact** `.ai/decisions/20260423-541-messaging-family-boundary-contract.md` documenting:
   - §3.1 Ingress path (provider-agnostic vs Telegram/WhatsApp/Signal)
   - §3.2 `NormalizedChatUpdate` shape with provider-agnostic fields and extension slot
   - §3.3 Egress path with send/edit/delete intent families
   - §3.4 `ChatMessageFinder` reconciliation contract
   - §4: 12 anti-mail-leakage assumptions (5 shape, 4 container, 3 auth/transport)
   - §5: 7 required implementations for minimum stable seam
   - §7: Messaging vs Mail hard boundary comparison table
   - §8: 7 invariants
9. **No code changes required.** This is a documentation and contract task.

## Verification

- Decision artifact exists and is readable at `.ai/decisions/20260423-541-messaging-family-boundary-contract.md`.
- Provider-agnostic vs provider-specific seams are explicit for ingress, normalized shape, egress, identity, auth, and reconciliation.
- 12 anti-mail-leakage assumptions prevent subject, addressing, MIME, read-state, folder, draft, and archive semantics from leaking into messaging.
- Minimum stable seam lists 7 required implementations for a new messaging provider.
- Capability degradation matrix documents Telegram/WhatsApp/Signal differences.
- Messaging vs Mail comparison table (§7) documents 13 dimensional differences.
- Invariants are enforceable at fact type, intent type, normalizer, and source adapter levels.
- No `mail.*` fact types or intent types were modified or added.
- No code, CLI flags, DB columns, or package APIs were modified.
- No derivative status files created.
