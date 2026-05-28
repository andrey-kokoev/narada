---
status: closed
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-15T15:51:58.940Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
no_continuation_needed_rationale: Concrete MCP shim-resolution repair is complete; facade wording names the affected surface, not a deferred prototype.
closed_at: 2026-05-15T20:46:12.014Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
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

- Verified the Narada proper MCP subprocess command path uses declared shim/PATH resolution through `packages/narada-proper-mcp/src/commands/process.ts`.
- Confirmed `localNaradaCliEnvironment` prepends the target workspace `node_modules/.bin` directory to PATH without hardcoding Node, package-manager, NVM, or WSL paths.
- Confirmed `localNaradaCliInvocation` resolves Windows `narada.ps1` shims through PATH and invokes them through PowerShell with `-NoLogo -NoProfile -ExecutionPolicy Bypass -File`.
- Confirmed `.cmd`/`.bat` shims are routed through `ComSpec`/`cmd.exe`, and the target workspace shim is preferred over later PATH entries.
- No additional source change was needed in this pass; this task needed repaired evidence after the prior report left scaffold placeholders.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` passed with 7 tests.
- Test coverage includes `projects the target workspace bin directory onto the Narada CLI PATH`, `resolves a PowerShell Narada shim through PATH on Windows`, and `prefers the target workspace Narada shim over later PATH entries`.

## Acceptance Criteria

- [x] MCP narada_task_work_next and narada_inbox_work_next no longer fail with spawnSync narada ENOENT when the interactive shell can resolve the declared narada shim.
- [x] The repair uses declared shim/PATH command resolution rather than hardcoded Node, package-manager, NVM, or WSL paths.
- [x] Focused tests or smoke evidence cover the command-resolution path.
