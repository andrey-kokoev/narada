---
status: confirmed
depends_on: [1291, 1297, 1298, 1299]
closed_at: 2026-05-16T00:35:00.331Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Add OpenAI Narada-native intellect provider adapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1301-1305-narada-native-intellect-provider-adapters.md

## Goal

Implement an OpenAI Narada-native provider adapter behind the shared execution contract.

## Context

OpenAI should be usable as one provider-backed intellect substrate for Narada-native carrier sessions, without making OpenAI output a Narada authority decision.

## Required Work

1. Add OpenAI provider kind registration and readiness behavior using the shared provider adapter contract.
2. Implement request construction and response normalization for OpenAI chat/responses posture selected by current local dependency constraints.
3. Represent missing capability, missing model configuration, provider refusal, timeout, rate-limit, and malformed response as bounded refusal/failure evidence.
4. Ensure OpenAI adapter evidence omits raw secrets, raw prompt text, raw output text, and unbounded transcripts.
5. Add tests with mocked transport for success, refusal/failure, missing capability, and redaction.

## Non-Goals

- Do not perform live OpenAI network calls in normal tests.
- Do not grant OpenAI tool-call effects directly.
- Do not embed OpenAI credentials in repository files or task evidence.

## Execution Notes

- Added `tools/narada-native-carrier/openai-provider-adapter.mjs` with OpenAI provider kind `openai_chat_completions`.
- Selected a dependency-free chat-completions-compatible posture because the local carrier code uses mocked transport and no OpenAI SDK dependency is required for this boundary.
- Added OpenAI registration helper metadata that uses capability references and provider config shape only; persisted registration evidence records endpoint/model/api-posture keys but omits values.
- Implemented OpenAI chat completions request construction through injected transport and normalized `choices[0].message.content` into inert proposed action packets behind the shared provider adapter execution contract.
- Missing capability, missing model, missing credential reference, provider refusal, rate limit, timeout, provider failure, and malformed response all become bounded refusal/failure evidence.
- OpenAI invocation evidence omits raw prompt text, raw model output, raw secret values, credential secrets, and unbounded transcripts.
- Added mocked-transport tests for successful invocation, registration/readiness, missing capability/model, malformed response, provider refusal/failure, rate limit, timeout, and redaction.
- Repaired the rejected review dependency by wiring the normal Narada-native task handoff path to dispatch persisted non-fixture provider registrations through the shared provider work loop. OpenAI registration can now be selected by `provider_kind` during governed carrier handoff instead of remaining a standalone helper.

## Verification

- `node --test tools\narada-native-carrier\openai-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\provider-adapter.test.mjs` passed with 3 tests.
- `node --test tools\narada-native-carrier\adapter-registration.test.mjs` passed with 6 tests.
- `node --test tools\narada-native-carrier\kimi-provider-adapter.test.mjs` passed with 4 tests.
- `node --test tools\narada-native-carrier\task-handoff.test.mjs` passed with 6 tests, including provider-registration dispatch through the governed handoff path.

## Acceptance Criteria

- [x] OpenAI provider kind can be registered and reported as provider-configured when capability posture is valid.
- [x] Mocked OpenAI invocation returns normalized inert adapter output.
- [x] Failure/refusal cases are bounded and reconstructable.
- [x] Evidence redaction tests prove no raw prompt, output, or secret values are persisted.
