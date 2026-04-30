---
status: opened
amended_by: architect
amended_at: 2026-04-30T02:55:48.590Z
---

# Expose operator-surface send as canonical CLI front door

## Chapter

.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Provide a sanctioned Narada CLI command for sending short operator-surface input to an admitted role identity, so agents and Operators do not discover or invoke User Site carrier scripts by path.

## Context

Operator-surface input currently works through User Site PowerShell carrier scripts such as Send-Os.ps1. During architect work, the path had to be rediscovered with filesystem search and invoked with a Windows absolute path. That is an ergonomics and authority-routing gap: Narada proper knows the capability announcement and operator-surface identities, but does not expose a canonical send front door.

## Required Work

1. Inventory the existing operator-surface input carrier scripts, alias registry, identity registry, runtime binding projection, and capability announcement records.
2. Add a Narada CLI front door for short operator-surface input that delegates to admitted carrier capabilities instead of reimplementing window automation.
3. Make dry-run validate the same target identity, live binding, transport availability, and submit strategy that real send would use.
4. Keep output bounded: identity, target locus, resolved binding, submit posture, event artifact, and exact unblock command on failure.
5. Add focused tests for command shape, dry-run planning, missing binding, ambiguous binding, missing transport, and secret-like text refusal.
6. Document the command in operator-surface help/onboarding surfaces so Architect can nudge Builder without script-path discovery.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-30T02:55:48.590Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] narada operator-surface send or equivalent exists and routes through the admitted operator-surface capability model
- [ ] The command resolves aliases/identities through the declared User Site or runtime locus instead of hardcoding Windows paths
- [ ] Dry-run validates the live binding and submit strategy that would be used for real submission
- [ ] Real send emits bounded evidence including identity, resolved runtime handle, submit strategy, event artifact, and status
- [ ] Failure output gives exact unblock commands for no binding, ambiguous binding, missing transport, stale binding, and refused secret-like text
- [ ] Focused tests cover dry-run, successful planned send shape, missing binding, ambiguous binding, and missing transport cases
