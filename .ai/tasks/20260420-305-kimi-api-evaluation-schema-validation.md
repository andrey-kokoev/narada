# Task 305 — Kimi API Charter Evaluation Schema Validation Failure

status: closed

## Chapter

Mailbox Operational Trial

## Context

Task 303 successfully created a controlled test thread in `help@global-maxima.com`. The Narada daemon picked up the message, created a fact, and opened a work item. However, the charter execution crashed during evaluation because the Kimi API (Moonshot) response did not validate against the expected `Evaluation` schema.

This is a product gap: the charter runtime for `kimi-api` either produces output in a different shape than expected, or the prompt/schema binding is mismatched.

## Error Detail

Execution attempt `ex_fd7d46a9-68cb-452b-8c83-61a3eb2a0c49` crashed with the following Zod validation errors:

```json
[
  { "path": ["confidence"], "message": "Required", "expected": "object", "received": "undefined" },
  { "path": ["classifications"], "message": "Required", "expected": "array", "received": "undefined" },
  { "path": ["facts"], "message": "Required", "expected": "array", "received": "undefined" },
  { "path": ["proposed_actions", 0, "action_type"], "message": "Required", "expected": "'draft_reply' | ...", "received": "undefined" },
  { "path": ["proposed_actions", 0, "authority"], "message": "Required", "expected": "'proposed' | 'recommended'", "received": "undefined" },
  { "path": ["proposed_actions", 0, "payload_json"], "message": "Required", "expected": "string", "received": "undefined" },
  { "path": ["escalations"], "message": "Required", "expected": "array", "received": "undefined" }
]
```

Work item: `wi_7e40881b-eb7b-4c20-ab7d-9debdbb07083`  
Status: `failed_retryable`  
Execution status: `crashed`

## Goal

Fix the Kimi API charter runtime so that evaluation output validates against the `Evaluation` schema, or add graceful handling when the model returns non-conforming output.

## Required Work

1. Inspect the Kimi API charter runner (`packages/domains/charters/src/runtime/...` or `packages/layers/control-plane/src/charter/...`) to understand how it parses the model response.
2. Determine whether the issue is:
   - The model returns JSON in a different shape than the prompt requests
   - The model returns non-JSON output (e.g., markdown wrapping, explanatory text)
   - The schema expects fields that the prompt does not instruct the model to produce
   - The `kimi-api` runner uses a different response structure than `openai`-compatible runners
3. Fix the root cause or add robust parsing with clear error logging.
4. Re-run the blocked work item (or create a new test thread) to verify the fix.

## Boundaries

- Do not change the `Evaluation` schema without checking downstream consumers (foreman, outbound handoff, observability).
- If the fix is in the prompt, ensure it does not regress other charter runtimes (OpenAI, mock).
- Preserve the `failed_retryable` → retry path; do not bypass governance.

## Acceptance Criteria

- [x] A controlled test thread reaches `evaluation` creation without schema validation errors.
- [x] The evaluation contains valid `proposed_actions` (empty array is valid for `no_op` outcome).
- [x] The work item advances past `executing` to `resolved` for a non-validation reason.
- [x] The fix is verified against the `kimi-api` runtime specifically.

## Execution Notes

### Root Cause
The system prompt told the model to "respond with a single JSON object matching the CharterOutputEnvelope schema" but never actually defined what that schema contains. GPT-4o often infers the correct shape from context, but Moonshot's `moonshot-v1-8k` returned a minimal object with only the fields it could infer:

```json
{
  "output_version": "2.0",
  "execution_id": "...",
  "charter_id": "...",
  "role": "primary",
  "outcome": "no_op",
  "proposed_actions": [{ "action_type": "mark_read" }],
  "summary": "...",
  "rationale": "..."
}
```

Missing fields: `confidence`, `classifications`, `facts`, `proposed_actions[*].authority`, `proposed_actions[*].payload_json`, `proposed_actions[*].rationale`, `escalations`, `tool_requests`, `analyzed_at`.

### Fix Applied

**1. Prompt fix** (`packages/domains/charters/src/runtime/prompts.ts`):
- Added `buildSchemaDescription()` function that appends a concrete JSON schema description to all system prompts.
- The description lists every required field with its type and shape, plus explicit instructions to use empty arrays `[]` when there are no classifications, facts, actions, tools, or escalations.
- Both `GENERIC_TEMPLATE` and `SUPPORT_STEWARD_TEMPLATE` now include this schema description.

**2. Runner safety net** (`packages/domains/charters/src/runtime/runner.ts`):
- Enhanced `patchOutput()` to supply safe defaults for missing envelope-level fields:
  - `confidence`: `{ overall: "low", uncertainty_flags: ["missing_confidence"] }` — missing confidence is treated as uncertain, not medium
  - `classifications`: `[]`
  - `facts`: `[]`
  - `proposed_actions`: `[]` — incomplete actions are dropped, not fabricated
  - `tool_requests`: `[]`
  - `escalations`: `[]`
