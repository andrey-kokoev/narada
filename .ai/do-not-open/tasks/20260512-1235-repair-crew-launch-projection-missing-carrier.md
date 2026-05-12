---
status: closed
closed_at: 2026-05-12T23:27:18.610Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Repair crew launch projection missing carrier

## Goal

Repair crew launch projection so Narada proper does not emit launch command intent pointing at a missing carrier.

## Context

Doctrine-grounded review found agent-launch-affordance-materializer emits tools/operator-surface-carriers/windows-glue/Start-CodexResumeOperatorSurfaces.ps1, but that path does not exist in Narada proper.

## Required Work

1. Add a descriptor-only carrier stub or adjust projection to an existing admitted path so projected launch command intent is not dangling. 2. Preserve no live launch, no native shell fallback, no PC-locus mutation, and no operator-surface runtime copying. 3. Add/update tests and verify.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Repaired `agent-launch-affordance-materializer.mjs` so projected launch intent no longer names a missing executable PowerShell script as a command.
- Added descriptor-only carrier artifact: `tools/operator-surface-carriers/windows-glue/Start-CodexResumeOperatorSurfaces.descriptor.json`.
- Projection now emits `launch_command_intent.posture=descriptor_only`, `descriptor_path`, and `execution_admitted=false`.
- No live launch, native shell fallback, PC-locus mutation, runtime binding mutation, or operator-surface runtime copying was admitted.

## Verification

- `Get-Content tools\operator-surface-carriers\windows-glue\Start-CodexResumeOperatorSurfaces.descriptor.json | ConvertFrom-Json`
  - Result: JSON valid.
- `node --test tools/operator-surface-carriers/agent-launch-affordance-materializer.test.mjs`
  - Result: 4 tests passed, including descriptor path existence/posture check.

## Acceptance Criteria

- [x] Projected command path exists or is explicitly descriptor-only with non-execution posture
- [x] Tests cover projection command path existence/posture
