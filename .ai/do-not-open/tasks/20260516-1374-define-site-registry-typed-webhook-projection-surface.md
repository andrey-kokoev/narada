---
status: closed
closed_at: 2026-05-16T03:22:53.611Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define Site registry typed webhook projection surface

## Chapter

Site registry and webhook projection surface

## Goal

Define a reusable Narada package/product contract for a Site Registry-backed typed webhook receiver, projection state, and human peek UI surface, lifting the Staccato Cloudflare Worker communication pattern without making the projection authority.

## Context

Operator identified that the Staccato Cloudflare Worker is more than telemetry or inbox polling: it organizes typed webhook communications, derives projection state from accepted events, and exposes a human peek UI/API. Narada already has Site registry awareness, Site config inbox endpoints, Site state projections, and the Staccato inhabited precedent, but lacks a first-class reusable Site Registry + typed event receiver + projection + peek surface contract. This task should lift the pattern at the right abstraction: a collection of Sites is represented by a registry/projection, typed Site events arrive through a guarded receiver, read models are derived from events, and UI/API surfaces are explicit peeks rather than authority.

## Required Work

1. Inspect existing Site Registry/Site config surfaces in Narada proper, including @narada2/site-config, User Site known_sites posture, Staccato .narada/config.json, and docs for Site state projections/operator console registry. 2. Define a Site Registry projection contract that represents a collection of Sites with site_id, locus/substrate, registry status, relation/freshness/health, event endpoint posture, inbox/message endpoint posture, capabilities/limits, and authority disclaimers. 3. Define a typed Site event envelope/receiver contract suitable for a Cloudflare Worker or HTTP webhook, including source_site_id, subject_site_id/target_site_id, event family/type, observed_at, sent_at, idempotency/event id, capability/auth posture, payload bounds, and rejection reasons. 4. Define projection state/read-model contracts derived from events, including latest Site health, inbox availability, agent/session posture, task/work posture, attention/report summaries, stale/missing/failing states, and event provenance. 5. Define a human peek UI/API posture that reads projection state and never becomes Site authority, task lifecycle authority, identity authority, capability authority, or inbox admission authority. 6. Identify what can be lifted from Staccato’s Worker implementation and what must remain Site-specific. 7. Add focused docs/types/tests or fixtures in the appropriate package(s) proving registry-addressed events, projection derivation, unknown/unauthorized Site refusal, stale/fresh projection classification, and non-authority UI/read API posture.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Inspected `@narada2/site-config`, Site state projection/operator console registry docs, and the Staccato Cloudflare published-surface runbook/Worker posture. The referenced Staccato `.narada/config.json` was not present at `D:\code\staccato-elt\.narada\config.json`; the runbook documents the relevant `integrations.cloudflare.published_surface` shape.
- Added Site Registry projection descriptors in `packages/site-config/src/index.ts`: projected Site records with site id, locus/substrate, registry status, relation, freshness/health, event endpoint posture, inbox/message endpoint posture, capabilities, evidence, and non-authority limits.
- Added typed Site event envelope and receiver decision contracts for webhook/Cloudflare-style guarded receipt, including source/subject/target addressing, event id/idempotency, family/type, observed/sent timestamps, capability auth posture, payload bounds, refusal reasons, and no-authority flags.
- Added projection read-model derivation for latest health, inbox availability, agent/session posture, task/work posture, attention, reports, freshness classification, and event provenance.
- Added human peek surface posture and Staccato pattern mapping that separates reusable bearer-guarded webhook/projection/read API/receipt/local-admission patterns from Staccato-specific event names, dashboard rows, report tabs, bindings, and secret env names.
- Documented the Site Registry projection, typed events, projection read models, human peek UI/API, and Staccato pattern split in `packages/site-config/README.md`.
- Added focused package tests proving registry projection non-authority, typed receiver refusal/acceptance, projection derivation freshness/provenance, human peek no-authority flags, and Staccato reusable/site-specific pattern mapping.

## Verification

- `pnpm --filter @narada2/site-config test` passed: 13 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.

## Acceptance Criteria

- [x] A Site Registry projection contract represents a collection of Sites and distinguishes registry/projection state from Site authority.
- [x] Typed webhook/event receiver contract is specified with registry addressing, event identity/idempotency, capability/auth posture, payload bounds, and refusal states.
- [x] Projection state/read-model contract derives latest Site posture from typed events with freshness/provenance and stale/missing/failing classifications.
- [x] Human peek UI/API posture is documented or tested as read-only projection access, not authority for Site mutation, inbox admission, task lifecycle, identity, or capability grants.
- [x] Staccato Cloudflare Worker pattern is explicitly mapped as source evidence, with reusable parts separated from Staccato-specific event families and UI.
