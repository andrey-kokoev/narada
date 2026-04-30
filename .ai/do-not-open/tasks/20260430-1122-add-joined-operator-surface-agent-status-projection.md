---
status: closed
amended_by: architect
amended_at: 2026-04-30T13:58:15.516Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:26:13.281Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, and live status readback prove joined status fields, concise human lines, unbound/stale/working states, exact bind commands, and no authority replacement.
closed_at: 2026-04-30T14:26:22.731Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add joined operator-surface agent status projection

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1122-1123-operator-surface-workstate-ergonomics.md

## Goal

Expose a single sanctioned status surface that joins admitted identity, role, runtime binding, operator-surface reachability, roster/work status, current task, last activity, and next action.

## Context

Architect can partially reconstruct status through task roster, workboard, and operator-surface bindings, but the joined answer is not available as one canonical projection. This causes uncertainty about whether an operator-surface based intelligence is idle, working, unbound, stale, or unreachable.

## Required Work

1. Inventory current identity, binding, roster, lifecycle, workboard, and input-alias sources without making any one projection authoritative by convenience.
2. Add a sanctioned CLI surface such as `narada operator-surface status` or `narada agent status` with human and JSON output.
3. For each admitted role/identity, report role, canonical identity, runtime-locus binding posture, send/addressability posture, roster status, current task, task lifecycle status, last known activity, and exact next command when blocked.
4. Make stale, unbound, unknown-recipient, working, idle, and deferred states distinct in the output.
5. Add focused tests/fixtures for working Builder, admitted-but-unbound Observer, idle Architect, and missing runtime-locus cases.

## Non-Goals

- Do not grant Observer build, review, claim, close, or mutation authority.
- Do not make volatile window handles authoritative in Narada proper.
- Do not replace roster/lifecycle authority; this task creates a projection over existing authorities.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] One command answers whether Architect, Builder, or Observer is idle, working, unreachable, unbound, or stale
- [x] JSON output includes identity_id, role, runtime_locus, binding_status, addressability_status, work_status, current_task, lifecycle_status, last_activity_at, and next_command fields where applicable
- [x] Human output is concise and does not require reading roster, bindings, and workboard separately
- [x] Missing runtime-locus binding returns an exact bind command rather than a generic failure
- [x] Tests cover working, idle, admitted-unbound, stale, and missing-locus states
