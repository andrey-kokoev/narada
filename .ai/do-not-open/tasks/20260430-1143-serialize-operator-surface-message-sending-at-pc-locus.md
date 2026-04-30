---
status: claimed
---

# Serialize operator-surface message sending at PC locus

## Chapter

Canonical Inbox Promotions

## Goal

Ensure operator-surface message sends cannot overlap focus, clipboard, input, or submit critical sections; route Site-level requests through a PC-locus serialization boundary.

## Context

Source inbox envelope: env_22404261-c4a8-4abb-897a-1ea6a625919a

Source: agent_report:narada-cpy.architect-chat

Envelope kind: observation

Summary: If more than one operator surface attempts to send an operator-surface message at the same time, overlapping focus/clipboard/type/submit windows can interfere with each other. The current bridge has a timing-sensitive delivery phase, including stabilization waits, so concurrent senders should not run independently.

Proposal:
- Introduce a central PC-level operator-surface send intent queue owned by the PC runtime locus.
- Treat each send as an intent that is admitted, serialized, executed, and evidenced by the PC-level queue worker.
- Reject or queue overlapping sends rather than allowing concurrent Send-OperatorSurfaceInput.ps1 executions.
- Use a lock/lease with timeout and stale-lock recovery for the active input bridge critical section.
- Expose queue status and current active send in operator-surface health/doctor output.
- Keep Site-level agents as requesters; the PC Site remains authority over focus/clipboard/input effects.

## Required Work

0. Source summary: If more than one operator surface attempts to send an operator-surface message at the same time, overlapping focus/clipboard/type/submit windows can interfere with each other. The current bridge has a timing-sensitive delivery phase, including stabilization waits, so concurrent senders should not run independently.
1. Read source inbox envelope env_22404261-c4a8-4abb-897a-1ea6a625919a and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Concurrent operator-surface send requests cannot execute focus/clipboard/type/submit phases simultaneously.
- [ ] Overlapping sends are queued, deferred, or fail closed with repair guidance.
- [ ] Evidence records requester, target identity, ordering, start/end time, and queued/deferred/rejected outcome.
- [ ] Stale active sends can be recovered without leaving the bridge permanently blocked.
