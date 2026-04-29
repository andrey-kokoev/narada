---
status: closed
amended_by: architect
amended_at: 2026-04-29T17:25:34.583Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T17:31:50.406Z
criteria_proof_verification:
  state: unbound
  rationale: docs/concepts/operator-surface-action-posture.md defines primary_work_action, secondary_utility, diagnostic_tool, repair_recovery_action, dangerous_intrusive_platform_mutation, hidden_internal_primitive, and contextual_capability_projection; projection rules exclude diagnostic/intrusive/hidden controls from primary rows by default; test requirements mandate posture assertions; Toggle Primary Display versus Exchange Monitor Contents is the motivating example; links were added from operator-surface, contextual-capability-projection, coverage-audit, and AGENTS.
closed_at: 2026-04-29T17:32:03.333Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Classify operator surface actions by work diagnostic repair and projection posture

## Chapter

Capability Modeling and Operator Surface Semantics

## Goal

Define action surface classes and projection rules so valid diagnostic or intrusive tools do not appear as primary operator work actions merely because their mechanics are implemented and tested.

## Context

Inbox envelope env_e2bff944-56d8-411b-8630-1cda2c34c21f extends the closed contextual capability projection task 1078. It observes that Toggle Primary Display was a valid and tested Windows topology diagnostic, but placing it on the main YASB operator surface made it feel like a work-level action. The correct posture is to classify operator surface actions by work, utility, diagnostic, repair, dangerous/intrusive, hidden primitive, or contextual capability projection before deciding where they appear.

## Required Work

1. Read docs/concepts/contextual-capability-projection.md, docs/concepts/operator-surface.md, coverage audit doctrine, and task 1078 evidence. 2. Define operator surface action classes: primary work action, secondary utility, diagnostic tool, repair/recovery action, dangerous or intrusive platform mutation, hidden/internal primitive, and contextual projection of a canonical capability. 3. Define projection rules: diagnostic and intrusive tools should not appear in primary work-action rows by default; work-level contextual projections may. 4. Define warning/log/restoration expectations for diagnostic, repair, and intrusive tools. 5. Require tests to assert projection posture as well as mechanics, e.g. diagnostic Toggle Primary Display remains available but is absent from the main operator bar. 6. Use Toggle Primary Display versus Exchange Monitor Contents as motivating example. 7. Link guidance to operator-surface and coverage-audit docs. 8. Verify with focused docs guard or pnpm verify when safe.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:25:34.583Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Operator surface action classes are defined for primary work action secondary utility diagnostic tool repair recovery action dangerous intrusive platform mutation hidden internal primitive and contextual capability projection
- [x] Projection rules keep diagnostic and intrusive tools out of primary work-action surfaces by default
- [x] Tests or doctrine require projection posture assertions in addition to mechanics assertions
- [x] Toggle Primary Display versus Exchange Monitor Contents is used as motivating example
- [x] Source inbox envelope is routed and focused verification or pnpm verify passes
