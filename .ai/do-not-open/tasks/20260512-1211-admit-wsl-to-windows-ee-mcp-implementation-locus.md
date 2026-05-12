---
status: closed
deferred_by: narada.architect
deferred_at: 2026-05-12T18:18:52.143Z
defer_reason: Implementation request requires WSL-side carrier authority, but current active embodiment is Windows D:\code\narada; raw WSL-to-Windows shell fallback remains forbidden.
unblock_condition: Admit a WSL-side Narada proper carrier rooted at /home/andrey/src/narada with typed Windows PowerShell transport boundary for ee-mcp.windows-powershell-from-wsl.
continuation_packet:
  kind: task_unblock
  unblocked_by: narada.architect
  unblocked_at: 2026-05-12T19:33:01.753Z
  evidence: operator_direct:2026-05-12:windows-native-migration-selected
  rationale: Operator superseded the WSL-to-Windows carrier premise by selecting a full Windows-native setup posture; reopen only to record superseded closure.
  previous_unblock_condition: Admit a WSL-side Narada proper carrier rooted at /home/andrey/src/narada with typed Windows PowerShell transport boundary for ee-mcp.windows-powershell-from-wsl.
unblocked_by: narada.architect
unblocked_at: 2026-05-12T19:33:01.753Z
unblock_evidence: operator_direct:2026-05-12:windows-native-migration-selected
unblock_rationale: Operator superseded the WSL-to-Windows carrier premise by selecting a full Windows-native setup posture; reopen only to record superseded closure.
closed_at: 2026-05-12T19:33:37.909Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Admit WSL-to-Windows EE-MCP implementation locus

## Chapter

Canonical Inbox Promotions

## Goal

Route the WSL-to-Windows EE-MCP request into Narada proper governance and identify the exact implementation carrier/locus required before code execution.

## Context

Source inbox envelope: env_a01a78a7-a0a4-4500-bd9e-6773dbadde5a

Source: agent_report:narada-andrey:task-96:wsl-to-windows-ee-mcp-request

Envelope kind: observation

Summary: narada-andrey task 96 deliberately left WSL-to-Windows typed crossing as planned_missing_capability. Since narada.architect operates from WSL, please take ownership of designing and implementing the WSL-to-Windows EE-MCP adapter or route it into Narada proper governance.

Evidence:
- Windows-to-WSL EE-MCP now has explicit read-only Narada command ids in narada-andrey.
- OSM to narada.architect returned fallback_notified because no visible/live binding was available.
- Reverse crossing should not be faked from Windows; raw powershell.exe/cmd.exe from WSL must remain forbidden outside a declared EE-MCP implementation locus.

Proposal:
- Create governed WSL-side implementation or doctrine task for ee-mcp.windows-powershell-from-wsl.
- Expose doctor output, missing-capability refusal, and tests mirroring the Windows-to-WSL EE-MCP discipline.

Recommendation: Treat this as WSL-side architect work; keep narada-andrey's declaration as planned_missing_capability until the sanctioned adapter exists.

## Required Work

0. Source summary: narada-andrey task 96 deliberately left WSL-to-Windows typed crossing as planned_missing_capability. Since narada.architect operates from WSL, please take ownership of designing and implementing the WSL-to-Windows EE-MCP adapter or route it into Narada proper governance.
1. Read source inbox envelope env_a01a78a7-a0a4-4500-bd9e-6773dbadde5a and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Target locus assessment: the active execution embodiment is Windows `D:\code\narada`, not a WSL-side Narada proper carrier.
- Source envelope `env_a01a78a7-a0a4-4500-bd9e-6773dbadde5a` asks specifically for a WSL-side implementation of `ee-mcp.windows-powershell-from-wsl`.
- No raw WSL-to-Windows shell fallback is admitted here. Implementing or testing a WSL-originating adapter from the Windows embodiment would collapse the requested crossing and would falsely claim WSL-side execution.
- Smallest missing admission/surface: an admitted WSL-side Narada proper carrier rooted at canonical `/home/andrey/src/narada`, with a typed Windows PowerShell transport boundary and explicit denial of ad hoc `powershell.exe`/`cmd.exe` fallback outside that carrier.
- Decision: task is routed into Narada proper governance and deferred pending that carrier. No package/source mutation was performed.
- Supersession update, 2026-05-12: Operator selected a full Windows-native setup posture for Narada proper. That supersedes the earlier WSL-to-Windows EE-MCP premise for current work. The WSL-side adapter remains not implemented and not needed for the Windows-native path. If a future WSL runtime locus is explicitly admitted, reopen as a new task with a current authority basis.

## Verification

- `narada inbox task env_a01a78a7-a0a4-4500-bd9e-6773dbadde5a --by narada.architect ... --format json` created task 1211 and preserved source envelope context.
- `narada task lifecycle status --format json` before promotion showed clean allocation posture through task 1210.
- `narada task unblock 1211 --agent narada.architect --evidence "operator_direct:2026-05-12:windows-native-migration-selected" ...` reopened the deferred task only to record superseded closure.

## Acceptance Criteria

- [x] Narada proper records that raw WSL-to-Windows shell fallback remains forbidden.
- [x] The task names the missing WSL-side carrier or implementation surface required before adapter implementation.
- [x] No Windows-side implementation is falsely claimed as WSL-side execution.
- [x] Operator-selected Windows-native posture supersedes this WSL-side implementation request for current Narada proper work.
