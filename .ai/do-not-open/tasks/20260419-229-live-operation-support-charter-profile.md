# Task 229: Live Operation Support Steward Charter Profile

## Chapter

Live Operation

## Why

`support_steward` is currently just a string ID in config. The `CodexCharterRunner` uses a single generic system prompt for all charters, which means a support/helpdesk operation receives no support-specific instructions, tone guidance, or playbook references. Without a real charter profile, the foreman will receive generic or nonsensical proposed actions.

This is the single largest semantic gap blocking a useful live operation.

## Goal

Give `support_steward` actual support-oriented behavior: a dedicated prompt template, knowledge source injection, and a verification path that proves the charter produces sensible draft replies for support threads.

## Required Work

### 1. Support-Specific System Prompt

Create a `support_steward` prompt template that is distinct from the generic charter prompt. At minimum, it should:
- Identify the charter's role as a support/helpdesk agent for `help@global-maxima.com`
- Define tone (professional, helpful, concise)
- Define boundaries (do not make promises the business cannot keep, escalate technical issues beyond scope)
- Reference any available knowledge sources / playbooks
- Instruct the charter to prefer `draft_reply` over `send_reply` unless explicitly authorized

The prompt should be versioned and stored in a location that allows future iteration without code changes (e.g., a template file or a dedicated charters package directory).

### 2. Charter Prompt Selection

Modify the charter runtime or envelope builder so that `charter_id` selects the correct system prompt template. The generic prompt remains the fallback for unknown charter IDs.

Acceptable approaches:
- Prompt registry keyed by `charter_id`
- Template file lookup by `charter_id`
- Conditional prompt assembly in `CodexCharterRunner`

Keep the change minimal and backward-compatible.

### 3. Knowledge Source Injection

Wire knowledge source retrieval into the charter invocation envelope so that `context_materialization` includes relevant knowledge content.

Current state: `KnowledgeCatalogEntry` is passed in the envelope but `CodexCharterRunner.buildUserPrompt()` does not fetch or include knowledge content.

For the first live operation, the knowledge source can be simple:
- A `README.md` or `playbook.md` in the ops-repo `knowledge/` directory
- Injected into the system prompt or user prompt as context

Do not build a full RAG pipeline. Direct file inclusion is sufficient.

### 4. Verification

Run the charter against a fixture-backed support thread (or a real thread if available and safe) and verify:
- The charter identifies itself as `support_steward`
- The output includes a sensible `draft_reply` proposal
- The tone matches the defined support persona
- The proposed reply references relevant knowledge if applicable
- Confidence and classifications are reasonable

Use `previewWork` or a direct charter runner test for verification. Do not open work items or create intents during verification unless specifically testing the full pipeline.

## Non-Goals

- Do not build a general charter marketplace or profile repository.
- Do not implement RAG, vector search, or dynamic knowledge retrieval.
- Do not implement secondary charter arbitration.
- Do not send email.
- Do not fine-tune a model.

## Acceptance Criteria

- [ ] `support_steward` has a dedicated prompt template distinct from the generic charter prompt.
- [ ] `charter_id` selects the correct prompt at runtime.
- [ ] Knowledge sources from the ops-repo are injected into the charter invocation envelope.
- [ ] Verification output shows a sensible support-oriented draft reply proposal for a test thread.
- [ ] No regression for other charter IDs (generic fallback still works).

## Execution Notes

### Prompt Registry Created

**New file:** `packages/domains/charters/src/runtime/prompts.ts`

- `PROMPT_REGISTRY` maps `charter_id` → `SystemPromptTemplate` function
- `support_steward` template includes:
  - Role identification: "support steward for help@global-maxima.com"
  - Tone guidance: professional, warm, concise, empathetic, clear
  - Boundaries: draft-only (no direct send), no promises, no internal details, escalate when needed
  - Draft instructions: acknowledge issue, ask clarifying questions, provide next steps, sign off with global-maxima.com
  - Knowledge source guidance: use playbooks when relevant, don't quote verbatim unless exact procedure
- `registerPromptTemplate()` allows runtime extension
- `resolveSystemPrompt()` falls back to generic template for unknown charter IDs

**Modified:** `packages/domains/charters/src/runtime/runner.ts`
- `buildSystemPrompt()` removed; `resolveSystemPrompt(envelope)` used instead
- Backward-compatible: unknown charter IDs still get generic template

**Exported:** `packages/domains/charters/src/runtime/index.ts`
- Exports `resolveSystemPrompt`, `registerPromptTemplate`, `SystemPromptTemplate`

### Knowledge Source Injection

**Modified:** `packages/layers/control-plane/src/charter/mailbox/materializer.ts`
- Added `loadKnowledgeSources(rootDir)` which reads all `.md` files from `<rootDir>/knowledge/`
- `MailboxContextMaterializer.materialize()` now returns `{ messages, knowledge_sources }`
- Knowledge sources are included as an array of `{ name, content }` objects in `context_materialization`
- Gracefully handles missing `knowledge/` directory (returns empty array)

**Created:** `/home/andrey/mailboxes/help-global-maxima/knowledge/README.md`
- Support playbook with login/auth troubleshooting guidance
- Scoped to the help-global-maxima mailbox

### Verification

**Unit tests added:**
- `packages/domains/charters/test/runtime/prompts.test.ts` (3 tests, all pass):
  - Verifies `support_steward` template is selected for that charter_id
  - Verifies generic fallback for unknown charter IDs
  - Verifies custom template registration works
- `packages/layers/control-plane/test/unit/charter/mailbox-materializer.test.ts` (2 tests, all pass):
  - Verifies knowledge sources are read when `knowledge/` directory exists
  - Verifies empty knowledge_sources when directory is missing

**Live API verification:**
- A verification script (`scripts/verify-support-charter.ts`) was prepared to run the fixture thread through Gemini's OpenAI-compatible API
- **Blocked:** Gemini API returned 429 `RESOURCE_EXHAUSTED` (prepayment credits depleted)
- The unit tests sufficiently verify the structural correctness of prompt selection and knowledge injection
- Live output verification is deferred to Task 230 (pipeline verification) when API credits are restored or an alternative API key is provided

### Build Status

- `pnpm -r build` passes
- Charters package tests: 72 tests pass (including 3 new prompt tests)
- Control-plane tests: 2 new materializer tests pass

## Definition Of Done

- [x] `support_steward` has a dedicated prompt template distinct from the generic charter prompt.
- [x] `charter_id` selects the correct prompt at runtime.
- [x] Knowledge sources from the ops-repo are injected into the charter invocation envelope.
- [ ] Verification output shows a sensible support-oriented draft reply proposal for a test thread. *(Blocked: Gemini API credits depleted; unit tests verify structural correctness; live output verification deferred to Task 230)*
- [x] No regression for other charter IDs (generic fallback still works).

## Dependencies

- Task 228: Config and Sync Readiness (must have messages/facts to form context from)
