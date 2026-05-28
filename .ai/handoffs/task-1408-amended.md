---
status: claimed
amended_by: narada.architect
amended_at: 2026-05-16T19:46:13.770Z
---

# Add receiving Site admission fixture for Remote Candidate Exchange

## Chapter

Site Telemetry Publication / Remote Candidate Exchange

## Goal

Prove remote candidate exchange through a receiving Site admission fixture.

## Context

Adds receiving Site admission fixture for Remote Candidate Exchange without
implementing full runtime admission.

## Required Work

1. Read the Remote Candidate Exchange contract from task 1406 and existing
   inbox/admission fixture patterns.
2. Add a receiving-Site fixture that demonstrates candidate arrival as inert
   input before local admission.
3. Include examples for accept, reject, defer, and duplicate replay handling,
   with evidence/provenance preserved.
4. Ensure the fixture does not imply remote publication mutates the receiving
   Site directly.
5. Run focused fixture tests or validation and record residual runtime
   admission work.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems.

## Execution Notes

- Amended by narada.architect at 2026-05-16T19:46:13.770Z: context, required
  work, dependencies.
- Added
  `docs/product/fixtures/remote-candidate-exchange/receiving-site-admission.json`.
- The fixture covers accepted, rejected, deferred/error, and duplicate replay
  cases for a receiving Site.
- Added a `site-inbox` fixture test proving candidate arrival starts as pending
  cloud state, local admission planning is descriptor-only, final receipts are
  based on local evidence, and duplicate replay does not reapply local
  admission.
- After rejected review reopened the task, aligned the receiving fixture with
  the generic task 1406 contract by using
  `narada.remote_candidate.message.v0` candidate entries and mapping them into
  the existing Site Inbox adapter shape inside the test.
- No runtime admission loop or external system was mutated.

## Verification

- `node -e "JSON.parse(require('fs').readFileSync('docs/product/fixtures/remote-candidate-exchange/receiving-site-admission.json','utf8')); console.log('remote candidate receiving fixture json ok')"` passed.
- `pnpm --filter @narada2/site-inbox test` passed: 10 tests.
- `pnpm --filter @narada2/site-inbox typecheck` passed.
- `pnpm --filter @narada2/site-inbox build` passed.
- Re-run after generic candidate fixture repair: fixture JSON parse passed,
  `pnpm --filter @narada2/site-inbox test` passed: 10 tests,
  `pnpm --filter @narada2/site-inbox typecheck` passed, and
  `pnpm --filter @narada2/site-inbox build` passed.

## Acceptance Criteria

- [x] Fixture proves pull/admit/finalize loop.
- [x] Admitted/rejected/error cases are covered.
- [x] Cloud receipt is not treated as local admission.
