---
status: closed
depends_on: [1385]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T19:39:41.703Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T19:39:42.259Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Define shape of outcome of Publication Edge And Capability Policy

## Chapter

Site Telemetry Publication

## Goal

Define the desired outcome shape for publication edges and capability policy.

## Context

Site Telemetry Publication needs an explicit publisher/surface/owner relation and capability posture so URL names and tokens do not carry hidden authority.

## Required Work

1. Define publication edge outcome artifacts. 2. Specify publisher Site, owning Site, telemetry surface, accepted families, capability refs, secret posture, trust posture, and revocation posture. 3. Distinguish influence/capability from mutation authority. 4. Record residual implementation tasks.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Added `docs/product/site-telemetry-publication-outcome-shapes.md` section `Publication Edge And Capability Policy`. It defines `site_telemetry_publication_edge.v0`, publisher/owner/surface relation fields, accepted families, capability refs, secret resolver policy, trust, revocation, rotation, and authority limits.

## Verification

- Verified the artifact defines publication-edge fields and lifecycle posture.
- Verified it distinguishes capability refs and secret resolver posture from mutation authority.

## Acceptance Criteria

- [x] Outcome shape defines publication-edge fields and lifecycle.
- [x] Outcome distinguishes capability, secret, and authority posture.
- [x] Residual implementation tasks are identified without implementing them.
