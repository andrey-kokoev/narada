---
status: opened
---

# Align first-time-operator doc with code vocabulary and naming conventions

## Goal

Fix doc-vs-code incoherencies in first-time-operator-success-path.md

## Context

first-time-user-flow incoherency sweep, slice 1. The doc's role-progression block used stage names that exist nowhere in code; agent naming conventions (personae callsigns, sonar bare names, mcp-surfaces WorkspaceRoot intent, roster v1 superseded) were undocumented.

## Required Work

Replace the role-progression block with the persisted onboarding vocabulary (not_started -> launch_requested -> first_use_verified, role_expansion available/approved/materialized); add agent-naming and registry-convention notes.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Progression block matches narada.user_site_onboarding_state.v1 vocabulary
- [ ] Naming conventions documented
