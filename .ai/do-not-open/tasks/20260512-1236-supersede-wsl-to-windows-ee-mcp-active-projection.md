---
status: closed
closed_at: 2026-05-12T23:39:19.800Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Supersede WSL-to-Windows EE-MCP active projection

## Goal

Remove or demote active WSL-to-Windows EE-MCP MCP exposure after Windows-native posture superseded that crossing.

## Context

Doctrine review found narada_ee_mcp_doctor and narada_ee_run still exposed in the Narada MCP tool list even though task 1211 records that WSL-to-Windows EE-MCP was superseded by the Windows-native setup posture. This is projection incoherence, not an execution escape.

## Required Work

1. Inspect MCP server tool registration and tests. 2. Demote the WSL-to-Windows EE-MCP tools to an explicit legacy/superseded diagnostic or remove them from active tools. 3. Preserve refusal of raw WSL/Windows shell fallback. 4. Update tests and verify focused MCP server tests.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Updated `packages/layers/cli/src/mcp-server.ts` so `narada_ee_mcp_doctor` reports `superseded_by_windows_native` and `current_posture=not_current_narada_proper_path`.
- Removed `narada_ee_run` from the advertised MCP `tools/list` surface.
- Preserved compatibility handling for direct `narada_ee_run` calls, but it now returns `superseded_by_windows_native` with `execution_attempted=false`.
- Preserved raw Windows shell fallback refusal and did not add any WSL-to-Windows execution carrier.

## Verification

- `pnpm --dir packages/layers/cli exec vitest run test/commands/mcp-server.test.ts`
  - Result: 22 tests passed.
- `pnpm --dir packages/layers/cli typecheck`
  - Result: passed.

## Acceptance Criteria

- [x] MCP tool exposure no longer advertises a live/current WSL-to-Windows EE-MCP path
- [x] Any remaining diagnostic reports superseded/not-current posture
