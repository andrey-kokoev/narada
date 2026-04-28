---
status: closed
amended_by: architect
amended_at: 2026-04-28T21:47:08.527Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T21:52:14.295Z
criteria_proof_verification:
  state: unbound
  rationale: All acceptance criteria satisfied: task report parse errors are actionable, task close help/runtime guidance names modes and review auto-closure, bounded Vitest fallback is documented, disposition vocabulary is explicit, and verification passed.
closed_at: 2026-04-28T21:52:26.008Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Improve task workflow ergonomics from withdrawal arc learnings

## Chapter

task-ergonomics

## Goal

Reduce repeated operator/agent friction discovered during the withdrawal semantics arc: task report verification JSON affordance, task close mode guidance after review auto-closure, package test filter confusion, and lifecycle vocabulary around withdraw/cancel/archive/supersede/compensate.

## Context

The previous arc exposed repeated workflow friction: task report --verification rejects prose without showing the expected JSON shape; task review can auto-close while task close separately requires --mode; package test scripts may ignore or broaden file filters; and withdrawal disposition terms need stable operator vocabulary.

## Required Work

1. Inspect task report, task close, test documentation, and withdrawal/outbox doctrine surfaces. 2. Add actionable verification JSON parse guidance to task report errors. 3. Improve task close mode/help guidance so agents understand review auto-closure and valid close modes. 4. Document bounded direct vitest invocation for package-scoped verification when package scripts overrun filters. 5. Add or tighten lifecycle vocabulary for withdraw, cancel, archive, supersede, and compensate without renaming existing statuses. 6. Add focused tests where CLI behavior changes. 7. Verify, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not rename existing statuses. Do not replace Vitest in this task. Do not implement new withdrawal commands. Do not weaken task evidence admission or review gates.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T21:47:08.527Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] task report verification parse errors show an actionable JSON example
- [x] task close missing mode errors or help explain valid modes and review auto-closure posture
- [x] developer/operator docs state bounded direct vitest invocation when package scripts overrun filters
- [x] doctrine or CLI docs distinguish withdraw
- [x] cancel
- [x] archive
- [x] supersede
- [x] and compensate without renaming existing statuses
- [x] Focused verification and pnpm verify pass
