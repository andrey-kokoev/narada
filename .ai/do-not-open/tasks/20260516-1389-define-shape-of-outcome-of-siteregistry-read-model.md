---
status: closed
depends_on: [1385]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T19:39:49.883Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T19:39:50.482Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Define shape of outcome of SiteRegistry Read Model

## Chapter

Site Telemetry Publication

## Goal

Define the desired outcome shape for SiteRegistry as a read model within Site Telemetry Publication.

## Context

SiteRegistry caused naming unease because it was treated like the whole structure. This task defines it as a bounded read model first.

## Required Work

1. Define SiteRegistry read model outcome artifact. 2. Specify known Site identity, relation posture, endpoints, freshness, health, capabilities, provenance, and authority limits. 3. Distinguish read model from a possible future SiteRegistry authority substrate. 4. Record residual implementation tasks.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Added `docs/product/site-telemetry-publication-outcome-shapes.md` section `SiteRegistry Read Model`. It defines `site_registry_read_model.v0`, required fields for known Site relation posture and freshness, and explicitly keeps SiteRegistry as a read model unless a separate authority substrate is admitted.

## Verification

- Verified the artifact positions SiteRegistry as read model/subchapter.
- Verified it names fields, authority limits, and residuals for future authority-substrate consideration.

## Acceptance Criteria

- [x] Outcome shape positions SiteRegistry as read model/subchapter.
- [x] Outcome names fields and authority limits.
- [x] Residual implementation tasks are identified without implementing them.
