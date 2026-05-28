---
status: closed
depends_on: [1309, 1321]
closed_at: 2026-05-16T03:15:22.483Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Implement provider capability projection lookup

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1333-1338-narada-native-capability-consent-binding.md

## Goal

Resolve provider capability refs into bounded provider invocation posture.

## Context

Provider adapters need to know whether invocation is allowed without receiving raw credential material.

## Required Work

1. Use provider registration capability_ref as lookup input.
2. Return credential reference presence, policy refs, scope summary, consent refs, grant freshness, and revocation status only.
3. Refuse missing_capability_ref, missing_consent_record, revoked_capability, stale_grant, and secret_bearing_capability_material.
4. Add tests proving each refusal is bounded and redacted.

## Non-Goals

- Do not return raw credential values.
- Do not infer consent from provider config presence.
- Do not invoke provider transport in this lookup.

## Execution Notes

- Added provider capability projection lookup in `tools/narada-native-carrier/capability-projection.mjs`.
- The lookup uses provider registration `capability_ref`, returns bounded projection posture, and serializes credential presence, policy refs, consent refs, grant freshness, revocation status, and scope summary only.
- Wired `executeProviderAdapter` through the lookup so provider transport is refused before invocation for missing capability ref, missing consent record, revoked capability, stale grant, and secret-bearing capability material.
- Kept transport compatibility by passing admitted capability material internally only after bounded lookup admission; provider invocation evidence records only the bounded projection and summary, not raw credential values or raw capability material.
- Updated provider-family tests and handoff/wrapper fixtures to include explicit consent records.

## Verification

- `node --test tools\narada-native-carrier\capability-projection.test.mjs` - pass, 6 tests.
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` - pass, 4 tests.
- `node --test tools\narada-native-carrier\openai-provider-adapter.test.mjs tools\narada-native-carrier\anthropic-provider-adapter.test.mjs tools\narada-native-carrier\kimi-provider-adapter.test.mjs tools\narada-native-carrier\openrouter-provider-adapter.test.mjs` - pass, 16 tests.
- `node --test tools\narada-native-carrier\orchestration-wrapper-proof.test.mjs tools\narada-native-carrier\task-handoff.test.mjs` - pass, 7 tests.
- `node --test tools\narada-native-carrier\*.test.mjs` - pass, 82 tests.
- `pnpm --filter @narada2/cli build` - pass.

## Acceptance Criteria

- [x] Provider capability lookup returns bounded projection posture only.
- [x] All specified refusal states are represented.
- [x] Tests prove refusal evidence is redacted and non-mutating.
