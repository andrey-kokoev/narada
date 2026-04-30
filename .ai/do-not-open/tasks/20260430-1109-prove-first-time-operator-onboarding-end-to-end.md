---
status: opened
---
# Prove first-time Operator onboarding end-to-end

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Add a regression proof that a new Operator can move from fresh Site posture to visible next governed work without direct file/SQLite manipulation.

## Context

The strongest ergonomics improvement must be protected by a fixture or integration-level proof. The proof should exercise the first-time path through sanctioned commands and compact output, not snapshots of internal files.

## Required Work

1. Build a fixture or integration test around a fresh temporary Site or mock Site realization.
2. Exercise the first-time front-door command, readiness classification, role instantiation output, inbox/work-next visibility, and bounded next-command guidance.
3. Prove no giant transcript output is emitted by default.
4. Prove no raw SQLite or task-file direct editing is required by the Operator path.
5. Document the verification command and any intentionally excluded external transport dependencies.

## Non-Goals

- Do not depend on live GitHub, Windows UI automation, or human clipboard state for the core regression.
- Do not make the test a slow full-suite gate unless necessary.
- Do not use brittle full-output snapshots for large command payloads.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A focused test or fixture proves the first-time Operator path from fresh Site posture to next governed work guidance.
- [ ] The proof asserts bounded output behavior and stable JSON fields for automation.
- [ ] The proof covers at least one missing-capability case with a precise unblock command.
- [ ] Documentation or execution notes name the exact verification command and observed result.
- [ ] The chapter can be closed using standard task evidence without relying on direct task-file edits or raw SQLite reads.
