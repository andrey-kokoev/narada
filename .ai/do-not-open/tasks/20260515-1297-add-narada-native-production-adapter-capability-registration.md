---
status: confirmed
depends_on: [1288, 1289, 1290, 1291, 1292, 1293]
closed_at: 2026-05-15T23:49:42.257Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add Narada-native production adapter capability registration

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260515-1294-1299-agent-carriers-stage-4-operationalization.md

## Goal

Add a governed registration path for a real Narada-native model or executor adapter without embedding provider secrets or effect authority in the carrier.

## Context

Stage 3 used a deterministic fixture adapter. Stage 4 should make provider-backed adapters pluggable through capability references and explicit readiness checks, while keeping the fixture adapter available for tests.

## Required Work

1. Define adapter registration metadata for provider kind, capability reference, model/executor posture, supported request/response classes, and evidence policy.
2. Implement readiness checks that distinguish fixture adapter, configured provider adapter, missing capability, invalid capability, and refused secret-bearing configuration.
3. Ensure provider configuration stores capability references and policy metadata, not raw API keys or credentials.
4. Add tests for fixture fallback, registered provider posture, missing capability refusal, and secret-value rejection.

## Non-Goals

- Do not choose one permanent production model provider as Narada doctrine.
- Do not store raw provider credentials in repository, task evidence, logs, or carrier evidence.
- Do not grant shell, filesystem, network, or external effect authority by registering an adapter.

## Execution Notes

- Added `tools/narada-native-carrier/adapter-registration.mjs` with Narada-native adapter registration metadata for adapter/provider kind, capability reference, model/executor posture, supported request/response classes, and evidence policy.
- Provider-backed adapters require a capability reference and an explicitly granted capability at registration time; missing or ungranted capability refs are refused.
- Provider configuration is reduced to key summaries only. Raw provider config values, raw secrets, raw prompts, raw outputs, and unbounded transcripts are not recorded.
- Secret-like provider configuration is refused before registration evidence is written.
- Rejected review repair: unsafe `evidence_policy` overrides are now refused before persistence, and sanitization no longer spreads caller-provided policy values over the safe defaults. Registrations cannot set raw prompt, raw output, raw secret value, or unbounded transcript recording to true.
- Extended operational readiness to include adapter registration readiness while preserving fixture fallback when no provider registration exists.
- Added tests for fixture fallback, provider registration posture, missing capability refusal, secret-value rejection, unsafe evidence-policy refusal, and readiness evidence redaction.

## Verification

- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 2 tests.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed with 3 tests.

## Acceptance Criteria

- [x] Narada-native adapter registration supports fixture and provider-backed adapter postures.
- [x] Readiness output reports provider/capability posture without exposing secrets.
- [x] Invalid or secret-bearing configuration is refused.
- [x] Tests cover registration, readiness, refusal, and evidence redaction.
