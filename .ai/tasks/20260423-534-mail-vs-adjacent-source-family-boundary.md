---
status: closed
created: 2026-04-23
depends_on: [531]
closed_at: 2026-04-23T23:58:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 534 - Mail vs Adjacent Source Family Boundary

## Goal

Prevent semantic smear between the mail-connectivity family and adjacent source / notification families such as GitHub.

## Required Work

1. Define what qualifies as a member of the mail-connectivity family.
2. Define what makes systems like GitHub adjacent rather than mail providers:
   - native object model,
   - native transport/control surfaces,
   - notification vs mailbox semantics,
   - authority boundary.
3. State whether and how adjacent systems may still enter Narada through:
   - direct source adapters,
   - connector/tool surfaces,
   - mail notifications admitted as mail facts.
4. Record explicit anti-smear language for future chapter/task shaping.
5. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Mail-family membership rules are explicit.
- [x] GitHub-style adjacent-source distinction is explicit.
- [x] Anti-smear language is recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Read prerequisite Task 531** to establish the mail-connectivity boundary contract and provider-agnostic vs provider-specific seams.
2. **Read `SEMANTICS.md`** to confirm vertical definitions (mailbox, timer, webhook, filesystem, process) and source-family neutrality.
3. **Read `packages/layers/control-plane/src/facts/types.ts`** to confirm fact type taxonomy (`mail.*`, `webhook.received`, `timer.tick`, `filesystem.change`).
4. **Read `packages/layers/control-plane/src/intent/registry.ts`** to confirm intent family taxonomy (`mail.*`, `process.run`, `campaign.brief`).
5. **Read `packages/layers/control-plane/src/sources/webhook-source.ts`** to confirm `WebhookSource` is domain-neutral and emits `webhook.received` facts.
6. **Produced boundary artifact** `.ai/decisions/20260423-534-mail-vs-adjacent-source-family-boundary.md` documenting:
   - §2: Four membership rules for the mail-connectivity family
   - §3: GitHub case study with native object model, transport, notification semantics, authority boundary
   - §4: Three entry paths for adjacent systems (source adapters, tools, mail notifications)
   - §5: Seven anti-smear phrases with preferred replacements
   - §6: Five-criteria smear detection heuristic
   - §7: Five invariants
7. **No code changes required.** This is a documentation and contract task.

## Verification

- Decision artifact exists and is readable at `.ai/decisions/20260423-534-mail-vs-adjacent-source-family-boundary.md`.
- Membership rules are explicit: RFC 5322 shape, mailbox semantics, thread grouping, send/receive capability.
- GitHub case study documents all four required distinctions (native object model, transport, notification vs mailbox, authority boundary).
- Three entry paths are explicit and correctly separated.
- Anti-smear language records 7 forbidden phrases with canonical replacements.
- Smear detection heuristic provides 5 testable criteria.
- Invariants are enforceable at fact type, intent type, and source adapter levels.
- No `mail.*` fact types or intent types were modified or added.
- No code, CLI flags, DB columns, or package APIs were modified.
- No derivative status files created.
