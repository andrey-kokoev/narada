---
status: closed
amended_by: architect
amended_at: 2026-04-28T03:20:05.897Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T03:20:12.563Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI smoke checks, and pnpm verify prove the canonical outbox acceptance criteria.
closed_at: 2026-04-28T03:20:13.765Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add canonical outbox v0

## Chapter

Canonical Outbox

## Goal

Create a durable command-mediated outbox for governed outbound effect intents across transports, starting with inert composition, preview, approval, confirmation, and archival state transitions.

## Context

Incoming intent now has Canonical Inbox. Outgoing effects need a sibling discipline before execution becomes ambiguous: send, publish, notify, hand off, create external issue/comment, write filesystem drop, call webhook, or cross from Narada into another locus or transport.

## Required Work

1. Add a site-local Canonical Outbox store for outbound effect intents.
2. Add CLI surfaces to compose, list, show, preview, approve, confirm, archive, and supersede outbox items.
3. Model item id, target kind/ref, transport, payload ref/body, authority, approval requirement/status, route id, capability grant id, lifecycle status, dry-run rendering, execution/delivery evidence, retry/supersession links, and timestamps.
4. Keep execution inert in v0: no external transport sends.
5. Export outbox artifacts to Git-visible JSON analogous to inbox envelopes.
6. Document Canonical Outbox and its relation to Inbox, Routing, Capability Consent, Admission Ledger, and transport executors.
7. Promote the inbox observation to this work.
8. Add focused tests and pass verification.

## Non-Goals

- Do not send email, write remote GitHub comments, call webhooks, or mutate external transports in this task.
- Do not retrofit mailbox outbound_handoffs in this task.
- Do not store secrets.
- Do not touch unrelated untracked directories.

## Execution Notes

1. Added `packages/layers/cli/src/lib/canonical-outbox.ts` with the v0 item model, read/write helpers, preview renderer, item creation, and lookup.
2. Added `packages/layers/cli/src/commands/outbox.ts` with compose, list, show, preview, approve, confirm, archive, supersede, and export command implementations.
3. Added `packages/layers/cli/src/commands/outbox-register.ts` and registered `narada outbox` in `main.ts`.
4. Added `outbox` to grouped help under Intent & Intake Zones.
5. Added `docs/concepts/canonical-outbox.md` and linked it from `AGENTS.md`.
6. Added focused tests in `packages/layers/cli/test/commands/outbox.test.ts` covering compose/preview/approve/confirm/export, list/archive, and supersession links.
7. Promoted inbox observation `env_896cbd3a-091b-4597-becb-3dea6fa237c1` to this task.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/outbox.test.ts test/commands/routing.test.ts test/commands/admission.test.ts test/commands/capability.test.ts` | Pass, 12/12 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| Bounded CLI smoke: `narada outbox compose/preview/approve/confirm/export` in a temp cwd | Pass; preview rendered payload, no external mutation performed, export wrote one artifact |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes canonical outbox operators.
- [x] Compose creates a durable inert outbox item without external mutation.
- [x] Preview renders bounded dry-run output without mutation.
- [x] Approve confirm archive and supersede transition lifecycle state with evidence.
- [x] Model includes target kind/ref, transport, payload ref/body, authority, approval, route id, capability grant id, status, rendering, execution/delivery evidence, retry/supersession links, and timestamps.
- [x] Export writes Git-visible outbox item artifacts.
- [x] Documentation defines Outbox as outbound effect intent authority, not transport execution.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and pnpm verify pass.
