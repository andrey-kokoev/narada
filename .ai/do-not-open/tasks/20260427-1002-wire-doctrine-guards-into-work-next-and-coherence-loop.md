---
status: opened
depends_on: [992, 997, 1001]
amended_by: architect
amended_at: 2026-04-27T21:49:43.106Z
---

# Wire doctrine guards into work-next and coherence loop

## Chapter

telos-aligned-doctrine-guards

## Goal

Use `work-next` and coherence scan to keep doctrine implementation aligned with Narada telos without creating an infinite self-grooming loop.

## Context

The doctrine implementation tasks add scanners, mutation evidence, and authority preflight. The final chapter guard is to make ordinary agent routing notice those blockers or warnings before recommending mutation work, while preserving the summon/configure-event self-maintenance model.

## Required Work

1. Wire doctrine-guard status into `work-next` so mutation work can surface preflight blockers or warnings before execution.
2. Wire coherence scan findings for authority inversion, missing mutation evidence, and wrong-locus mutation risk.
3. Preserve cooldowns, deduplication, non-repairing defaults, and bounded output.
4. Ensure actionable findings include exact next commands and task/inbox references where available.
5. Add tests proving no infinite resubmission for the same finding and no hidden mutation.

## Non-Goals

- Do not create an always-on coherence daemon.
- Do not auto-repair findings by default.
- Do not let doctrine warnings overwhelm concrete runnable work when no blocker exists.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] `work-next` can surface doctrine-guard blockers or preflight warnings before recommending mutation work.
- [ ] Coherence scan submits bounded observations/task candidates for authority inversion, missing mutation evidence, and wrong-locus mutation risk.
- [ ] Loop remains summon/configure-event driven, cooldown-bound, and non-repairing by default.
- [ ] Tests prove no infinite resubmission for the same finding and that actionable findings include exact next commands.
- [ ] `pnpm verify` passes.
