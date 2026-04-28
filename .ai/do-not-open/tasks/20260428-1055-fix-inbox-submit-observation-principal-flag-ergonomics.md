---
status: opened
amended_by: architect
amended_at: 2026-04-28T23:44:12.230Z
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

- [ ] `narada inbox submit-observation --authority-principal <id>` is accepted or produces a targeted corrective error with the exact canonical flag.
- [ ] The accepted path records the same envelope authority principal as `--principal <id>`.
- [ ] Help/docs/examples make the accepted principal flag unambiguous.
- [ ] Focused tests cover the ergonomics path.
- [ ] `pnpm verify` passes.
