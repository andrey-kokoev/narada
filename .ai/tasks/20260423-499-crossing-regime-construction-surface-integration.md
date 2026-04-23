---
status: closed
created: 2026-04-23
depends_on: [495, 497]
closed_at: 2026-04-23T18:10:44.647Z
closed_by: codex
governed_by: task_close:codex
---

# Task 499 - Crossing Regime Construction Surface Integration

## Context

Crossing regime becomes first-class only when Narada's construction surfaces use it while shaping new work. Otherwise declarations and lint live off to the side and the operator/agent still creates new boundaries by intuition.

## Goal

Integrate crossing-regime declaration into Narada's task/chapter/construction surfaces in the smallest useful way.

## Read First

- `.ai/tasks/20260423-495-crossing-regime-declaration-contract.md`
- `.ai/tasks/20260423-497-crossing-regime-review-and-lint-gate.md`
- `.ai/task-contracts/agent-task-execution.md`
- `docs/governance/task-graph-evolution-boundary.md`
- `AGENTS.md`
- `SEMANTICS.md` §2.15

## Scope

This task owns construction-surface integration only:

- task shaping,
- chapter shaping,
- task-contract guidance,
- and other surfaces that influence how new work is framed.

It does not own runtime execution or broad ontology refactors.

## Required Work

1. Decide where crossing-regime prompts belong in Narada's construction surfaces.
   Candidates:
   - task templates,
   - chapter templates,
   - construction-loop planning output,
   - review checklists for boundary-shaping work.

2. Add the smallest useful prompt or required section so that when a task introduces a new durable authority-changing crossing, the task itself asks:
   - what zones does this cross?
   - who owns authority before and after?
   - what durable artifact proves the crossing?
   - what confirms it?

3. Ensure this integrates with Task 497's enforcement surface rather than competing with it.

4. Keep the prompt absent or optional for tasks that do not introduce a new crossing.

## Non-Goals

- Do not make every task carry crossing-regime boilerplate.
- Do not rename existing user-facing CLI vocabulary.
- Do not introduce a second construction framework.

## Acceptance Criteria

- [x] At least one canonical construction surface now asks for crossing-regime information when appropriate.
- [x] The prompt or requirement points back to the canonical declaration contract.
- [x] The integration is selective rather than boilerplate on every task.
- [x] The change does not create a second competing semantics surface.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

### 1. Construction Surfaces Updated

Three construction surfaces now integrate crossing regime awareness:

| Surface | Integration | Selective? |
|---------|-------------|------------|
| **Chapter init task template** | `buildChildTaskBody()` in `chapter-init.ts` adds an HTML-commented `## Crossing Regime` section | Yes — commented by default; task author fills it in only if needed |
| **Construction loop plan** | `buildPlan()` in `construction-loop-plan.ts` warns when open tasks contain boundary keywords but lack crossing regime references | Yes — only warns on tasks that appear boundary-related |
| **Chapter planning contract** | `.ai/task-contracts/chapter-planning.md` adds a "Crossing Regime Awareness" section with planner checklist | Yes — only applies to chapters with boundary-shaping tasks |

### 2. Chapter Init Template

The `narada chapter init` generated task template now includes:

```markdown
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
```

This is an HTML comment, so it is invisible in rendered Markdown but visible to task authors during editing.

### 3. Construction Loop Plan Warning

When `narada construction-loop plan` runs, it scans open tasks for boundary keywords (`new durable`, `authority owner`, `boundary crossing`, etc.) and emits a warning if the task lacks a crossing regime reference. This integrates with Task 497's lint heuristic using the same keyword patterns.

### 4. Chapter Planning Contract

Added to `.ai/task-contracts/chapter-planning.md`:
- When a chapter includes boundary-shaping tasks, the planner must verify those tasks have crossing regime declarations
- Four-point planner checklist: declaration present, six fields identified, canonical contract referenced, anti-collapse invariant stated
- Explicit guidance on when declaration is NOT required (using existing canonical crossings)

### 5. Task Execution Contract Updated

Added "Crossing Regime Construction Reminder" to `.ai/task-contracts/agent-task-execution.md`:
- Reminds task authors to check whether their task introduces a new boundary
- References the `narada chapter init` template and construction loop plan warning

### 6. Integration with Task 497

The construction surfaces do not compete with Task 497 enforcement:
- Task 497 lint is **reactive** — catches missing declarations after tasks are written
- Task 499 construction surfaces are **proactive** — prompt for declarations during task creation
- Both use the same keyword heuristics and reference the same canonical contract (SEMANTICS.md §2.15, Task 495)

### 7. Changed Files

- `packages/layers/cli/src/commands/chapter-init.ts` — added commented crossing regime section to `buildChildTaskBody()`
- `packages/layers/cli/src/lib/construction-loop-plan.ts` — added boundary-task warning to `buildPlan()`
- `.ai/task-contracts/chapter-planning.md` — added Crossing Regime Awareness section
- `.ai/task-contracts/agent-task-execution.md` — added Crossing Regime Construction Reminder
- `SEMANTICS.md` §2.15.8 — updated lint gate reference to include construction surface
- `AGENTS.md` — added "Modify crossing regime construction surface" to By Task table

### 8. Verification

```
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

```
pnpm exec tsx scripts/task-graph-lint.ts | grep crossing-regime-missing-declaration
# 6 warnings on older tasks that discuss boundaries (expected — these predate
# the crossing regime framework). The warning message correctly identifies them
# as possible false positives.
```

No runtime code was changed; construction surfaces are template/docs only.

## Verification

```bash
pnpm verify
pnpm exec tsx scripts/task-graph-lint.ts | grep crossing-regime-missing-declaration
```

Results:
- `pnpm verify` passed all 5 verification steps (`task-file-guard`, `typecheck`, `build`, `charters tests`, `ops-kit tests`)
- the lint grep surfaced 6 warnings on older pre-framework tasks, which is the expected advisory behavior
- no runtime behavior was changed; the work is limited to construction surfaces, templates, and contracts


