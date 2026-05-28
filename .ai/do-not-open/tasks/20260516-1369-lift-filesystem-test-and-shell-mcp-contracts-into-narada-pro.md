---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on MCP coverage tasks 1370-1371; no additional continuation is required for the execution-contract slice.
closed_at: 2026-05-16T03:21:01.568Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Lift filesystem test and shell MCP contracts into Narada proper packages

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Turn existing Narada proper descriptor packages for filesystem/test/shell-like execution into coherent target-local MCP contracts with clear execution posture.

## Context

Narada proper has packages/mcp-shell-windows and packages/mcp-test-windows. narada-andrey has live filesystem, test, and shell MCP servers with path boundaries, approved tests, audit logging, payload refs, break-glass records, and Git closeout helpers.

## Required Work

1. Define Narada proper filesystem MCP posture: root-bounded read/glob/grep/media and narrowly admitted write/replace with audit and path policy.
2. Define Narada proper test MCP posture: approved test registry, identity binding, bounded timeout/output, and structured evidence without importing source pass/fail history.
3. Define Narada proper shell/EE-MCP posture: CEIZ-mediated command intent first, shell MCP as policy-aware execution surface only where admitted, and native shell as break-glass last resort.
4. Implement the next smallest package slice with tests, or produce explicit refusal records for live execution if canonical CEIZ ownership is not ready.

## Non-Goals

- Do not grant arbitrary shell access through MCP.
- Do not import narada-andrey allowlists, audit logs, or PC runtime state as Narada proper authority.
- Do not bypass CEIZ, task lifecycle, RPIZ, or publication preflight.

## Execution Notes

- Added `packages/narada-proper-mcp/src/execution-contracts.ts`.
- Defined filesystem MCP posture for root-bounded read/glob/grep/media and write/replace only through audit/path policy/canonical mutation evidence.
- Defined test MCP posture requiring approved test registry, identity binding, bounded timeout/output, and no source pass/fail history import.
- Defined shell/EE-MCP posture as CEIZ-mediated command intent first; shell MCP is policy-aware execution only after admission; native shell is break-glass last resort.
- Live filesystem/test/shell execution is explicitly refused until canonical owners are ready.
- Added validation tests for authority boundaries and break-glass posture.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 15 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Filesystem, test, and shell/EE-MCP contracts have explicit authority boundaries and tests.
- [x] Live execution is either canonically routed or explicitly refused with next-step guidance.
- [x] Break-glass shell posture is recorded as exceptional, scoped, time-bounded, and operator-authorized.
