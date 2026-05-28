---
status: closed
no_continuation_needed_rationale: Task scope completed the target-local Narada proper MCP infrastructure rebuild with tests and launch evidence; no separate continuation task is required for this bounded rebuild.
closed_at: 2026-05-15T17:05:44.336Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
---

# Rebuild Narada proper MCP infrastructure

## Chapter

mcp-infrastructure

## Goal

Replace the coupled Narada proper agent-facing MCP runtime with a target-local MCP package and launcher path.

## Context

Source directive: .narada/inbox/external-handoffs/20260515-operator-directive-mcp-infrastructure-rebuild.md. Target locus: Narada proper at D:/code/narada.

## Required Work

Inventory existing Narada proper MCP runtime paths; introduce an explicit target-local MCP surface package/command; update agent-start Codex config and launch evidence to use it; quarantine the old CLI narada-mcp facade as compatibility; update capabilities/audit evidence; add focused tests for parsing, binding, context propagation, tools/list, hydrate, read-only first-slice tool, source import refusal, and shell break-glass posture.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Added a target-local MCP package at `packages/narada-proper-mcp`.
- Updated Narada proper agent-start launch evidence and generated Codex config to use `node --import tsx packages/narada-proper-mcp/src/main.ts` instead of the CLI `narada-mcp` facade.
- Bound generated Codex home/config paths to the requested agent identity, including `narada.builder`, rather than inheriting an architect default.
- Registered `narada-proper.surface.agent-facing-mcp.v1` in `.narada/capabilities/mcp-surfaces.json` and demoted the old CLI `narada-mcp` path to compatibility-only candidate status.
- Added operator directive intake evidence at `.narada/inbox/external-handoffs/20260515-operator-directive-mcp-infrastructure-rebuild.md` and pending handoff/admission ledger entries.
- Preserved default native `shell_tool` disablement and explicit break-glass reporting in launcher output.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed.
- `node --test tools/agent-start/start-agent.test.mjs` passed.
- `.\narada.ps1 agent-start -Agent narada.builder -Runtime codex -DryRun -Json` reported `CODEX_HOME` and `codex_config_path` under `narada-builder`.
- `node --import tsx packages/narada-proper-mcp/src/main.ts ... tools/list` returned the expected Narada proper MCP tool list.
- `.\narada.ps1 agent-start -Agent narada.architect -Runtime codex -DryRun -Json` reported `@narada2/narada-proper-mcp`, `depends_on_cli_dist: false`, and default `--disable shell_tool`.

## Acceptance Criteria

- [x] Codex launch evidence and config name a new MCP command path outside packages/layers/cli/dist.
- [x] The old CLI narada-mcp path is compatibility-only and no longer required for Narada proper agent-facing launch.
- [x] Focused tests cover the required MCP and launch behavior.
