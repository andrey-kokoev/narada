---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-05-02T00:56:20.361Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-02T00:56:20.972Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Implement WSL-to-Windows EE-MCP adapter

## Chapter

Canonical Inbox Promotions

## Goal

Design and implement the WSL-side typed crossing for executing admitted Windows EE-MCP commands without raw powershell.exe/cmd.exe shortcuts.

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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Preserve the narada-andrey source context and authority boundary from env_a01a78a7-a0a4-4500-bd9e-6773dbadde5a.
- [x] Define the WSL-to-Windows EE-MCP adapter locus, command id grammar, refusal posture, and doctor/readiness output.
- [x] Implement the smallest Narada-proper CLI/service surface needed for WSL-side missing-capability detection and sanctioned adapter execution or refusal.
- [x] Add focused tests mirroring Windows-to-WSL EE-MCP discipline, including refusal when no sanctioned adapter is configured.
- [x] Verify through TIZ, close through governed lifecycle, commit, and push.
