---
status: confirmed
depends_on: [1291, 1297, 1298, 1299]
closed_at: 2026-05-16T00:34:55.627Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add Kimi Narada-native intellect provider adapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1301-1305-narada-native-intellect-provider-adapters.md

## Goal

Implement a Kimi-compatible Narada-native provider adapter behind the shared execution contract.

## Context

Kimi should be usable as a Narada-native intellect provider only through the governed provider adapter boundary. Registration must use a capability reference and must not store raw credentials.

## Required Work

1. Add Kimi provider kind registration and readiness behavior using the shared provider adapter contract.
2. Implement request construction and response normalization for a Kimi-compatible chat/completions endpoint or documented OpenAI-compatible Kimi posture.
3. Represent missing capability, missing endpoint/model configuration, provider refusal, timeout, and malformed response as bounded refusal/failure evidence.
4. Ensure Kimi adapter evidence omits raw secrets, raw prompt text, raw output text, and unbounded transcripts.
5. Add tests with mocked transport for success, refusal/failure, missing capability, and redaction.

## Non-Goals

- Do not perform live Kimi network calls in normal tests.
- Do not select Kimi as a default provider.
- Do not embed Kimi credentials in repository files or task evidence.

## Execution Notes

- Added `tools/narada-native-carrier/kimi-provider-adapter.mjs` with Kimi provider kind `kimi_openai_compatible`.
- Added Kimi registration helper metadata that uses capability references and provider config shape only; persisted registration evidence records endpoint/model keys but omits values.
- Implemented Kimi OpenAI-compatible chat/completions request construction through an injected transport. Normalized `choices[0].message.content` into inert proposed action packets behind the shared provider adapter execution contract.
- Missing capability, missing endpoint, missing model, missing credential reference, provider error/refusal, timeout, and malformed response all become bounded refusal/failure evidence.
- Kimi invocation evidence omits raw prompt text, raw model output, raw secret values, credential secrets, and unbounded transcripts.
- Added mocked-transport tests for successful invocation, registration/readiness, missing capability/configuration, malformed response, provider refusal/failure, timeout, and redaction.
- Repaired the rejected review dependency by wiring the normal Narada-native task handoff path to dispatch persisted non-fixture provider registrations through the shared provider work loop. Kimi registration can now be selected by `provider_kind` during governed carrier handoff instead of remaining a standalone helper.

## Verification

- `node --test tools\narada-native-carrier\kimi-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 6 tests, including provider-registration dispatch through the governed handoff path.

## Acceptance Criteria

- [x] Kimi provider kind can be registered and reported as provider-configured when capability posture is valid.
- [x] Mocked Kimi invocation returns normalized inert adapter output.
- [x] Failure/refusal cases are bounded and reconstructable.
- [x] Evidence redaction tests prove no raw prompt, output, or secret values are persisted.
