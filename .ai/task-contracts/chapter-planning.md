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
- Create a minimal non-overlapping follow-up task set.
- Use monotonically increasing task numbers.
- Put the reduced DAG in a separate task-range file, e.g. `.ai/tasks/YYYYMMDD-NNN-MMM.md`.
- Keep Mermaid graphs plain. Do not add Mermaid styling/classes.

## Follow-Up Tasks

- Each follow-up task must have a single clear responsibility.
- Each follow-up task must state dependencies explicitly.
- Do not include tasks for nice-to-have work unless needed for chapter acceptance.
- Do not implement chapter work inside the planning task.

## Deferred Work

- Name deferred capabilities explicitly.
- Explain why each deferred capability is outside the chapter.
- Do not bury deferred work as vague “future work”.

## Completion Evidence

- The planning task should link or name:
  - inventory artifact
  - created task range
  - DAG file
  - deferred capabilities
- The planning task should not duplicate the full content of every follow-up task.
