# Chapter Planning Contract

This contract applies to Narada chapter-planning tasks.

It is additive to `.ai/task-contracts/agent-task-execution.md`.

It also inherits `.ai/task-contracts/question-escalation.md`.

## Purpose

Chapter-planning tasks define the next coherent body of work. They do not implement that body of work.

## Required Shape

- Define the chapter boundary.
- State how this chapter differs from adjacent chapters.
- Inventory current readiness and gaps when requested.
- Include a CCC posture table with evidenced state, projected state, pressure path, and evidence required.
- Create a minimal non-overlapping follow-up task set.
- Use monotonically increasing task numbers.
- Put the reduced DAG in a separate task-range file, e.g. `.ai/do-not-open/tasks/YYYYMMDD-NNN-MMM.md`.
- Keep Mermaid graphs plain. Do not add Mermaid styling/classes.

## CCC Posture Table

Chapter planning must distinguish pressure intent from pressure effect.

Use this shape:

| Coordinate | Evidenced State | Projected State If Chapter Verifies | Pressure Path | Evidence Required |
|------------|-----------------|-------------------------------------|---------------|-------------------|
| semantic_resolution | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |
| invariant_preservation | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |
| constructive_executability | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |
| grounded_universalization | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |
| authority_reviewability | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |
| teleological_pressure | `-1/0/+1` | `-1/0/+1` | Task(s) or residual | What proves the projection |

Definitions:

- **Evidenced State**: current posture backed by completed artifacts.
- **Projected State If Chapter Verifies**: expected posture after the planned tasks close with evidence.
- **Pressure Path**: task(s), fixture, review, or residual intended to move the coordinate.
- **Evidence Required**: what must exist before the projection can be treated as evidenced.

Do not mark a coordinate corrected merely because a task was created.

## Follow-Up Tasks

- Each follow-up task must have a single clear responsibility.
- Each follow-up task must state dependencies explicitly.
- Do not include tasks for nice-to-have work unless needed for chapter acceptance.
- Do not implement chapter work inside the planning task.

## Crossing Regime Awareness

When a chapter includes tasks that introduce **new durable authority-changing boundaries**, the chapter plan must ensure those tasks contain explicit crossing regime declarations.

### When Crossing Regime Declaration Is Required

A task needs a crossing regime declaration when it:
1. Creates a new durable artifact that crosses from one authority owner to another, OR
2. Introduces a new boundary in the nine-layer pipeline (Source → Fact → Context → Work → Evaluation → Decision → Intent → Execution → Confirmation), OR
3. Changes the admissibility rules for an existing boundary.

Tasks that merely **use** existing canonical crossings (e.g., adding a new fact type, creating a new intent) do NOT need a new declaration.

### Chapter Planner Responsibility

Before marking a chapter plan complete, verify:
- [ ] Any task introducing a new boundary has a `## Crossing Regime` section (or equivalent).
- [ ] The declaration identifies the six irreducible fields (source_zone, destination_zone, authority_owner, admissibility_regime, crossing_artifact, confirmation_rule).
- [ ] The task references `SEMANTICS.md §2.15` or `Task 495` to show awareness of the contract.
- [ ] The anti-collapse invariant is stated.

If no tasks in the chapter introduce new boundaries, this checklist does not apply.

## Deferred Work

- Name deferred capabilities explicitly.
- Explain why each deferred capability is outside the chapter.
- Do not bury deferred work as vague “future work”.

## Range Reservation

Before creating a chapter, the task-number range MUST be reserved.

### Workflow

1. **Agent proposes** chapter title, task count, and task titles.
2. **Operator approves** and reserves range NNN–MMM.
3. **Agent creates** the chapter DAG file with the reserved range declared.
4. **Agent creates** individual task files inside the reserved range.
5. **Agent marks** the reservation as `released` when all tasks are created.

### Reservation methods

- **Preferred**: Use `scripts/task-chapter-create.ts`:
  ```bash
  pnpm exec tsx scripts/task-chapter-create.ts \
    --title "Chapter Title" \
    --tasks "task one,task two,task three" \
    --depends-on 443
  ```
  This automatically computes the next available range, creates the chapter DAG file, creates stub task files, and updates `.registry.json`.

- **Manual**: Compute the next available number, add a reservation entry to `.ai/do-not-open/tasks/tasks/.registry.json`, then create files by hand.

### Rules

- Do not create tasks inside an active reserved range belonging to another chapter.
- Do not guess numbers by `ls | tail`.
- Chapter DAG filenames MUST include the range: `YYYYMMDD-NNN-MMM-chapter-title.md`.
- Chapter body MUST declare the range explicitly: `# Chapter DAG — Title (Tasks NNN–MMM)`.

## Partial Recovery

If a chapter is partially created (some tasks missing):

1. Run `scripts/task-graph-lint.ts` to identify missing task files.
2. Create the missing task files.
3. Update `.ai/do-not-open/tasks/tasks/.registry.json` to mark the reservation as `released`.

## Completion Evidence

- The planning task should link or name:
  - inventory artifact
  - created task range
  - DAG file
  - CCC posture table
  - deferred capabilities
- The planning task should not duplicate the full content of every follow-up task.
