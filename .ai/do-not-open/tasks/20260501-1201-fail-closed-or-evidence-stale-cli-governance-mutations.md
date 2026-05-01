---
status: opened
---

# Fail closed or evidence stale CLI governance mutations

## Chapter

governance-embodiment-freshness

## Goal

Prevent governance mutations from silently continuing through stale CLI dist without an explicit accepted posture and durable evidence.

## Context

Inbox envelope env_c5efbc89-6760-4f9c-89eb-5159d1452ac4 reports that a narada-andrey task review command warned that CLI dist was stale relative to source, then continued and closed a task. That may be pragmatic, but governance mutation behavior can diverge from current source or doctrine if the embodiment is stale.

## Required Work

Update the Narada shim/governance command posture so governance mutations fail closed by default when CLI dist is stale, or require an explicit allow-stale-governance flag with a reason. If stale continuation is allowed, mutation evidence must record stale_dist=true, the stale source path(s), command identity, acceptance reason, and freshness posture. Read-only governance commands may remain available if they clearly report stale substrate posture. Workboard/preflight surfaces should expose stale governance posture compactly before review, close, claim, route, or other lifecycle mutations.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Governance mutations do not silently continue on stale CLI dist by default.
- [ ] Any allowed stale governance mutation requires an explicit reason and records stale_dist evidence.
- [ ] Mutation evidence records stale source paths, command identity, acceptance reason, and freshness posture.
- [ ] Read-only commands expose stale substrate posture without blocking safe inspection.
- [ ] Regression coverage proves stale CLI dist blocks or records accepted stale posture for review/close-style mutations.
