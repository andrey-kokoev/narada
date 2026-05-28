---
status: confirmed
depends_on: [1291, 1297, 1298, 1299]
closed_at: 2026-05-16T00:35:56.703Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add OpenRouter Narada-native intellect provider adapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1301-1305-narada-native-intellect-provider-adapters.md

## Goal

Implement an OpenRouter Narada-native provider adapter behind the shared execution contract.

## Context

OpenRouter should be usable as a model-routing provider substrate while preserving Narada-native authority separation and evidence redaction.

## Required Work

1. Add OpenRouter provider kind registration and readiness behavior using the shared provider adapter contract.
2. Implement request construction and response normalization for OpenRouter OpenAI-compatible posture with explicit model/router configuration.
3. Represent missing capability, missing model/router configuration, provider refusal, timeout, rate-limit, and malformed response as bounded refusal/failure evidence.
4. Ensure OpenRouter adapter evidence omits raw secrets, raw prompt text, raw output text, and unbounded transcripts.
5. Add tests with mocked transport for success, refusal/failure, missing capability, and redaction.

## Non-Goals

- Do not perform live OpenRouter network calls in normal tests.
- Do not let OpenRouter routing metadata become authority over Narada task or effect decisions.
- Do not embed OpenRouter credentials in repository files or task evidence.

## Execution Notes

- Added `tools/narada-native-carrier/openrouter-provider-adapter.mjs` with OpenRouter provider kind `openrouter_openai_compatible`.
- Added OpenRouter registration helper metadata that uses capability references and provider config shape only; persisted registration evidence records endpoint/model/router/api-posture keys but omits values.
- Implemented OpenRouter OpenAI-compatible chat completions request construction through injected transport with explicit model and router reference configuration.
- Normalized `choices[0].message.content` into inert proposed action packets behind the shared provider adapter execution contract.
- Missing capability, missing model, missing router configuration, missing credential reference, provider refusal, rate limit, timeout, provider failure, and malformed response all become bounded refusal/failure evidence.
- OpenRouter invocation evidence omits raw prompt text, raw model output, raw secret values, credential secrets, router values, and unbounded transcripts.
- Added mocked-transport tests for successful invocation, registration/readiness, missing capability/model/router, malformed response, provider refusal/failure, rate limit, timeout, and redaction.
- Repaired the rejected review dependency by wiring the normal Narada-native task handoff path to dispatch persisted non-fixture provider registrations through the shared provider work loop. OpenRouter registration can now be selected by `provider_kind` during governed carrier handoff instead of remaining a standalone helper.

## Verification

- `node --test tools\narada-native-carrier\openrouter-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\openai-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\anthropic-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\kimi-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 6 tests, including provider-registration dispatch through the governed handoff path.

## Acceptance Criteria

- [x] OpenRouter provider kind can be registered and reported as provider-configured when capability posture is valid.
- [x] Mocked OpenRouter invocation returns normalized inert adapter output.
- [x] Failure/refusal cases are bounded and reconstructable.
- [x] Evidence redaction tests prove no raw prompt, output, or secret values are persisted.
