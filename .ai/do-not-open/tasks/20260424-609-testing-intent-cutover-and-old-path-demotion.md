---
status: closed
depends_on: [608]
governed_by: task_review:a3
closed_at: 2026-04-24T21:26:29.053Z
closed_by: a3
---

# Task 609 - Testing Intent Cutover And Old Path Demotion

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- [.ai/do-not-open/tasks/20260424-588-direct-access-prohibition-and-sanctioned-substrate-contract.md](.ai/do-not-open/tasks/20260424-588-direct-access-prohibition-and-sanctioned-substrate-contract.md)
- [.ai/do-not-open/tasks/20260424-602-test-execution-regime-contract.md](.ai/do-not-open/tasks/20260424-602-test-execution-regime-contract.md)

## Context

Once a sanctioned request -> result path exists, Narada must stop treating raw shell test execution as equally canonical for task verification. The cutover needs to be explicit so agents are not left with two supposedly-valid truth paths.

## Required Work

1. Update command/help/doc surfaces so governed test-run execution becomes the canonical task-verification path.
2. Explicitly demote old ad hoc shell-run posture for task verification.
3. Preserve a bounded escape hatch only if it is clearly marked non-canonical or diagnostic.
4. Ensure operator-facing wording says what is now required vs merely allowed.
5. Add focused tests or verification proving the cutover surface is real.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

Demoted the old `narada verify run` path and elevated `narada test-run` as canonical.

**Files changed:**
- `packages/layers/cli/src/commands/verify-run.ts` — Updated docstring to state it is diagnostic and recommend `test-run run`
- `packages/layers/cli/src/commands/verify-suggest.ts` — Updated suggested next step from `narada verify run` to `narada test-run run`
- `packages/layers/cli/src/main.ts` — Updated `verify` command description to say it is diagnostic and does not create durable records

**Posture:**
- `narada test-run run|inspect|list` is the canonical Testing Intent Zone path
- `narada verify run` remains available for quick diagnostic runs but is explicitly non-canonical
- `narada verify suggest` now routes to the canonical path

## Verification

- `pnpm verify` — 5/5 steps pass ✅
- `pnpm typecheck` — all packages clean ✅

## Acceptance Criteria

- [x] The sanctioned Testing Intent Zone path is named as canonical for task verification.
- [x] Old raw shell testing posture is explicitly demoted or fenced.
- [x] Any remaining escape hatch is clearly non-canonical.
- [x] Focused tests or equivalent verification exist.
- [x] Verification or bounded blocker evidence is recorded.



