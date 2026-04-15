# Phase A Task — Tool Execution Integration

## Objective

Wire `ToolRunner` into the daemon dispatch loop so that tool requests from the charter runtime are executed and durably recorded.

## Changes

1. `packages/exchange-fs-sync-daemon/src/service.ts`
   - After `deps.charterRunner.run(envelope)`, check `output.tool_requests`
   - Instantiate `ToolRunner` with `phaseAToolDefinitions`
   - Execute each validated tool request and persist results via `coordinatorStore.insertToolCallRecord`
   - Log tool execution outcomes

## Acceptance Criteria

- `pnpm typecheck` passes in `exchange-fs-sync-daemon`
- Existing daemon tests pass
- Tool execution code is present in the dispatch path
