# Carrier Protocol

Shared protocol types, constructors, fixtures, and validators for Narada interactive carriers.

This package is the executable contract behind carrier input, session event, provider output, observer, payload-ref, host-command, and tool/effect evidence semantics. It is UI-independent and may be used by `agent-cli`, `agent-tui`, Cloudflare carrier implementations, and future carriers.

## Boundary Ownership

The protocol package owns vocabulary and validation for carrier evidence. Carrier implementations own host-specific mechanics such as terminal input, Durable Object storage, Worker routing, provider calls, and effect adapters.

Implementations should use this package for:

- input event normalization and admission classification;
- observer visibility and suppression semantics;
- session event validation;
- provider request/output payload construction;
- carrier-side tool call/result payload construction;
- payload-ref validation.

## Tool / Effect Evidence

Provider tool-call output is not effect execution. A carrier records the crossing with shared session events:

1. `provider_tool_call_requested`
2. `tool_call_requested`
3. `tool_result_received`

Shared tool/effect vocabulary:

- `TOOL_RESULT_STATUSES`: `ok`, `denied`, `failed`
- `TOOL_EFFECT_ADMISSION_ACTIONS`: `admit`, `deny`
- `TOOL_EFFECT_ADMISSION_REASONS`: `read_only_tool_effect_admitted`, `tool_effect_adapter_unconfigured`, `tool_effect_admission_required`, `unsupported_tool_effect`, `tool_effect_authority_denied`, `write_tool_effect_admitted`

Use `classifyToolEffectAdmission` to project configured/supported tool posture into shared `admit` or `deny` decisions. Use `createToolCallPayload` and `createToolResultPayload` when recording carrier-side tool/effect evidence. `tool_result_received` may carry structured `admission_action` and `admission_reason` when an effect boundary admits or denies the request; admitted results may also carry `capability_ref` and `effect_scope` to identify the capability that made `ok` admissible, plus `authority_ref` to identify the principal authority used for that effect.

Shared fixtures include:

- `tool-effect-admission-cases.json` (`TOOL_EFFECT_ADMISSION_CASES_SCHEMA`) for classifier cases covering unconfigured denial, read-only admission, and unsupported-tool denial;
- `tool-result-session-event.json` for a plain successful tool result;
- `tool-result-admitted-session-event.json` for admitted read-only effect evidence with capability and scope;
- `tool-result-denied-session-event.json` for deny-by-default unconfigured adapter evidence;
- `tool-result-failed-session-event.json` for an admitted effect whose execution failed after admission.

## Contract Mirror

`packages/carrier-protocol-contract/contracts/carrier-protocol.json` mirrors the public vocabulary for non-JavaScript consumers. Keep protocol exports, contract JSON, fixtures, and tests aligned when adding vocabulary.
