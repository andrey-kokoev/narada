---
status: closed
depends_on: [1420]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:11:12.732Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by docs/product/site-telemetry-first-live-slice.v0.md plus focused site-registry-cloudflare and site-config test runs.
closed_at: 2026-05-16T22:11:22.554Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define first live-slice authority and admission boundary

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Define the first live Site Telemetry Publication slice in authority terms before infrastructure work proceeds.

## Context

The deployable surface must not collapse Site Telemetry Publication into SiteRegistry or Cloudflare. This task names what the first live slice admits, projects, refuses, and never owns.

## Required Work

1. Read the Site Telemetry Publication and Readiness docs plus the Cloudflare package README and worker tests.
2. Define the first live slice as a publication receiver, remote candidate receiver, and SiteRegistry read projection for a named owning Site/scope.
3. Specify which event families and remote candidate payloads are admissible for v0, which routes are health/read-only, and which routes require capability references.
4. State explicitly that cloud receipt, D1/KV projection, and SiteRegistry reads are not local Site admission, task authority, lineage authority, or Site truth.
5. Produce a bounded design/evidence artifact that later deployment tasks can cite.

## Non-Goals

- Do not create Cloudflare resources.
- Do not deploy or mutate live infrastructure.
- Do not mutate local Site config.
- Do not broaden scope to generic federation or all future Sites.

## Execution Notes

Created `docs/product/site-telemetry-first-live-slice.v0.md`.

The artifact defines the first live slice for Narada proper as projection-only Site Telemetry Publication: event receiver, remote candidate receiver, and SiteRegistry read projection. It names `narada-proper` as owning Site for the v0 slice, preserves package/binding compatibility names, lists accepted event families, lists remote candidate payloads, identifies protected routes, records D1/KV projection posture, and states authority limits for later deployment tasks.

No Cloudflare resource creation, live deployment, Site config mutation, raw secret recording, commit, or push was performed.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed; 4 test files, 37 tests.
- `pnpm --filter @narada2/site-config test` passed; 1 test file, 22 tests.
- `rg -n "SiteRegistry|cloud_receipt_is_not_local_admission|d1_kv_projection_is_not_site_truth|narada-proper-site-telemetry-publication-v0|NARADA_SITE_REGISTRY" docs/product/site-telemetry-first-live-slice.v0.md` passed; artifact contains the slice id, compatibility naming posture, SiteRegistry read-model references, and authority limits.

## Acceptance Criteria

- [x] A first-live-slice boundary artifact exists.
- [x] The artifact separates Site Telemetry Publication, SiteRegistry read model, and Cloudflare realization.
- [x] The artifact defines v0 admitted payload families, protected routes, authority limits, and refusal posture.
- [x] Later deploy tasks can cite the artifact as their semantic gate.
