---
status: opened
---

# Fix roster assign --no-claim lifecycle mutation

## Chapter

Task Roster Lifecycle Semantics

## Goal

Make narada task roster assign --no-claim obey its name by updating assignment/roster intent without claiming or mutating task lifecycle to claimed.

## Context

Observed defect:

```bash
narada task roster assign 1096 --agent builder --no-claim --format json
```

returned:

```json
{
  "status": "ok",
  "agent": "builder",
  "agent_status": "working",
  "task": 1096,
  "claimed": true
}
```

and the workboard showed task `1096` as `claimed`. This violates the explicit `--no-claim` option and makes it impossible for Architect to route work to Builder without also mutating lifecycle state.

The help currently says:

```text
--no-claim     Skip claiming the task (exceptional: only for planning)
```

So this is not an ambiguity; it is a command behavior bug.

## Required Work

1. Add a focused regression proving that `narada task roster assign <task> --agent <agent> --no-claim` does not transition an `opened` task to `claimed`.
2. Fix the roster assignment implementation so `--no-claim` updates only the roster/assignment projection intended by that command path and leaves task lifecycle status unchanged.
3. Preserve documented default behavior when `--no-claim` is omitted: the command may still claim by default if that remains the accepted roster admission posture.
4. Ensure JSON output reports `claimed: false` when `--no-claim` is used and no claim occurs.
5. Ensure human output does not imply claim occurred when `--no-claim` was used.
6. Cover at least:
   - opened task + `--no-claim`;
   - opened task without `--no-claim`;
   - already-claimed task + `--no-claim`;
   - JSON `claimed` flag.
7. If implementation reveals that roster assignment and lifecycle claim are still too tightly coupled, preserve the minimal fix in this task and record any larger decomposition as a follow-up observation/task.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Reproduce the current defect with a focused regression: narada task roster assign <task> --agent <agent> --no-claim must not transition an opened task to claimed.
- [ ] Fix the command implementation so --no-claim updates roster/assignment projection only and leaves lifecycle status unchanged.
- [ ] Preserve the existing default behavior without --no-claim: assigning may claim when that is the documented default path.
- [ ] JSON and human output must accurately report claimed:false when --no-claim is used.
- [ ] Add regression tests covering opened task, already claimed task, and output claimed flag behavior.
- [ ] Update help text or docs if needed so --no-claim semantics are explicit.