- `patchProposedActions()` filters actions: an action is kept only if it has all four required fields (`action_type`, `authority`, `payload_json`, `rationale`). Missing fields are not fabricated.
- This makes the runner resilient to partial JSON without turning incomplete model output into executable actions.

**3. Tests added** (`packages/domains/charters/test/runtime/runner.test.ts`):
- `patches missing schema fields with sensible defaults` — verifies envelope-level defaults (low confidence with missing_confidence flag, empty arrays).
- `drops incomplete proposed_actions rather than fabricating fields` — verifies that actions missing required fields are stripped instead of patched into valid-looking actions.

### Verification

After rebuild and file-link sync:
- Ran `narada-daemon --once` against the existing test thread.
- The scheduler retried the previously crashed work item `wi_7e40881b-eb7b-4c20-ab7d-9debdbb07083`.
- New execution attempt `ex_a1509599-6a91-41fc-b6b3-84225474cbbd` succeeded.
- Evaluation `ev_ex_a1509599-...` was created without validation errors:
  - `outcome`: `no_op`
  - `confidence`: `{ overall: "high", uncertainty_flags: [] }`
  - `summary`: "Controlled test message for Narada mailbox operational trial."
  - All array fields present and valid.
- Work item transitioned to `resolved`.
- No foreman decision or outbound handoff created (correct: `no_op` with no proposed actions).

### Files Changed

- `packages/domains/charters/src/runtime/prompts.ts` — added `buildSchemaDescription()`, integrated into both templates
- `packages/domains/charters/src/runtime/runner.ts` — enhanced `patchOutput()`, added `patchProposedActions()`
- `packages/domains/charters/test/runtime/runner.test.ts` — added 2 tests for default patching

### Review Fixes Applied

**1. Incomplete actions are dropped, not fabricated**
- `patchProposedActions()` now filters actions instead of patching missing fields.
- An action is kept only if it has all four required fields: `action_type`, `authority`, `payload_json`, `rationale`.
- This prevents a model that omits `payload_json` or `authority` from producing an executable action.

**2. Missing confidence defaults to `low` with `missing_confidence` flag**
- Changed from `{ overall: "medium", uncertainty_flags: [] }` to `{ overall: "low", uncertainty_flags: ["missing_confidence"] }`.
- This prevents a model that omits confidence from being treated as medium-certainty.

**3. Unsafe test replaced**
- `patches incomplete proposed_actions with defaults` → `drops incomplete proposed_actions rather than fabricating fields`.
- The new test asserts `proposed_actions.length === 0` when the model omits required action fields.

**4. Prompt schema description test added**
- `prompts.test.ts` now has two tests verifying that both generic and `support_steward` prompts contain `confidence`, `payload_json`, `tool_requests`, `escalations`, and other required schema fields.

### Additional Fixes Discovered During Task 299 Re-run

**5. payload_json literal newlines repaired**
- Moonshot's `json_object` mode emits literal newline characters (ASCII 10) inside JSON string values, breaking downstream `JSON.parse`.
- `sanitizePayloadJson()` replaces literal `\n`, `\r`, `\t` with escaped versions before validation.

**6. `body` normalized to `body_text`**
- The model generates `{"body":"..."}` but the foreman/outbound system expects `body_text` or `body_html`.
- `sanitizePayloadJson()` maps `body` → `body_text` when the expected keys are absent.
- Prompt updated to explicitly instruct `body_text` instead of `body`.

**7. `facts[*].value_json` type normalized**
- The model sometimes returns `value_json` as an object/array instead of a JSON string.
- `patchFacts()` stringifies non-string `value_json` values.

### Post-Review Verification

Sent a second controlled test email (login issue support request) and ran `narada-daemon --once` with the updated code:
- Sync: 1 applied, 1 skipped
- New work item `wi_674b1f4f-...` opened
- Two execution attempts succeeded (first `clarification_needed`, second `no_op`)
- Evaluations created with complete `proposed_actions` including valid `payload_json`, `authority`, and `rationale`
- No schema validation errors
- Work item resolved without crashing

### Task 299 End-to-End Verification

Task 299 re-ran successfully with all fixes applied:
- Controlled test email "Quick question about annual plans" synced
- Work item opened → charter evaluation `complete` with `draft_reply`
- Foreman decision created → outbound handoff created → managed draft created in Graph API
- Draft inspectable via `narada drafts` with status `confirmed`
- No send occurred

### Private Evidence
- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/commands-task305-verify.log`
- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/commands-task305-e2e-verify2.log`
- Pre-fix model output captured in task notes above
