# Implementation — Charter Runtime Envelope

## Mission

Build the charter runtime adapter that consumes `CharterInvocationEnvelope`, invokes the actual charter (mock or LLM/Codex), and produces a validated `CharterOutputEnvelope`.

## Scope

Primary targets:
- `packages/charters/src/runtime/` (new or extend existing)
- `packages/charters/src/runtime/envelope.ts`
- `packages/charters/src/runtime/runner.ts`
- `packages/charters/src/runtime/mock-runner.ts` (for early testing)

## Consumes

- `20260414-006-assignment-agent-b-charter-invocation-v2.md`
- `20260414-004-coordinator-durable-state-v2.md`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-013-impl-conversation-records-and-revisions` (needs thread context hydration)

Blocks:
- `20260414-014-impl-foreman-core` (needs output validation, can proceed in parallel with mock runner)
- `20260414-018-impl-daemon-dispatch` (needs end-to-end evaluation)

## Tasks

1. **Envelope types**
   - Implement TypeScript types for `CharterInvocationEnvelope`, `CharterOutputEnvelope`, `PriorEvaluation`, `ProposedAction`, `ToolInvocationRequest`, `EscalationProposal`.
   - Add Zod or JSON Schema validation functions for both envelopes.

2. **Mock runner**
   - `MockCharterRunner.run(envelope): CharterOutputEnvelope`
   - Returns deterministic output based on envelope fields (for integration tests).
   - Validates envelope shape and throws on violations.

3. **Real runner adapter (v1)**
   - `CodexCharterRunner.run(envelope): Promise<CharterOutputEnvelope>`
   - Constructs prompt from `thread_context`, `prior_evaluations`, `available_tools`, `allowed_actions`.
   - Calls OpenAI/Codex API.
   - Parses response into structured `CharterOutputEnvelope`.
   - Handles timeouts and unparseable outputs gracefully.

4. **Evaluation persistence hook**
   - After successful run, write `evaluation` record via coordinator store.
   - Write `trace` records for reasoning logs (optional but recommended).

## Definition of Done

- [x] Envelope types and validation functions exist
- [x] Mock runner produces valid output envelopes for integration tests
- [x] Real runner adapter can call Codex/LLM and parse structured output
- [x] Output validation rules from 006 are enforced
- [x] Evaluation and trace persistence hooks are wired
- [x] Unit tests for envelope validation and mock runner
- [x] `pnpm typecheck` passes in `charters` package
