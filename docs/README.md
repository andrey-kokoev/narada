# Narada Documentation

Root documentation organized by semantic layer.

## `concepts/`

Semantic and architecture-boundary concepts. These documents define how the system thinks about itself and how layers own boundaries.

- [`runtime-usc-boundary.md`](concepts/runtime-usc-boundary.md) — Runtime / USC / operator ownership boundary
- [`system.md`](concepts/system.md) — System architecture and data flow overview
- [`mailbox-knowledge-model.md`](concepts/mailbox-knowledge-model.md) — Knowledge placement, proof vs knowledge, and playbook examples

## `product/`

User-facing product proofs, onboarding, operator loop, and runbooks. These are the documents an operator reads to understand what Narada does and how to use it.

- [`bootstrap-contract.md`](product/bootstrap-contract.md) — Canonical intent-to-operation bootstrap path
- [`site-bootstrap-contract.md`](product/site-bootstrap-contract.md) — Canonical Site first-run path (runtime locus setup)
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
