# Narada Documentation

Root documentation organized by semantic layer.

## `concepts/`

Semantic and architecture-boundary concepts. These documents define how the system thinks about itself and how layers own boundaries.

- [`runtime-usc-boundary.md`](concepts/runtime-usc-boundary.md) — Runtime / USC / operator ownership boundary
- [`narada-agent-runtime-server.md`](concepts/narada-agent-runtime-server.md) — Vendor-neutral, stateful, machine-addressable Agent runtime server concept
- [`carrier-action-admission-boundary.md`](concepts/carrier-action-admission-boundary.md) — Governed conversion boundary from carrier action requests to authority-bearing Site decisions
- [`site-operating-loop.md`](concepts/site-operating-loop.md) — First-class Site object for continuous, scheduled, or triggered control loops
- [`governed-transduction.md`](concepts/governed-transduction.md) — Lineage-preserving transformation through governed admission boundaries
- [`system.md`](concepts/system.md) — System architecture and data flow overview
- [`mailbox-knowledge-model.md`](concepts/mailbox-knowledge-model.md) — Knowledge placement, proof vs knowledge, and playbook examples

## `product/`

User-facing product proofs, onboarding, operator loop, and runbooks. These are the documents an operator reads to understand what Narada does and how to use it.

- [`bootstrap-contract.md`](product/bootstrap-contract.md) — Canonical intent-to-operation bootstrap path
- [`first-time-operator-success-path.md`](product/first-time-operator-success-path.md) — First-time Operator path across Operation, Site, role, surface, intake, work-next, and readiness
- [`agent-reconstruction-specification.md`](product/agent-reconstruction-specification.md) — Agent-readable reconstruction path for blocked/internal environments
- [`site-bootstrap-contract.md`](product/site-bootstrap-contract.md) — Canonical Site first-run path (realization/runtime locus setup)
- [`site-qualification-policy.md`](product/site-qualification-policy.md) — Site-level role/principal qualification and requalification policy
- [`site-continuity-across-embodiments.md`](product/site-continuity-across-embodiments.md) — Same-Site continuity between local Windows and Cloudflare embodiments without authority transfer
- [`first-operation-proof.md`](product/first-operation-proof.md) — Canonical mailbox operation product proof
- [`operator-loop.md`](product/operator-loop.md) — Minimal operator rhythm for live operations
- [`runbook.md`](product/runbook.md) — Troubleshooting, setup, and lifecycle runbook
- [`live-graph-proof.md`](product/live-graph-proof.md) — Live Graph API proof stages and pass criteria
- [`live-trial-runbook.md`](product/live-trial-runbook.md) — Trial runbook, evidence format, and redaction policy
- [`operational-trial-setup-contract.md`](product/operational-trial-setup-contract.md) — Setup prerequisites and repo layout
- [`day-2-mailbox-hardening.md`](product/day-2-mailbox-hardening.md) — Day-2 mailbox failure modes and hardening
- [`mailbox-scenario-library.md`](product/mailbox-scenario-library.md) — Canonical conversational scenario basis

## `deployment/`

Site materialization and deployment target docs.

- [`cloudflare-site-materialization.md`](deployment/cloudflare-site-materialization.md) — Cloudflare Site materialization design
- [`systemd/`](deployment/systemd/) — systemd unit files and service configuration

## `diagrams/`

System diagrams and interaction diagrams.

*(Empty — diagrams are inline within concept and product docs.)*
