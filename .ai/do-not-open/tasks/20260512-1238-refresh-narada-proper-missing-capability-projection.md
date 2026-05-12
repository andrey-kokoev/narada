---
status: closed
closed_at: 2026-05-12T23:40:28.333Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Refresh Narada proper missing capability projection

## Goal

Update stale .narada capability projection files to match admitted first-slice task lifecycle and Windows-native package-set capabilities.

## Context

Doctrine review found .narada/capabilities/missing-capabilities.md still says task lifecycle machinery is missing and recommends reviewing the original handoff, while mcp-surfaces.json and self-adopted-windows-native-site-package-set.json show admitted/applied/verified first slices.

## Required Work

1. Inspect capability projection files. 2. Update missing-capabilities.md to distinguish remaining missing surfaces from admitted first-slice capabilities. 3. Preserve non-claims for richer task lifecycle, checkpoint/hydration, native shell policy, and source state import. 4. Verify the projection text is coherent with JSON capability records.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `.narada/capabilities/missing-capabilities.md` to name admitted first-slice Site task-lifecycle MCP tools, Windows-native Site package-set self-adoption artifacts, and cross-Site Operator Surface delivery capability.
- Replaced stale recommendation to review the original task-lifecycle handoff with current residual capability guidance.
- Preserved residuals for richer task lifecycle MCP, inbox MCP beyond local empty substrate descriptors, agent-context hydration/checkpoint history, native shell policy, capability/credential grants, operator-surface/PC-locus mutation, and source Site import/lift.

## Verification

- `Get-Content .narada\capabilities\mcp-surfaces.json -Raw | ConvertFrom-Json`
  - Result: JSON valid.
- `Get-Content .narada\capabilities\self-adopted-windows-native-site-package-set.json -Raw | ConvertFrom-Json`
  - Result: JSON valid.
- `Select-String -Path .narada\capabilities\missing-capabilities.md -Pattern "plan_init|admit_task|read_task|richer task lifecycle|source Site import"`
  - Result: expected admitted first-slice and residual terms present.

## Acceptance Criteria

- [x] missing-capabilities.md no longer contradicts current admitted capability records
- [x] Projection preserves exact residuals and non-claims
