---
status: opened
---

# Implement authority clone routing for Narada proper

## Chapter

cli-ergonomics

## Goal

Make Narada proper mutation commands resolve the declared authority clone before mutating, so Windows/WSL and multi-clone embodiments cannot silently split task, inbox, chapter, lifecycle, or publication state.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A configuration or discovery surface names the authority clone for Narada proper and records non-authority embodiments;Mutating task
- [ ] chapter
- [ ] inbox
- [ ] lifecycle
- [ ] roster
- [ ] evidence
- [ ] dispatch
- [ ] and publication surfaces check current clone against the authority clone before mutation;Non-authority invocation either forwards through a configured route or refuses with a precise command to use;Read-only inspection surfaces disclose current clone
- [ ] authority clone
- [ ] runtime origin
- [ ] and freshness posture where ambiguity is possible;narada doctor reports authority-clone routing posture and stale or divergent clone risk;Focused tests cover authority clone match
- [ ] non-authority refusal
- [ ] read-only disclosure
- [ ] and doctor reporting;pnpm verify passes
