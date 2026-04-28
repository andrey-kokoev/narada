---
status: closed
amended_by: architect
amended_at: 2026-04-28T02:59:53.718Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T02:59:58.161Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, CLI smoke checks, and pnpm verify prove the capability consent registry acceptance criteria.
closed_at: 2026-04-28T03:00:00.288Z
closed_by: architect
governed_by: task_close:architect
closure_mode: operator_direct
---

# Add canonical capability consent registry v0

## Chapter

Capability Consent Registry

## Goal

Create a durable command-mediated registry that distinguishes configured intent, granted capability, credential reference, and executable authority without storing raw secrets.

## Context

The canonical inbox observation states that mailbox, outbox, GitHub, webhook, filesystem-write, and Site-to-Site operations need a single place to record what has been granted, by whom, to which Site or agent, with what scope, expiry, revocation path, and evidence. Existing charter capability envelopes and secret doctrine were not a durable registry.

## Required Work

1. Add a site-local capability/consent registry store that persists grants without secret values.
2. Add CLI surfaces to grant, list, show/explain, and revoke capabilities.
3. Model principal, Site, agent, transport/capability kind, scope, allowed actions, denied actions, credential reference, expiry, evidence reference, status, grantor, and revocation metadata.
4. Make list/explain outputs bounded and human/JSON friendly.
5. Document the registry doctrine and how execution surfaces should consult it before external mutation.
6. Promote the inbox observation to this work.
7. Add focused tests and pass verification.

## Non-Goals

- Do not store raw credentials or secret values.
- Do not retrofit every executor in this task.
- Do not implement remote policy distribution.
- Do not touch unrelated untracked directories.

## Execution Notes

1. Added `packages/layers/cli/src/lib/capability-consent-registry.ts` with the v0 durable grant model, registry read/write helpers, credential-reference validation, grant creation, CSV/scope parsing, and effective-status derivation.
2. Added `packages/layers/cli/src/commands/capability.ts` with grant, list, explain, and revoke command implementations.
3. Added `packages/layers/cli/src/commands/capability-register.ts` and registered `narada capability` in `main.ts`.
4. Added `capability` to grouped help under Intent & Intake Zones because it governs whether intent has executable authority.
5. Added `docs/concepts/canonical-capability-consent-registry.md` and linked it from `AGENTS.md`.
6. Added focused tests in `packages/layers/cli/test/commands/capability.test.ts` covering grant/list/explain/revoke, raw credential rejection, and expired-grant behavior.
7. Promoted inbox observation `env_d198e7f1-f920-48d0-8566-1ab23cf98577` to this task.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @narada2/cli exec vitest run test/commands/capability.test.ts` | Pass, 3/3 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |
| Bounded CLI smoke: `narada capability grant/list/explain/revoke` in a temp cwd | Pass; grant active, explain admissible, revoke succeeds, no secret values stored |
| `pnpm verify` | Pass, all 8 steps |

## Acceptance Criteria

- [x] CLI exposes capability registry operators.
- [x] Grant creates a durable capability record without raw secret values.
- [x] List and explain inspect registry state with bounded output.
- [x] Revoke transitions a grant to revoked with revocation evidence.
- [x] Registry model includes principal, site, agent, capability kind, scope, allowed actions, denied actions, credential reference, expiry, evidence reference, status, grantor, and revocation metadata.
- [x] Documentation defines the registry as consent/capability authority, not a secret store.
- [x] Inbox observation is promoted to this work.
- [x] Focused tests and pnpm verify pass.
