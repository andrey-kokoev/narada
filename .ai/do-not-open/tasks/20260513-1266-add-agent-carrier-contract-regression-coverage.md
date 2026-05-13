---
status: confirmed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T23:33:40.217Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T23:33:41.302Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Add Agent Carrier contract regression coverage

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260513-1264-1266-agent-carrier-factorization.md

## Goal

Add focused regression coverage proving the concept and launch packet contract preserve the carrier factorization and anti-collapse rules.

## Context

The carrier abstraction arose from repeated launch and permission drift. A lightweight test should prevent future edits from dropping Narada-native carrier, startup command, native shell disablement, MCP approval, or locus split requirements.

## Required Work

1. Add a focused docs test for the Agent Carrier concept and launch packet contract.
2. Assert required carrier kinds, launch packet fields, anti-collapse rules, and locus responsibilities.
3. Run the focused test and record verification evidence.

## Non-Goals

- Do not run the full test suite unless focused coverage indicates broader risk.
- Do not test live Codex or Kimi processes in this task.
- Do not require PC Site runtime availability for this contract test.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Focused test coverage fails if Narada-native carrier is removed from the contract.
- [x] Focused test coverage checks startup command, MCP approval, native execution policy, and launch result fields.
- [x] Verification output records the focused test command and pass result.
