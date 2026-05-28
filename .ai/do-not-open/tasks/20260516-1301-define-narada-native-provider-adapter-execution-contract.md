---
status: confirmed
depends_on: [1291, 1297, 1298, 1299]
closed_at: 2026-05-16T00:34:23.047Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Define Narada-native provider adapter execution contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1301-1305-narada-native-intellect-provider-adapters.md

## Goal

Add the shared execution contract that lets Narada-native run provider-backed intellect adapters from registered capability references without moving authority into the provider.

## Context

The current Narada-native carrier has a replaceable adapter boundary and provider registration metadata, but only the deterministic fixture adapter is executable. Kimi, OpenAI, Anthropic, and OpenRouter should share one invocation and evidence contract rather than each inventing provider-specific semantics.

## Required Work

1. Inspect the existing Narada-native adapter, adapter-registration, work-loop, task-handoff, readiness, and supervisor surfaces.
2. Define a provider adapter interface for request construction, credential/capability lookup by reference, response normalization, refusal handling, timeout/failure posture, and redacted invocation evidence.
3. Implement the smallest shared runner or registry needed for provider adapters to be selected by registered provider kind.
4. Ensure provider outputs remain inert proposed action packets or refusal/closeout summaries until admitted through canonical Narada surfaces.
5. Add focused tests proving no raw secrets, raw prompts, raw model outputs, or unbounded transcripts are recorded.

## Non-Goals

- Do not grant provider adapters task, inbox, outbox, command, publication, credential-store, or external Site mutation authority.
- Do not hardcode API keys or provider secrets.
- Do not require live network calls in unit tests.

## Execution Notes

- Inspected the existing Narada-native adapter, registration, work-loop, task-handoff, readiness, and supervisor surfaces.
- Added `tools/narada-native-carrier/provider-adapter.mjs` as the shared provider execution contract.
- The provider runner selects adapters by registered `provider_kind`, looks up capability material by `capability_ref`, passes only credential/capability references into provider adapters, normalizes provider responses into inert adapter outputs, and records timeout/failure/refusal posture.
- Provider invocation evidence records request/output summaries, capability-reference posture, canonical-admission requirement, and no-authority flags. It does not record raw prompts, raw provider outputs, raw secret values, credential secrets, or unbounded transcripts.
- Tightened `sanitizeAdapterOutput` so `closeout_summary` is summarized rather than stored verbatim.
- Added focused provider-adapter tests for provider selection, missing capability refusal, unknown provider refusal, secret-bearing capability refusal, provider failure posture, inert output, and evidence redaction.
- Repaired the rejected review finding: `runGovernedTaskHandoff` now reads the persisted Narada-native adapter registration and dispatches non-fixture `provider_kind` registrations through `executeProviderAdapter` via the shared work-loop path.
- Added `runProviderWorkLoop` so provider-backed execution produces the same governed handoff, interrupt, closeout, no-effect posture, and report-draft evidence refs as the fixture route.
- Updated reconstruction/readiness to treat `provider-adapter-invocation.json` as adapter evidence and distinguish `provider_adapter_invoked` from fixture invocation.

## Verification

- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\work-loop.test.mjs` passed with 1 test.
- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\supervisor.test.mjs` passed with 5 tests.
- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 6 tests, including provider-registration dispatch through the governed handoff path.
- `node --test tools\narada-native-carrier\readiness.test.mjs` passed with 2 tests.
- `node --test tools\narada-native-carrier\kimi-provider-adapter.test.mjs tools\narada-native-carrier\openai-provider-adapter.test.mjs` passed with 8 tests.
- `node --test tools\narada-native-carrier\anthropic-provider-adapter.test.mjs tools\narada-native-carrier\openrouter-provider-adapter.test.mjs` passed with 8 tests.

## Acceptance Criteria

- [x] A shared provider adapter execution contract exists and is used by provider-specific adapters.
- [x] Provider selection is driven by registered provider kind and capability reference, not raw provider secrets.
- [x] Invocation evidence records bounded summaries and redaction posture only.
- [x] Provider output is inert until admitted through canonical Narada surfaces.
- [x] Focused tests cover selection, failure/refusal posture, and evidence redaction.
