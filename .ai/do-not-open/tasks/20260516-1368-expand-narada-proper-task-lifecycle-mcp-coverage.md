---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on MCP coverage tasks 1369-1371; no additional continuation is required for the task-read expansion slice.
closed_at: 2026-05-16T03:20:33.014Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Expand Narada proper task lifecycle MCP coverage

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Close the gap between Narada proper task MCP exposure and the canonical task lifecycle command surface.

## Context

Narada proper MCP currently exposes limited task lifecycle tools. narada-andrey task lifecycle MCP exposes list, show/read, roster, claim, continue, unclaim, next, workboard, obligations, inspect, evidence preflight/admission, prove criteria, finish, close, search, related, defer/un-defer, reopen, review, observation, bridge/inbox targeting, create, routing, recurring tasks, test tool, and run tests.

## Required Work

1. Select the first safe expansion slice from the coverage matrix, prioritizing read/show/inspect/workboard/obligations/evidence-preflight before mutating tools.
2. Delegate each MCP tool to the canonical Narada proper command or service with the same authorization, refusal, and evidence behavior as CLI.
3. Use payload_ref for task creation or large report-like inputs where inline definitions would be unsafe.
4. Add tests proving no direct SQLite shortcuts, no review/finish authority bypass, and no cross-Site mutation.

## Non-Goals

- Do not reimplement task lifecycle as a second authority model inside MCP.
- Do not expose mutating task tools before the canonical service path and evidence are proven.

## Execution Notes

- Selected the first safe expansion slice from the coverage matrix: read-only canonical task read.
- Added `narada_task_read` to the Narada proper MCP tool list.
- Delegated `narada_task_read` to the canonical `narada task read <task_number> --format json` CLI path through `runNaradaJson`; no direct SQLite shortcut was introduced.
- Added task read to the MCP surface registry read-only classification.
- Added stdio MCP test using a target-local Narada shim, proving canonical command delegation, no cross-Site mutation, and no direct task-lifecycle DB leakage.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 13 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Narada proper task lifecycle MCP exposes a larger, tested, canonical subset.
- [x] Read-only and mutating tools are clearly classified.
- [x] MCP task lifecycle behavior matches CLI/service authorization and evidence posture.
