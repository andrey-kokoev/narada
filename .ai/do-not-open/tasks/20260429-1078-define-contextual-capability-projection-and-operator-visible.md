---
status: opened
amended_by: architect
amended_at: 2026-04-29T17:09:48.800Z
---

# Define contextual capability projection and operator-visible invariant testing

## Chapter

Capability Modeling and Operator Surface Semantics

## Goal

Define doctrine and first machinery path so operator-facing controls are projections of canonical capability families and tests prove the operator-visible work invariant rather than only local command semantics.

## Context

Inbox envelope env_c594764b-1b14-4b74-a88a-2c45fcb08bca observes that Windows operator-surface display work decomposed buttons into locally coherent actions, Toggle Primary Display and Move Work Locus, but still missed the Operator's intended capability: exchanging visible window sets between monitors. The missing canonical capability was Monitor Content Transfer, with context-derived labels such as Exchange Monitor Contents for exactly two monitors. This is a Narada-wide capability modeling lesson: de-arbitrating local buttons is insufficient if the higher-level operator work invariant is unnamed.

## Required Work

1. Read docs/concepts/authority-revealing-inversion.md, inhabited evolution, operator surface, coverage audit zone task 1074, and relevant Site/operator-surface docs. 2. Define canonical capability family versus contextual operator projection. 3. Use Monitor Content Transfer as the motivating example: one monitor unavailable/refuse, two monitors Exchange Monitor Contents, three or more monitors Transfer Monitor Contents with explicit target selection. 4. Define operator-visible invariant testing: tests must prove the work outcome the Operator expects, not only local command semantics. 5. Add guidance for adjacent operator buttons: before adding multiple controls, check whether they are projections or modes of one higher-level capability. 6. Specify catalog/audit signals for over-lowered decomposition and overpromising labels. 7. Link doctrine to coverage audit and operator-surface semantics. 8. Verify with focused docs guard or pnpm verify when safe.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T17:09:48.800Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Canonical capability family versus contextual operator label projection is defined
- [ ] Monitor Content Transfer is used as motivating example with two-monitor Exchange Monitor Contents projection and 3 plus monitor target-selection projection
- [ ] Operator-visible invariant testing is required for operator surfaces
- [ ] not only command-local semantics
- [ ] Guidance prevents adjacent button decomposition from hiding a higher-level capability family
- [ ] Source inbox envelope is routed and focused docs verification or pnpm verify passes
