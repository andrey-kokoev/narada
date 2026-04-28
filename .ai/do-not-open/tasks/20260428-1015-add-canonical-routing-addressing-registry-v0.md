---
status: closed
amended_by: architect
amended_at: 2026-04-28T03:12:17.328Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T03:12:26.701Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI smoke checks, and pnpm verify prove the routing/addressing registry acceptance criteria.
closed_at: 2026-04-28T03:12:27.771Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add canonical routing addressing registry v0

## Chapter

Routing Addressing Registry

## Goal

Create a durable command-mediated registry for Site addresses and route resolution so delivery targets are explainable before outbox or Site-to-Site mutation.

## Context

Canonical Inbox admits intent and Outbox governs outbound effects, but routing decides which Site, locus, human, or transport should receive an item and how that target is addressed without authority collapse. Recent Site work repeatedly encountered User Site vs PC Site, client-service vs data vs ELT Sites, Narada proper proposals vs local observations, and planned Site-to-Site/file-drop delivery.

## Required Work

1. Add a site-local routing/addressing registry store.
2. Add CLI surfaces to add address records, list records, resolve a route target, and explain a route record.
3. Model route id, target kind/ref, authority locus, address kind/ref, transport, capability kind, priority, active status, fallback target, evidence ref, and created/updated metadata.
4. Resolution must return an explainable selected route and alternatives without mutation.
5. Document routing/addressing as distinct from inbox, outbox, and capability grants.
6. Promote the inbox observation to this work.
7. Add focused tests and pass verification.

## Non-Goals

- Do not retrofit outbox senders or Site-to-Site delivery in this task.
- Do not implement network delivery.
- Do not store secrets.
- Do not touch unrelated untracked directories.

## Execution Notes

1. Added `packages/layers/cli/src/lib/routing-addressing-registry.ts` with the v0 route model, registry read/write helpers, record creation, and route resolution.
2. Added `packages/layers/cli/src/commands/routing.ts` with add, list, resolve, and explain command implementations.
3. Added `packages/layers/cli/src/commands/routing-register.ts` and registered `narada routing` in `main.ts`.
4. Added `routing` to grouped help under Intent & Intake Zones.
5. Added `docs/concepts/canonical-routing-addressing.md` and linked it from `AGENTS.md`.
6. Added focused tests in `packages/layers/cli/test/commands/routing.test.ts` covering add/list/resolve/explain, priority selection, alternatives, and inactive route exclusion.
7. Promoted inbox observation `env_5b9f0737-e907-495a-86dc-6f1c05410810` to this task.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/routing.test.ts test/commands/admission.test.ts test/commands/capability.test.ts` | Pass, 9/9 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| Bounded CLI smoke: `narada routing add/resolve/explain` in a temp cwd | Pass; active route selected and explained, no secret values stored |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes routing/addressing registry operators.
- [x] Address add creates a durable address record without storing secrets.
- [x] List and explain inspect routing state with bounded output.
- [x] Resolve returns selected active route and alternatives without mutation.
- [x] Registry model includes target kind/ref, authority locus, address kind/ref, transport, capability kind, priority, active status, fallback target, evidence ref, and metadata.
- [x] Documentation defines routing as target/address resolution distinct from inbox, outbox, and capability grants.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and pnpm verify pass.
