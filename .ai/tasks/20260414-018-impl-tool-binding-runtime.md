# Implementation — Tool Binding Runtime

## Mission

Implement tool catalog resolution, tool request validation, tool runner execution, and durable `tool_call_records` logging.

## Scope

Primary targets:
- `packages/charters/src/tools/` (new directory)
- `packages/charters/src/tools/resolver.ts`
- `packages/charters/src/tools/runner.ts`
- `packages/charters/src/tools/validation.ts`
- `packages/exchange-fs-sync/src/coordinator/store.ts` (tool call record writes)

## Consumes

- `20260414-007-assignment-agent-c-tool-binding-runtime.md`
- `20260414-004-coordinator-durable-state-v2.md`
- `20260414-006-assignment-agent-b-charter-invocation-v2.md`

## Dependencies

Depends on:
- `20260414-012-impl-coordinator-schema-and-store-v2`
- `20260414-017-impl-charter-runtime-envelope` (needs tool result return path)

Blocks:
- `20260414-014-impl-foreman-core` (validation rules need tool request checking)
- `20260414-019-impl-replay-recovery-tests`

## Tasks

1. **Catalog resolution**
   - `resolveToolCatalog(mailbox_id, charter_id, thread_context): RuntimeCapabilityEnvelope`
   - Read `CoordinatorConfig.tool_definitions` and `mailbox_bindings`.
   - Apply dynamic foreman overrides (if any).
   - Freeze catalog into the charter invocation envelope.

2. **Tool request validation**
   - Implement the 7 validation rules from 007:
     - catalog membership
     - enabled check
     - approval gate
     - read-write policy
     - schema validation
     - budget check
     - arg sanitization

3. **Tool runner**
   - `executeToolCall(request, envelope): ToolResult`
   - Spawn subprocess or make HTTP call based on `ToolDefinition`.
   - Enforce `timeout_ms` and `SideEffectBudget`.
   - Kill/abort on timeout.

4. **Tool call record persistence**
   - Write `tool_call_records` row before/after execution.
   - Status values must match 004b-corrected enum: `pending`, `success`, `timeout`, `permission_denied`, `error`, `budget_exceeded`.

5. **Safety matrix enforcement**
   - Read-only tools: no approval required by default.
   - Approval-gated tools: block until approved (v1 may auto-approve).
   - Write tools: no automatic retry on partial side effect.

## Definition of Done

- [x] Catalog resolution produces correct `RuntimeCapabilityEnvelope`
- [x] All 7 validation rules are implemented and unit tested
- [x] Tool runner executes external tools with timeout enforcement
- [x] Tool call records are durable and queryable
- [x] Budget exhaustion (`max_tool_calls`, `total_timeout_ms`) is enforced
- [x] Safety matrix from 007 is covered by tests
- [x] `pnpm typecheck` passes
