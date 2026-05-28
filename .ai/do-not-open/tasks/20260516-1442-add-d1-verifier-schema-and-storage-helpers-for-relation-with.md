---
status: confirmed
depends_on: [1440]
amended_by: narada.builder
amended_at: 2026-05-17T00:02:48.822Z
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-17T00:02:53.230Z
criteria_proof_verification:
  state: unbound
  rationale: D1 verifier migration, storage helpers, and focused tests implemented; verified by site-registry-cloudflare tests, typecheck, build, and diff check.
closed_at: 2026-05-17T00:45:23.134Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
confirmed_by: narada.architect
confirmed_at: 2026-05-18T17:35:09.571Z
---

# Add D1 verifier schema and storage helpers for relation withdrawal capabilities

## Chapter

Site Registry Relation Lifecycle / Site-Scoped Capability Verifiers

## Goal

Add private D1 storage for Site-scoped relation withdrawal verifier records and bounded helper functions.

## Context

Builds the private storage/helper slice after task 1441 specified the relation capability verifier contract. This task does not wire the verifier into the public transition route yet.

## Required Work

1. Add a D1 migration for `site_registry_relation_capability_verifiers` or equivalent private verifier records.
2. Include fields for relation id, site id, capability ref, capability family, verifier algorithm metadata, salt or equivalent, verifier hash, owner Site id, status, created/rotated/revoked timestamps, and evidence refs.
3. Implement storage helpers to create/read/revoke verifier records without exposing raw secrets.
4. Use a versioned verifier algorithm posture compatible with Cloudflare Workers; if PBKDF2 is chosen for v0, document its transitional limits.
5. Add tests for lookup by relation/site/capability family, active-vs-revoked behavior, no raw secret storage, and relation table separation.

## Non-Goals

- Do not replace the relation transition route auth in this task.
- Do not create, rotate, or set Cloudflare Worker secrets.
- Do not expose verifier storage through public Site Registry reads.
- Do not claim live Cloudflare deployment readiness.

## Execution Notes

- Added D1 migration `packages/site-registry-cloudflare/migrations/0003_relation_capability_verifiers.sql`.
- Added `SiteRegistryRelationCapabilityVerifierRecord` and helper input/status types.
- Implemented `createSiteRegistryRelationCapabilityVerifier`, `getActiveSiteRegistryRelationCapabilityVerifier`, `getSiteRegistryRelationCapabilityVerifierById`, and `revokeSiteRegistryRelationCapabilityVerifier`.
- Helper storage uses PBKDF2-SHA256 v0 via WebCrypto `crypto.subtle`, records salt/hash/algorithm metadata, and marks the algorithm posture as transitional Worker-compatible verifier storage, not a password vault.
- Helpers store only verifier hash metadata and evidence refs; raw verifier secret input is not serialized into D1 record JSON.
- Added tests for active lookup by relation/site/capability family, revoked verifier exclusion from active lookup, no raw secret persistence, and separation from public relation rows.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 49 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `git diff --check -- packages/site-registry-cloudflare/migrations/0003_relation_capability_verifiers.sql packages/site-registry-cloudflare/src/index.ts packages/site-registry-cloudflare/test/worker-boundary.test.ts` passed, with line-ending warnings only.

## Acceptance Criteria

- [x] D1 migration defines private verifier records.
- [x] Storage helpers enforce active/revoked distinction and relation/site scoping.
- [x] Tests prove no raw secret values are stored or emitted.
- [x] Public relation rows remain separate from verifier authority.
