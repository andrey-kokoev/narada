---
status: closed
depends_on: [1389]
amended_by: narada.builder
amended_at: 2026-05-16T20:09:39.399Z
closed_at: 2026-05-16T20:27:35.334Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify SiteRegistry read model schema

## Chapter

Site Telemetry Publication / SiteRegistry Read Model

## Goal

Specify the SiteRegistry read model derived from telemetry events without making
the registry a source-Site authority substrate.

## Context

Builds on the Site Telemetry Event Contract, Publication Edge policy, and
Telemetry Surface realization contract. This task is docs/schema/fixture work
only.

## Required Work

1. Read SiteRegistry sections in Site Telemetry Publication docs and related
   User Site awareness registry doctrine.
2. Specify a read model with Site identity, advertised surfaces, freshness,
   relation posture, capabilities summary, provenance, and conflicts.
3. Define derivation rules from telemetry event families and stale/conflict
   representation without mutating source Site authority.
4. Define fixture inputs/outputs for at least one repo Site and one User Site
   with multiple telemetry surfaces.
5. Record residual implementation tasks separately.

## Non-Goals

- Do not implement a SiteRegistry authority substrate.
- Do not add runtime mutation commands or lifecycle rows for registry
  membership.
- Do not mutate live external systems.

## Execution Notes

- Added `docs/product/site-registry-read-model.v0.md`.
- Added input and expected-output fixtures under
  `docs/product/fixtures/site-registry-read-model/`.
- Updated the Site Telemetry Publication outcome-shapes doc to link the
  read-model contract and keep future authority substrate criteria separate.
- The schema explicitly preserves read-model authority limits and represents
  stale/conflicting telemetry as projection data.

## Verification

- `node -e "const fs=require('fs'); const dir='docs/product/fixtures/site-registry-read-model'; for (const f of fs.readdirSync(dir)) JSON.parse(fs.readFileSync(dir+'/'+f,'utf8')); console.log('site registry read model fixtures json ok')"` passed.

## Acceptance Criteria

- [x] Read model schema specified.
- [x] Fields and authority limits explicit.
- [x] Future authority-substrate criteria recorded separately.
