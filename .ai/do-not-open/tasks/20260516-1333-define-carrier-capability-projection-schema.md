---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:10:34.890Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define carrier capability projection schema

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Define the bounded capability projection schema used by Narada-native sessions.

## Context

The carrier must receive projected references and grant posture, not raw secrets or implicit authority.

## Required Work

1. Define fields for capability_ref, capability_kind, consent_ref, credential_ref_present, grant_status, grant_freshness, revocation_status, scope_summary, raw_secret_values_recorded=false, and projected_capabilities_are_not_grants=true.
2. Represent provider, data-read, fixture-only, missing, revoked, and stale projections.
3. Add schema tests for every projection state.

## Non-Goals

- Do not implement the canonical consent registry itself.
- Do not store raw credentials or raw secret values in carrier files.
- Do not grant mutation authority through projection records.

## Execution Notes

- Added `tools/narada-native-carrier/capability-projection.mjs` with capability projection schema helpers.
- Defined required fields: `capability_ref`, `capability_kind`, `consent_ref`, `credential_ref_present`, `grant_status`, `grant_freshness`, `revocation_status`, `scope_summary`, `raw_secret_values_recorded=false`, and `projected_capabilities_are_not_grants=true`.
- Represented provider, data-read, fixture-only, missing, revoked, and stale projection states.
- Added validation that rejects raw secret recording, credential ref values, raw scope values, and projection-as-grant collapse.
- Added `tools/narada-native-carrier/capability-projection.test.mjs` covering every projection state and the secret/grant-collapse validation path.

## Verification

- `node --test tools\narada-native-carrier\capability-projection.test.mjs` passed: 4 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` passed: 62 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] A capability projection schema exists with explicit grant, consent, credential-reference, freshness, and revocation posture.
- [x] Provider, data-read, fixture-only, missing, revoked, and stale projections are covered.
- [x] Tests prove raw secret values are absent and projected capabilities are not grants.
