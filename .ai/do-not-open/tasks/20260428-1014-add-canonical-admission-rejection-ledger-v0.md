---
status: closed
amended_by: architect
amended_at: 2026-04-28T03:06:05.727Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T03:06:12.363Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI smoke checks, and pnpm verify prove the admission/rejection ledger acceptance criteria.
closed_at: 2026-04-28T03:06:13.492Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add canonical admission rejection ledger v0

## Chapter

Admission Rejection Ledger

## Goal

Create a durable command-mediated ledger for admission, rejection, deferral, and supersession decisions so candidates do not disappear by silence.

## Context

The canonical inbox observation states that file drops, mailbox filters, proposals, Site absorption, routing choices, and task/knowledge promotions need durable evidence for what was considered, admitted, rejected, deferred, or superseded. Canonical Inbox stores admitted envelopes and promotion status, but there was no general ledger for candidate decisions before or around envelope creation.

## Required Work

1. Add a site-local admission/rejection ledger store.
2. Add CLI surfaces to record decisions, list decisions, and explain a decision.
3. Model candidate id, source kind/ref, candidate kind, decision, reason codes, evidence refs, deciding principal/system rule, authority level, resulting envelope id, supersession/retry links, and timestamps.
4. Keep outputs bounded and human/JSON friendly.
5. Document the ledger as an admission authority surface adjacent to Canonical Inbox.
6. Promote the inbox observation to this work.
7. Add focused tests and pass verification.

## Non-Goals

- Do not retrofit every inbox or mailbox intake path in this task.
- Do not store private message bodies or raw source payloads.
- Do not implement remote ledger replication.
- Do not touch unrelated untracked directories.

## Execution Notes

1. Added `packages/layers/cli/src/lib/admission-rejection-ledger.ts` with the v0 ledger model, read/write helpers, decision validation, CSV parsing, and entry creation.
2. Added `packages/layers/cli/src/commands/admission.ts` with record, list, and explain command implementations.
3. Added `packages/layers/cli/src/commands/admission-register.ts` and registered `narada admission` in `main.ts`.
4. Added `admission` to grouped help under Intent & Intake Zones.
5. Added `docs/concepts/canonical-admission-rejection-ledger.md` and linked it from `AGENTS.md`.
6. Added focused tests in `packages/layers/cli/test/commands/admission.test.ts` covering rejected candidate decisions, admitted decision validation, and admitted/deferred/superseded recording.
7. Promoted inbox observation `env_5bcd00c2-a2d5-489a-82e6-79a1cf6d0db8` to this task.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/admission.test.ts test/commands/capability.test.ts` | Pass, 6/6 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| Bounded CLI smoke: `narada admission record/list/explain` in a temp cwd | Pass; rejected decision recorded, listed, explained, and `raw_payload_stored` is false |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes admission ledger operators.
- [x] Record creates a durable decision for admitted rejected deferred and superseded candidates.
- [x] List and explain inspect ledger state with bounded output.
- [x] Ledger model includes candidate id, source kind/ref, candidate kind, decision, reason codes, evidence refs, deciding principal/system rule, authority level, resulting envelope id, supersession/retry links, and timestamps.
- [x] Documentation defines rejection as durable evidence, not silence.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and pnpm verify pass.
