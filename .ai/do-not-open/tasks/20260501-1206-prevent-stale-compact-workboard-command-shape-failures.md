---
status: opened
---

# Prevent stale compact workboard command-shape failures

## Chapter

Canonical Inbox Promotions

## Goal

Make the compact workboard/next-work path command-correct so agents stop using stale task workboard --view compact and are guided to the bounded workloop surface instead.

## Context

Source inbox envelope: env_a8a280f7-5199-49ff-8fb1-5700e669fc8d

Source: agent_report:narada-andrey:architect-loop-workboard-view-snag

Envelope kind: observation

Summary: During the architect loop in narada-andrey, Kevin attempted task workboard --view compact and the CLI rejected --view as an unknown option. The bounded workloop command provided the compact facts correctly, but the remembered workboard shape caused avoidable command failure and context churn.

Evidence:
- Command failed: node D:\code\narada\packages\layers\cli\dist\main.js task workboard --cwd C:\Users\Andrey\Narada --view compact --format json -> error: unknown option --view.
- Sanctioned alternative worked: .\narada-andrey.ps1 work-next -Agent narada-andrey.Kevin -PassThru returned bounded facts with pending_reviews, in_progress, local_followups, dirty_files, and capped human_summary.

Proposal:
- Either restore/alias a compact workboard option, or make task workboard help and error output point directly to the bounded workloop/role-loop command.
- Add a regression/doctor check that common stale command shapes produce a repair command instead of only unknown option.

Recommendation: Route to CLI ergonomics/task-governance follow-up, likely adjacent to bounded workloop and task-report ergonomics.

## Required Work

0. Source summary: During the architect loop in narada-andrey, Kevin attempted task workboard --view compact and the CLI rejected --view as an unknown option. The bounded workloop command provided the compact facts correctly, but the remembered workboard shape caused avoidable command failure and context churn.
1. Read source inbox envelope env_a8a280f7-5199-49ff-8fb1-5700e669fc8d and preserve its authority context.
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

- [ ] Reproduce the stale command shape failure for task workboard --view compact or the currently remembered equivalent with a focused CLI regression.
- [ ] Choose the owning surface explicitly: either support the compact workboard alias intentionally or refuse it with a precise repair command to the bounded workloop surface.
- [ ] Update help, docs, or command output so compact workboard guidance names the real current command shape.
- [ ] Ensure bounded workloop remains the canonical compact agent/workboard read surface and is referenced in error/help text.
- [ ] Verify with focused CLI tests and one bounded human/JSON command readback that does not dump large task transcripts.
- [ ] Record residuals if any legacy command names remain accepted only as compatibility aliases.
