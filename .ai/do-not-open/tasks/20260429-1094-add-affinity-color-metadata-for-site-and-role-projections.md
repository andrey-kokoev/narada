---
status: closed
amended_by: architect
amended_at: 2026-04-29T22:08:15.871Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:40:30.534Z
criteria_proof_verification:
  state: unbound
  rationale: Implemented optional operator-surface affinity color metadata for Site and role projections. Colors are admitted via sanctioned identity-add/agent-instantiate command flags, projected as structured label hints with ergonomic_projection_hint authority, documented with precedence and non-authority limits, and source envelope env_b7330900-7040-4e9f-bb5f-93475bf24f28 was already promoted to task:1094.
closed_at: 2026-04-29T23:40:48.729Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add affinity color metadata for Site and role projections

## Chapter

Operator Surface Semantic Projection Metadata

## Goal

Add optional affinity color metadata for Sites and roles so operator-surface labels can project stable semantic colors without making local UI taste authoritative.

## Context

Inbox envelope env_b7330900-7040-4e9f-bb5f-93475bf24f28 proposes affinity color metadata after User Site operator-surface labels began separating Site, agent name, and role. The local experiment renamed the builder surface to Bob while preserving role=builder, proving name and role are separate display dimensions. Without upstream fields, color choice becomes local UI taste instead of governed projection metadata.

## Required Work

1. Inspect Operator Surface, runtime identity binding, Site governance coordinates, delegated role taxonomy, and operator-surface identity/binding task 1091. 2. Define optional affinity_color or equivalent style facet for Site metadata and role metadata. 3. Define projection precedence: explicit projection style, Site line uses Site affinity color, role line uses role affinity color, agent/name line neutral unless separately admitted. 4. State that affinity colors are ergonomic recognition hints, not identity proof, authority boundaries, capability grants, or review evidence. 5. Update docs/schema/examples and any operator-surface identity metadata surface if appropriate. 6. Add tests or docs verification for colors on Site and role projection metadata. 7. Verify with focused checks and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T22:08:15.871Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Site metadata can declare optional affinity color for operator-surface projection
- [x] Role metadata can declare optional affinity color for operator-surface projection
- [x] Projection precedence and fallback rules are documented
- [x] Affinity colors are explicitly ergonomic projection hints not identity proof or authority boundaries
- [x] Source envelope env_b7330900-7040-4e9f-bb5f-93475bf24f28 is routed
