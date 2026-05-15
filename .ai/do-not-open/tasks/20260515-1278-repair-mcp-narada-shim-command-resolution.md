---
status: in_review
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-15T15:51:58.940Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
---

# Repair MCP Narada shim command resolution

## Chapter

Canonical Inbox Promotions

## Goal

Make Narada proper MCP subprocess calls resolve the declared Narada CLI shim in Windows PowerShell sessions without hardcoding Node, NVM, WSL, or package-manager paths.

## Context

Source inbox envelope: env_0ff460cd-336f-410d-88e6-cf3b223531d9

Source: agent_report:codex_session:2026-05-15:mcp-narada-shim-lookup-enoent

Envelope kind: observation

Summary: MCP subprocess lookup still cannot resolve the PowerShell narada shim, though the interactive shell can.

Evidence:
- MCP narada_task_work_next and narada_inbox_work_next returned spawnSync narada ENOENT; interactive PowerShell Get-Command narada resolved C:\Users\Andrey\.local\bin\narada.ps1.

Proposal:
- Repair MCP adapter PATH or command resolution so it uses the declared narada shim without hardcoded Node, NVM, WSL, or package-manager paths.

Recommendation: Route as MCP facade/runtime embodiment repair.

## Required Work

0. Source summary: MCP subprocess lookup still cannot resolve the PowerShell narada shim, though the interactive shell can.
1. Read source inbox envelope env_0ff460cd-336f-410d-88e6-cf3b223531d9 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] MCP narada_task_work_next and narada_inbox_work_next no longer fail with spawnSync narada ENOENT when the interactive shell can resolve the declared narada shim.
- [x] The repair uses declared shim/PATH command resolution rather than hardcoded Node, package-manager, NVM, or WSL paths.
- [x] Focused tests or smoke evidence cover the command-resolution path.
