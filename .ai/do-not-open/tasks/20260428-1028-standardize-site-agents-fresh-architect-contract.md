---
status: closed
amended_by: architect
amended_at: 2026-04-28T15:29:52.588Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T15:29:58.450Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented and verified generated Site AGENTS fresh architect contract: shared generator, client/project/generic Site init wiring, docs, focused tests 23/23, CLI typecheck pass, CLI build pass.
closed_at: 2026-04-28T15:30:04.190Z
closed_by: architect
governed_by: task_close:architect
closure_mode: peer_reviewed
---

# Task 1028: Standardize Site AGENTS fresh architect contract

## Goal

Make generated Site `AGENTS.md` the stable fresh architect orientation contract across Site bootstrap paths.

## Context

<!-- Context placeholder -->

## Required Work

1. Add a reusable Site AGENTS contract generator.
2. Include standing identity: `architect`, `Operator`, and Narada law.
3. Include target locus, Site kind, authority locus, and sync posture where known.
4. Include standing rules for governed crossings, no direct state edits, and intelligence-authority separation.
5. Wire client and project Site bootstrap to the shared generator.
6. Wire generic `sites init` for Linux, macOS, and Windows Site creation to write AGENTS.md.
7. Update documentation to identify generated AGENTS.md as the stable fresh architect contract.
8. Add focused tests.

## Non-Goals

- Do not retroactively rewrite existing Sites.
- Do not change Site authority semantics.
- Do not add an AGENTS regeneration/upgrade command in this task.
- Do not create derivative task-status files.

## Execution Notes

1. Added `siteAgentsContract()` in `sites.ts`.
2. The generated contract states `You are architect`, `The human is Operator`, and `This Site is governed by Narada law`.
3. The generated contract records `workspace_root` when present, `site_root`, `site_kind`, `authority_locus`, and `sync_posture`.
4. The generated contract includes standing rules for target-locus discipline, governed crossings, canonical command surfaces, intelligence-authority separation, residual handling, and canonical inbox intake.
5. Replaced duplicated client/project AGENTS inline strings with the shared generator.
6. Added AGENTS generation to generic Windows, macOS, and Linux `sites init` mutation paths.
7. Updated `docs/product/site-bootstrap-contract.md` to describe generated AGENTS.md as the stable way to orient fresh architect agents.
8. Updated client, project, and generic Site init tests to assert the identity contract.

## Verification

| Command | Result |
|---------|--------|
| `pnpm --filter @narada2/cli exec vitest run test/commands/sites-client-bootstrap.test.ts test/commands/sites-project-bootstrap.test.ts test/commands/sites-init.test.ts` | Pass: 23/23 tests |
| `pnpm --filter @narada2/cli typecheck` | Pass |
| `pnpm --filter @narada2/cli build` | Pass |

## Acceptance Criteria

- [x] Reusable AGENTS contract generator includes architect/Operator/Narada-law identity.
- [x] Client bootstrap uses the shared contract.
- [x] Project bootstrap uses the shared contract.
- [x] Generic `sites init` writes AGENTS.md for Linux Sites.
- [x] Generic `sites init` writes AGENTS.md for macOS Sites.
- [x] Generic `sites init` writes AGENTS.md for Windows Sites.
- [x] Site bootstrap docs describe AGENTS.md as the stable fresh architect contract.
- [x] Focused bootstrap tests pass.
- [x] CLI typecheck passes.
- [x] CLI build passes.
