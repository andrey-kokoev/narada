---
status: closed
amended_by: architect
amended_at: 2026-04-28T21:41:51.983Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T21:43:25.420Z
criteria_proof_verification:
  state: unbound
  rationale: All criteria satisfied: Governed Crossing, SEMANTICS, and Canonical Outbox now explicitly encode withdrawal as governed disposition rather than deletion; target authority owns disposition; verification passed.
closed_at: 2026-04-28T21:43:37.942Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Crystallize intent withdrawal semantics

## Chapter

governed-crossing

## Goal

Make Narada's canonical answer explicit: withdrawal after submission is not deletion; it is a new governed crossing requesting disposition by the target authority, with lifecycle-dependent outcomes before admission, after intent admission, after execution attempt, and after confirmation.

## Context

The Operator asked for the canonical answer to whether an intent submitted into an authority zone can be withdrawn. Existing doctrine implies the answer through Governed Crossing, Intent, Outbox, cancellation, supersession, and compensation, but the answer is not crystallized as an explicit rule.

## Required Work

1. Add a canonical withdrawal rule to Governed Crossing. 2. Add phase-specific semantics to SEMANTICS for pre-admission, admitted Effect Intent, Effect Attempt, and post-confirmation cases. 3. Align Canonical Outbox language so archive, supersede, and cancellation are dispositions of a submitted outbound intent rather than deletion. 4. Preserve target-authority ownership of the disposition. 5. Verify docs and repository coherence, report, prove criteria, review, close, commit, push.

## Non-Goals

Do not implement new CLI commands in this task. Do not rename existing intent or outbox statuses. Do not treat withdrawal as deleting durable history. Do not grant the submitting source authority over target-zone disposition.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T21:41:51.983Z: context, required work, non-goals

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Governed Crossing doctrine states that withdrawal is a governed crossing
- [x] not erasure
- [x] Intent/Act semantics distinguish pre-admission withdrawal
- [x] admitted intent cancellation or supersession
- [x] execution-time cancellation
- [x] and post-confirmation compensating intent
- [x] Canonical Outbox doctrine aligns archived/superseded/cancelled disposition language with withdrawal semantics
- [x] Docs preserve target authority ownership of disposition
- [x] Focused documentation verification and pnpm verify pass
