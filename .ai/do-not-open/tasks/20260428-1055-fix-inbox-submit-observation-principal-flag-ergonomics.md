---
status: closed
amended_by: architect
amended_at: 2026-04-28T23:44:12.230Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T00:58:30.828Z
criteria_proof_verification:
  state: unbound
  rationale: --authority-principal is accepted as an alias on inbox submit and submit-observation, records the same authority.principal as --principal, help/docs document the alias, focused inbox tests pass, and pnpm verify passed.
closed_at: 2026-04-29T00:58:35.930Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1055 — Fix inbox submit-observation principal flag ergonomics

## Chapter

cli-ergonomics

## Goal

Make the principal/authority-principal path discoverable and hard to misuse for `narada inbox submit-observation`, without changing the Canonical Inbox authority model.

## Context

Builder reported inbox envelope `env_cfaad632-5669-4615-8ecc-b7aa1d41e97b`: a sanctioned observation submission example used `--authority-principal`, but `narada inbox submit-observation` accepts only `--principal`. The mismatch caused an avoidable failed command. This is an ergonomics defect in a sanctioned intake surface.

## Required Work

1. Inspect `packages/layers/cli/src/commands/inbox-register.ts` and `packages/layers/cli/src/commands/inbox.ts` for submit and submit-observation principal option handling.
2. Choose the smallest compatible fix: accept `--authority-principal` as an alias for `--principal`, improve help/error text, or both.
3. Ensure low-level `inbox submit` and high-level `inbox submit-observation` remain semantically aligned.
4. Add focused CLI/command tests proving the alias works and that canonical output still records `authority.principal`.
5. Update docs/examples if any documented sanctioned command uses the wrong flag.
6. Run focused inbox tests and `pnpm verify`.

## Non-Goals

- Do not rename the underlying `principal` field.
- Do not change inbox authority levels.
- Do not add a new authority model.
- Do not weaken payload read-back confirmation.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `narada inbox submit-observation --authority-principal <id>` is accepted or produces a targeted corrective error with the exact canonical flag.
- [x] The accepted path records the same envelope authority principal as `--principal <id>`.
- [x] Help/docs/examples make the accepted principal flag unambiguous.
- [x] Focused tests cover the ergonomics path.
- [x] `pnpm verify` passes.
