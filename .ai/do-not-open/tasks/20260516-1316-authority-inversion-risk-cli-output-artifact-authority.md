---
status: closed
closed_at: 2026-05-16T00:52:00.351Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: cli-output-artifact-authority

## Chapter

Canonical Inbox Promotions

## Goal

Command authors can still add surfaces that produce unbounded output or bypass formatter/admission helpers.

## Context

Source inbox envelope: env_d8934c69-cfea-41aa-90e8-eebeae94fc63

Source: system_observation:coherence-scan:authority-inversion-cli-output-artifact-authority

Envelope kind: task_candidate

Summary: Command authors can still add surfaces that produce unbounded output or bypass formatter/admission helpers.

Evidence:
- visible_artifact=Large CLI stdout/stderr transcripts
- hidden_authority=CLI output must pass bounded output admission; long transcripts are artifacts to store or summarize, not automatically admitted chat evidence.
- current_guard=CLI output admission guard and finite/interactive/long-lived output helpers.
- candidate_tasks=992,993

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-cli-output-artifact-authority
Prior related envelopes: env_aceb1d91-ab00-40fd-bafc-5c1bbe0f94d0

## Required Work

0. Source summary: Command authors can still add surfaces that produce unbounded output or bypass formatter/admission helpers.
1. Read source inbox envelope env_d8934c69-cfea-41aa-90e8-eebeae94fc63 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_d8934c69-cfea-41aa-90e8-eebeae94fc63 from mutation evidence. The authority concern is CLI output admission: raw long transcripts are artifacts to summarize/store, not automatically admitted command truth.
- Extended the authority-inversion coherence scanner with `checkCliOutputAdmissionBypass`, which inspects changed CLI source files for direct stdout/stderr APIs such as `console.log`, `console.error`, and `process.stdout.write`.
- The finding records only bounded evidence: path, pattern code, and `raw_output_recorded=false`. It does not copy raw command output or source snippets into the finding.
- Fixed changed-file collection so untracked directories reported by Git are expanded into bounded file paths; otherwise a newly added command file under an untracked directory can evade scanner checks.
- Added a focused test proving a changed CLI command with direct `console.log` is flagged and the raw transcript string is not admitted into finding output.
- Files changed for this task: `packages/layers/cli/src/commands/coherence-scan.ts`, `packages/layers/cli/test/commands/coherence-scan.test.ts`, `.ai/do-not-open/tasks/20260516-1316-authority-inversion-risk-cli-output-artifact-authority.md`.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/coherence-scan.test.ts` passed: 10 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_d8934c69-cfea-41aa-90e8-eebeae94fc63 is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
