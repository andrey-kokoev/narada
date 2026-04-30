---
status: opened
---

# Explain hidden open tasks in work-next

## Goal

Make task work-next explain why open tasks are unavailable to an agent instead of returning only 'No work available'.

## Context

Source inbox envelope env_b506be04-f0a0-46ff-93e4-af8152e57ffb reports CPY builder saw no work while task 2 was opened; likely suppression came from concurrency/review posture because the same builder had tasks 1 and 3 in_review.

## Required Work

1. Inventory task work-next/recommendation filtering paths that suppress opened tasks because of claimed, in_review, concurrency, affinity, or role policy. 2. Add a blocked_or_hidden_work section or equivalent compact explanation listing suppressed open tasks, the exact suppression reason, and the blocking owner/action where known. 3. Include suggested next command guidance such as wait for review, ask architect to review blocking tasks, or use an explicit override only if allowed. 4. Preserve concise default output: do not dump full task/inbox/workboard context when a bounded explanation is enough. 5. Add regression coverage for an agent with open work hidden by in_review/concurrency posture receiving an explanatory result instead of an empty no-work message.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] work-next output distinguishes true no-work from open-but-suppressed work.
- [ ] Suppressed tasks include task number/title and exact reason where available.
- [ ] If review or closure blocks new work, output names the responsible role or owner when known.
- [ ] Human and JSON output remain bounded and do not produce large transcripts by default.
- [ ] Focused tests cover the CPY-style open task hidden by in_review/concurrency scenario.
