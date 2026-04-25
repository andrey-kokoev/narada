---
status: closed
closed: 2026-04-24
created: 2026-04-24
reservation: 600-604
depends_on: [589]
---

# Testing Intent Zone And Verification Result Regime

## Goal

Define the canonical Narada zone for governed test execution so verification stops being a smeared mix of ad hoc shelling-out, chat summaries, and partial task notes.

## Context

Narada already has:

- verification suggestions,
- focused test posture,
- verification notes in tasks,
- some runtime telemetry,
- and command surfaces that run tests.

But the actual structure is still underdetermined.

The live ambiguity is not whether tests can be run. They already can.
The live ambiguity is:

- what the irreducible testing object is,
- whether a test run begins as a request, an operator command, or a shell process,
- what authority owns timeout, retry, environment, and telemetry,
- what durable artifact counts as the result,
- and whether verification truth lives in transient shell output or durable governed records.

This chapter exists to remove that ambiguity completely before implementation broadens.

## Chapter DAG

```text
600 Testing Intent Zone Boundary Contract
601 Test Run Request And Result Artifact Contract
602 Test Execution Regime Contract
603 Verification Run Persistence And Telemetry Contract
600, 601, 602, 603 ─→ 604 Testing Intent Zone Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 600 | Testing Intent Zone Boundary Contract | Define request -> governed execution -> result as distinct zones/crossings |
| 601 | Test Run Request And Result Artifact Contract | Define the durable request and result artifacts |
| 602 | Test Execution Regime Contract | Define timeout, environment, retry, admissibility, and focused/full policy |
| 603 | Verification Run Persistence And Telemetry Contract | Define SQLite persistence, timing, classification, and task linkage |
| 604 | Testing Intent Zone Closure | Close the chapter honestly and name the first implementation line |

## Closure Criteria

- [x] Testing request, execution, and result are explicit distinct objects
- [x] Timeout/environment/retry ownership is explicit
- [x] Verification result artifact is explicit
- [x] SQLite persistence and telemetry posture are explicit
- [x] Relationship to task verification evidence is explicit
- [x] First implementation line is named
- [x] Verification or bounded blockers are recorded


## Closure Summary

**Closed at:** 2026-04-24

All sub-tasks claimed, executed, and closed through the proper Narada CLI path:

| Task | CLI Path | Decision Artifact |
|------|----------|-------------------|
| 600 | `task claim 600` → `task report 600` → `task review 600` → `task close 600` | `.ai/decisions/20260424-600-testing-intent-zone-boundary-contract.md` |
| 601 | `task claim 601` → `task report 601` → `task review 601` → `task close 601` | `.ai/decisions/20260424-601-test-run-request-and-result-artifact-contract.md` |
| 602 | `task claim 602` → `task report 602` → `task review 602` → `task close 602` | `.ai/decisions/20260424-602-test-execution-regime-contract.md` |
| 603 | `task claim 603` → `task report 603` → `task review 603` → `task close 603` | `.ai/decisions/20260424-603-verification-run-persistence-and-telemetry-contract.md` |
| 604 | `task claim 604` → `task report 604` → `task review 604` → `task close 604` | `.ai/decisions/20260424-604-testing-intent-zone-closure.md` |

**First implementation line:** Task 605 — SQLite schema migration for `verification_requests` and `verification_results`, plus a `VerificationRegime` class integrating with existing test commands.
