# Task 149: Materialize 124-N Rename Agent Traces Conversation-Id To Context-Id

## Source

Derived from Task 124-N in `.ai/tasks/20260418-124-comprehensive-semantic-architecture-audit-report.md`.

## Why

`conversation_id` in generic trace storage leaks mailbox-era semantics into a kernel-level surface.

## Goal

Rename `agent_traces.conversation_id` to `context_id` and align all code/docs accordingly.

## Deliverables

- schema/store/type rename completed
- trace readers/writers updated
- mailbox-era wording removed from generic trace surfaces

## Definition Of Done

- [x] generic trace storage uses `context_id`
- [x] no generic trace surface still teaches `conversation_id`
- [x] migrations/tests/docs are updated

## Execution Notes

### Files changed

1. **`packages/layers/control-plane/src/agent/traces/types.ts`**
   - Renamed `AgentTrace.conversation_id` → `context_id`
   - Renamed `AgentTraceStore.readByConversation(conversationId)` → `readByContextId(contextId)`
   - Updated doc comments to use `context_id` and "context-level navigation"

2. **`packages/layers/control-plane/src/agent/traces/store.ts`**
   - Updated `rowToAgentTrace` to read `context_id` from row
   - Updated schema SQL: `conversation_id text not null` → `context_id text not null`
   - Renamed index: `idx_agent_traces_conversation` → `idx_agent_traces_context`
   - Updated `writeTrace` insert SQL and parameter binding
   - Renamed `readByConversation` → `readByContextId` and updated SQL condition

3. **`packages/layers/control-plane/src/agent/traces/schema.sql`**
   - Updated column name, index name, and comments

4. **`packages/layers/control-plane/test/unit/agent/traces/store.test.ts`**
   - Updated all 31 occurrences of `conversation_id` → `context_id`
   - Updated all `readByConversation` → `readByContextId`
   - Updated local variable `byConversation` → `byContext`

5. **`packages/layers/control-plane/AGENTS.md`**
   - Updated Trace System section: secondary references now list `context_id` instead of `conversation_id`

### What was NOT changed

- General `conversation_id` references in `00-kernel.md`, `02-architecture.md`, `04-identity.md`, `09-troubleshooting.md` were left intact — those describe the mailbox vertical's thread identifier concept, not the trace storage column.
- Old task spec files (e.g., `.ai/tasks/20260413-010-...`) were not modified per task-file policy.

## Verification

- `pnpm --filter=@narada2/control-plane typecheck` — passes
- `pnpm --filter=@narada2/control-plane build` — passes
- `pnpm --filter=@narada2/control-plane test:unit` — 772 tests passed (including 12 trace store tests)
