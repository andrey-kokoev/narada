---
status: closed
created: 2026-04-23
depends_on: [541]
closed_at: 2026-04-24T00:38:00Z
closed_by: codex
governed_by: task_close:codex
---

# Task 543 - Messaging vs Mail Boundary

## Goal

Prevent semantic smear between the messaging-connectivity family and the mail-connectivity family.

## Required Work

1. Define what qualifies as a member of the messaging family.
2. State what makes messaging different from mail:
   - conversational event stream vs mailbox correspondence,
   - weaker/absent draft boundary,
   - different reconciliation semantics,
   - faster action/response loop.
3. Record explicit anti-smear language for future shaping.
4. Write the boundary artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Boundary artifact exists.
- [x] Messaging-family membership rules are explicit.
- [x] Messaging-vs-mail distinction is explicit.
- [x] Anti-smear language is recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

- Drew on Decision 541 (Messaging Family Boundary Contract) §7 for the initial comparison table.
- Drew on Decision 534 (Mail vs Adjacent Source Family Boundary) §2 for membership-rule pattern.
- Expanded the four hard distinctions from the task goal into full comparison tables with explanatory text.
- Added 10 anti-smear phrases with preferred replacements.
- Documented Slack and SMS as adjacent systems that are neither messaging nor mail.
- Added cross-family adapter rules (§6) to make explicit conversion the only permitted path.
- No code changes; pure documentation/contract task.

## Verification

### Method
- Manual review of artifact against acceptance criteria.
- Cross-reference with Decision 541 and 534 for consistency.
- `pnpm verify` and `pnpm typecheck` to confirm no code-level regressions.

### Results
- Boundary artifact: `.ai/decisions/20260423-543-messaging-vs-mail-boundary.md` (14046 bytes)
- Membership rules: §2.1–2.4 with explicit 4-criteria test and membership table
- Four hard distinctions: §3.1–3.4 with per-dimension tables
- Anti-smear language: §4 with 10 forbidden phrases and preferred replacements
- `pnpm verify`: **All 5 steps pass**
- `pnpm typecheck`: **All packages pass**
