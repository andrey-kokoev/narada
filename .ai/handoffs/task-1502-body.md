Completed task 1502 as a governed read-only audit of in-progress and deferred task posture.

Files changed:

- `.ai/do-not-open/tasks/20260518-1502-audit-in-progress-and-blocked-task-posture.md`
- `.ai/decisions/2026-05-18-in-progress-and-deferred-task-posture-audit.md`

Summary:

- `narada task lifecycle status --format json` currently reports two in-progress tasks because 1502 is itself claimed while running.
- The residual in-progress task from the audit goal is 1443, claimed by `narada.builder2`.
- Task 1443 has no report/review/closure or checked criteria, but governed surfaces do not prove abandonment. It was left claimed.
- All 11 deferred tasks were inspected through `narada task show`.
- Deferred tasks are parked with explicit external unblock posture: live mailbox/operator proof work, route/capability/consent blockers, chapter closures waiting on prerequisites, or live registry credential/capability admission.
- No lifecycle mutations were made.

Verification:

- `narada task lifecycle status --format json` passed.
- `narada task workboard --format json` passed.
- `narada task workboard --agent narada.builder --view compact --format json` passed.
- `narada work-available --agent narada.builder --format json` passed.
- `narada task show <task> --format json` passed for 403, 404, 1443, 1445, 1447, 1451, 1455, 1466, 1467, 1468, 1472, and 1480.
- `narada task release --help` and `narada task defer --help` confirmed sanctioned mutation surfaces; neither was run.
