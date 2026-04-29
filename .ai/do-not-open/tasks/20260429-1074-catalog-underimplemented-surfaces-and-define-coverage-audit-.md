---
status: opened
amended_by: architect
amended_at: 2026-04-29T16:34:24.975Z
---

# Catalog underimplemented surfaces and define coverage audit zone

## Chapter

Coverage Audit and Underimplementation Detection

## Goal

Sweep Narada code doctrine and task surfaces for underimplemented claims placeholders partial implementations and overpromising labels, then define the authority-zone machinery needed to keep such gaps visible without treating discovery as automatic repair.

## Context

This task follows repeated Operator pressure that some Narada and Site capabilities appear claimed or closed before real use proves the normal path. Recent examples include suspected swap-monitor/display-toggle tests feeling like the same prior nonsense, task closure semantics drifting between manual helper and automatic integrated capability, and CLI/doctrine surfaces whose labels imply more than implemented behavior. Narada needs a governed coverage-audit/underimplementation discovery zone: it should find and catalog gaps, not silently fix or overclaim them.

## Required Work

1. Define the Coverage Audit / Underimplementation Detection authority zone: inputs, discovery methods, catalog artifact, admission boundary, and non-repair rule. 2. Define catalog schema with fields for surface, claim source, claimed behavior, observed implemented behavior, missing behavior, evidence, impact, owner/locus, confidence, recommended action, and admission state. 3. Sweep code, docs, CLI help, task files, tests, and operator-facing labels for likely underimplementation signals: TODO/TBD placeholders, dry-run-only implementations, labels stronger than behavior, acceptance criteria checked without matching normal-path tests, docs claiming commands not implemented, and tests that prove only fixture/manual helpers. 4. Produce bounded artifact-first catalog output rather than dumping raw grep transcripts. 5. Define how catalog entries become inbox observations, CAPA candidates, follow-up tasks, or rejected/deferred entries through governed admission. 6. Include swap-monitor/display-toggle style capability claims as a motivating example category: normal-path behavior must be distinguished from manual helper or fixture proof. 7. Specify first implementation slice or CLI command if needed, without making the auditor auto-repair. 8. Verify with focused guards or pnpm verify when safe.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T16:34:24.975Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A catalog format is defined for underimplemented surfaces including claim source implemented behavior missing behavior impact evidence owner and recommended next action
- [ ] Sweep scope covers CLI commands docs concepts tasks tests and operator surfaces where labels or accepted criteria may overstate implementation
- [ ] Authority zone posture is defined for coverage audit discovery cataloging admission and repair so detection does not automatically mutate implementation
- [ ] Initial sweep command or manual protocol is specified with bounded output and artifact-first evidence
- [ ] Follow-up tasks can be generated from catalog entries through governed admission and focused verification or pnpm verify passes
