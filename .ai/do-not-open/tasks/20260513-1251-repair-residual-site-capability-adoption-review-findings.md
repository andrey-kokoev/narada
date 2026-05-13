---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-13T01:47:04.668Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-13T01:47:05.233Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Repair residual Site capability adoption review findings

## Chapter

narada-proper-site-capability-adoption

## Goal

Repair review findings from the residual Site capability adoption implementation without broadening live authority claims.

## Context

Follow-up to commit af411858. Review found candidate MCP descriptors placed in mcp_surfaces, unstable source_residual anchors, incomplete audit changed_files, and one semantic mismatch in missing-capabilities wording.

## Required Work

Move non-live candidate MCP descriptors out of mcp_surfaces into a clearly non-runtime candidate registry shape; update source residual references to stable section labels; make audit changed_files complete or accurately scoped; tighten missing-capabilities wording for source Site migration/lift.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] mcp_surfaces contains only live/admitted runtime surfaces
- [x] candidate MCP surfaces are clearly non-runtime
- [x] audit evidence accurately represents the changed file scope
- [x] no new live authority is claimed
