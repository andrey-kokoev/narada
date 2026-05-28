---
status: confirmed
amended_by: narada.architect
amended_at: 2026-05-18T15:32:03.522Z
closed_at: 2026-05-18T15:39:41.052Z
closed_by: narada.builder
governed_by: task_close:narada.builder
closure_mode: peer_reviewed
confirmed_by: narada.architect
confirmed_at: 2026-05-18T16:02:07.016Z
---

# Repair Narada proper MCP role policy drift in config.json

## Chapter

MCP Materialized Admissions

## Goal

Repair Narada proper MCP role policy drift in config.json.

## Context

Materialized from MCP-admitted task candidate local-config-mcp-policy-drift-20260518.

Source Site: narada-proper

Source ref: operator:2026-05-18-config-json-mcp-policy-drift

Received at: 2026-05-18T15:28:24.774Z

Summary:
Align Narada proper architect MCP allowed_tools in config.json with implemented/read-only startup and doctrine grounding surfaces, verify against registry/runtime, and propose options to make future implementation-policy drift impossible or mechanically detected.

Evidence refs:
- config.json
- operator:2026-05-18-config-json-mcp-policy-drift
- packages/narada-proper-mcp/src/server.ts
- packages/narada-proper-mcp/src/surface-registry.ts

## Required Work

1. Preserve MCP admission context from candidate local-config-mcp-policy-drift-20260518.
2. Execute the work described by the materialized title and summary under the governed Narada task lifecycle.
3. Verify the result with focused evidence appropriate to the changed surface.
4. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Aligned local Narada proper architect MCP role policy in config.json with the live canonical Narada proper MCP tool surface. Added missing canonical tools for startup, hydration, doctrine grounding, task materialization/read, Site Registry relation planning, and typed/staged inbox submission. Removed the stale site_task_lifecycle.open_admitted_task allowlist entry because that tool is not exposed by the MCP server.

Added a focused package test guard in packages/narada-proper-mcp/test/narada-proper-mcp.test.ts. The guard reads the local Site config, rejects allowlisted tools that are not exposed by NARADA_MCP_TOOLS, and requires the architect narada-proper allowlist to match the canonical non-alias MCP tool names. This catches local config drift whenever the package test suite runs in this Site.

Observed that config.json is gitignored local Site config, so the stronger structural fix should move from manual config maintenance to generated/projection-validated client policy derived from the MCP surface registry.

## Verification

- pnpm --filter @narada2/narada-proper-mcp test: passed, 29 tests.
- pnpm --filter @narada2/narada-proper-mcp typecheck: passed.
- pnpm --filter @narada2/narada-proper-mcp build: passed.
- narada_task_read 1508: confirmed the governed task exists and is claimed by narada.architect.

## Acceptance Criteria

- [x] MCP admission local-config-mcp-policy-drift-20260518 is represented as a governed Narada task.
- [x] The materialized task is visible through canonical task lifecycle/work-next surfaces.
