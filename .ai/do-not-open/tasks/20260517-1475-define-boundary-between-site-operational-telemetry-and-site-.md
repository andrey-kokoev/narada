---
status: confirmed
depends_on: [1433, 1463, 1474]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:02:18.837Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779051734748_j2yyla
closed_at: 2026-05-17T21:02:34.175Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Define boundary between Site operational telemetry and Site Registry authority

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Create a decision-complete boundary artifact that separates Site-level telemetry, Site Registry relation authority, registry operational telemetry, and Site communication candidates.

## Context

The current hosted Cloudflare surface and docs use Site Telemetry Publication, SiteRegistry read model, relation lifecycle, and communication routes in one conceptual bundle. That causes agents to reach for `site-telemetry publish` when they actually need a Site Registry relation transition.

## Required Work

1. Define four named concerns: Site Operational Telemetry, Site Registry, Registry Operational Telemetry, and Site Communication Candidate Exchange.
2. For each concern, state owner, authority boundary, accepted inputs, protected writes, read UI, write UI, and MCP/CLI command family.
3. State explicitly that package reuse or shared Cloudflare deployment does not collapse service concepts.
4. Record which current docs/packages/routes belong to which concern.
5. Name the immediate gap exposed by narada-andrey: local relation admission needs a Site Registry relation publication command, not Site telemetry publication.

## Non-Goals

- Do not physically split the Cloudflare package in this task.
- Do not rename deployed routes or secrets.
- Do not publish narada-andrey to the registry.

## Execution Notes

- Added `docs/product/site-telemetry-registry-boundary.v0.md`.
- Defined four concerns: Site Operational Telemetry, Site Registry, Registry Operational Telemetry, and Site Communication Candidate Exchange.
- For each concern, recorded owner, authority boundary, accepted inputs, protected writes, read UI, write UI, and CLI/MCP command family.
- Added non-collapse rules for shared package, Cloudflare Worker, domain, route, D1, and KV reuse.
- Classified current docs/packages/routes by concern.
- Classified the narada-andrey gap as missing Site Registry relation publication command/planner, not Site telemetry publication or Site communication send.

## Verification

- `rg -n "Site Operational Telemetry|Site Registry|Registry Operational Telemetry|Site Communication Candidate Exchange|narada-andrey|site-telemetry publish|site-registry relation" docs/product/site-telemetry-registry-boundary.v0.md` confirmed all required concern names and the narada-andrey gap classification.
- `git diff --check -- docs/product/site-telemetry-registry-boundary.v0.md .ai/do-not-open/tasks/20260517-1475-define-boundary-between-site-operational-telemetry-and-site-.md` passed.

## Acceptance Criteria

- [x] Boundary artifact exists and names all four concerns.
- [x] Site telemetry and Site Registry writes are no longer semantically conflated.
- [x] narada-andrey relation publication gap is explicitly classified.
