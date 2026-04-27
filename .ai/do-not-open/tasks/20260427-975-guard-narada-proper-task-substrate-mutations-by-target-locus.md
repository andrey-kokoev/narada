---
status: closed
criteria_proved_by: architect
criteria_proved_at: 2026-04-27T20:05:02.629Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-27T20:05:03.113Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Guard Narada proper task substrate mutations by target locus

## Chapter

Agent locus mutation discipline

## Goal

Prevent agents from using Narada proper task/inbox/chapter machinery as the work substrate for local Site or external repo work unless the operator explicitly names Narada proper as the target locus.

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

- [x] Add agent-facing doctrine requiring explicit target locus/path before mutating task
- [x] chapter
- [x] inbox
- [x] roster
- [x] or lifecycle state.
- [x] State that /home/andrey/src/narada defaults to read-only doctrine/tool inspection when the requested work belongs to a local Site
- [x] PC Site
- [x] client Site
- [x] data Site
- [x] ELT Site
- [x] or external repo.
- [x] Classify task allocate/create/claim/close/confirm
- [x] chapter init/close
- [x] inbox triage/promote/pending/task
- [x] and lifecycle import/export as mutating or authority-affecting surfaces for this rule.
- [x] Add a concise remediation rule: if accidental allocation or lifecycle mutation happens
- [x] inspect git status and repair only the local mutation residue with bounded evidence.
- [x] Document the rule in the execution contract or AGENTS-facing guidance without changing CLI flags or database schemas.
- [x] Handle source inbox envelope env_796f9b43-a2a9-4b20-ab4b-cb1ec3a7a501.
