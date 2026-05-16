---
status: confirmed
depends_on: [1432]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:26:35.065Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by migration 0002, exported storage helpers, Worker boundary tests for retention/idempotency, package tests, and build.
closed_at: 2026-05-16T23:26:46.038Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add D1 schema for registry relation lifecycle

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1433-1440-site-registry-relation-lifecycle.md

## Goal

Add D1 migration and storage helpers for registry relation current state and transition events.

## Context

Because the registry is remote-hosted, lifecycle state belongs in D1 as operational state. JSON event payloads should remain replayable evidence, and KV should remain projection cache only.

## Required Work

1. Add a D1 migration for relation state and relation event ledger tables.
2. Implement bounded storage helpers for relation upsert/transition lookup using idempotency keys.
3. Keep event JSON in D1 rows as replayable evidence without raw secrets.
4. Add tests for idempotent transition writes, uniqueness by registry/site/relation kind, and provenance retention.
5. Document that KV is not relation lifecycle authority.

## Non-Goals

- Do not expose public mutation routes yet.
- Do not purge stored projection or event history.
- Do not store raw bearer tokens or private payloads.

## Execution Notes

Added D1 migration:

`packages/site-registry-cloudflare/migrations/0002_site_registry_relation_lifecycle.sql`

The migration creates:

- `site_registry_relations` for current relation lifecycle state;
- `site_registry_relation_events` for idempotent transition event evidence.

Updated migration docs to state that relation lifecycle current state belongs in
D1, transition JSON is replayable evidence, and KV is not relation lifecycle
authority.

Implemented bounded storage helpers in
`packages/site-registry-cloudflare/src/index.ts`:

- `recordSiteRegistryRelationTransition`
- `getSiteRegistryRelation`
- `listSiteRegistryRelationEvents`

The helpers:

- deduplicate transition writes by `(relation_id, idempotency_key)`;
- preserve current-state/query separation;
- store transition JSON as evidence;
- retain relation event history after current state changes;
- return bounded results with `raw_secret_values_recorded=false`.

No public mutation route, live Cloudflare deploy, purge behavior, KV authority
change, local Site config mutation, inbox mutation, or task lifecycle mutation
was added.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 39 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- Added Worker boundary tests proving active-to-withdrawn relation event retention, current state update, and idempotent duplicate handling.
- Manual diff review confirmed no public transition route or purge behavior was added.

## Acceptance Criteria

- [x] A D1 migration defines relation current state and relation event ledger tables.
- [x] Storage helpers preserve idempotency and current-state/query separation.
- [x] Tests prove relation events are retained when state changes.
- [x] No raw secrets are stored or emitted.
