---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T19:34:12.160Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T19:34:12.664Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Shape Site Telemetry Publication uber-chapter components

## Chapter

Site Telemetry Publication

## Goal

Name and structure the Site Telemetry Publication uber-chapter exposed by the Staccato-derived Cloudflare Site Registry work.

## Context

The Cloudflare hosted Site Registry chapter implemented useful Staccato-derived telemetry publication machinery, but the naming unease exposed that SiteRegistry is only a subchapter/read model. Narada needs a first design pass over the broader Site Telemetry Publication shape before live Cloudflare deployment or narrower registry naming hardens the wrong ontology.

## Required Work

1. Ground the shape in Site factorization, governed locus federation, Site pub/sub, User Site awareness registry, and the completed Cloudflare hosted Site Registry chapter. 2. Define the uber-chapter components, including publisher Site, owning Site, telemetry event contract, publication edge, hosted/local telemetry surface, projection store, SiteRegistry read model, remote candidate exchange, local publisher/puller, readiness/operations, and evidence/authority boundaries. 3. Distinguish what is canonical authority, projection, candidate state, capability, and deployment realization. 4. Produce a concise doctrine/design artifact suitable for future task chapter decomposition. 5. Record follow-on tasks or residuals without implementing new deployment machinery in this task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Created `docs/product/site-telemetry-publication.md` as the first design artifact for the uber-chapter. The artifact names Site Telemetry Publication as the generic shape behind the Staccato published surface and the Cloudflare hosted Site Registry slice, with SiteRegistry explicitly positioned as one read model/subchapter rather than the full structure.

Grounded the artifact in Site factorization, governed locus federation, Site pub/sub, User Site awareness registry, Site state projections, Canonical Inbox admission, and the completed Cloudflare hosted Site Registry readiness proof. No Cloudflare mutation or deployment work was performed.

Recorded a follow-on chapter map covering telemetry event contracts, publication edges/capability policy, telemetry surface realizations, SiteRegistry read model, remote candidate exchange, local publisher/puller tools, readiness/operations, and Inquiry/Doctrine feedback.

## Verification

- Read `docs/product/site-factorization.md`, `docs/concepts/governed-locus-federation.md`, `docs/product/site-pubsub-signal-exchange.md`, `docs/product/user-site-awareness-registry.md`, `docs/product/site-state-projections.md`, `docs/deployment/cloudflare-hosted-site-registry.md`, and `.ai/decisions/2026-05-16-cloudflare-hosted-site-registry-readiness.md`.
- Verified the artifact states SiteRegistry is a read model/subchapter, not the whole structure.
- Verified the artifact distinguishes authority, projection, candidate state, capability, and deployment realization.

## Acceptance Criteria

- [x] A Site Telemetry Publication design artifact exists and names the uber-chapter components.
- [x] The artifact explicitly positions SiteRegistry as a subchapter/read model rather than the whole structure.
- [x] Authority boundaries distinguish publishing, arrival, projection, candidate exchange, local admission, and live deployment.
- [x] Residuals/follow-on chapter map are recorded without claiming production readiness or mutating Cloudflare.
