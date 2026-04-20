# Task 240: Establish Governance Feedback Channel For Agents

## Why

Worker agents sometimes discover friction in the governing system itself:

- task contracts are ambiguous
- acceptance criteria are repeated or underspecified
- verification policy is hard to apply
- task DAGs create avoidable blocking
- contracts conflict with implementation reality
- agent experience reveals a better governing rule

This is different from escalation.

Escalation means: "I am blocked and need a decision before proceeding."

Governance feedback means: "I completed or attempted the task, and I observed something that should improve the task-governed development system."

Today there is no canonical place for this feedback. It gets buried in task notes, final messages, or disappears.

## Goal

Create a Narada-local governance feedback channel and define the rules for worker agents to use it without bypassing task authority.

This should also prepare the concept for later lifting into `narada.usc` as a generic constructor protocol.

## Required Work

### 1. Create Feedback Home

Create:

```text
.ai/feedback/governance.md
```

This file is the rolling inbox for feedback about Narada's task-governed development system.

### 2. Define Feedback Format

Add a reusable format:

```md
## YYYY-MM-DD / agent-id / task-id

### Observation

What the agent noticed.

### Friction

What slowed, confused, or distorted the work.

### Suggested Change

Concrete improvement to contracts, tasks, docs, tooling, or process.

### Severity

minor | material | blocking

### Scope

local task | chapter | repo governance | USC-level
```

### 3. Define Rules

Document rules in `.ai/feedback/governance.md`:

- Agents may append governance feedback.
- Agents must not implement governance changes unless assigned a task.
- Governance feedback must not replace escalation.
- If the issue blocks the task, use `## Escalation Needed` in the task file.
- If the issue does not block the task, finish the task and add feedback separately.
- Feedback must not contain secrets, private mailbox contents, or customer data.
- Feedback should be concrete and actionable, not general sentiment.

### 4. Link From Task Contracts

Update:

```text
.ai/task-contracts/agent-task-execution.md
.ai/task-contracts/question-escalation.md
```

to distinguish:

- escalation: task-blocking question requiring architect/user decision
- governance feedback: non-blocking or post-task improvement signal for the governing system

### 5. Add AGENTS.md Note

Update `AGENTS.md` task policy section to mention:

```text
.ai/feedback/governance.md
```

as the place for agent feedback about task governance.

### 6. Add USC Follow-Up Note

Do not modify `narada.usc` in this task unless explicitly desired.

Instead, add a note that this pattern should later be lifted into USC as a generic governance-feedback protocol, sibling to question escalation.

If Task 239 has already landed by the time this task is executed, cross-reference it.

## Non-Goals

- Do not build a feedback triage UI.
- Do not create one file per feedback item.
- Do not let agents modify governance contracts based only on their own feedback.
- Do not replace task execution notes.
- Do not replace escalation.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `.ai/feedback/governance.md` exists.
- [x] Governance feedback format is documented.
- [x] Governance feedback rules are documented.
- [x] Agent task execution contract distinguishes feedback from escalation.
- [x] Question escalation contract distinguishes escalation from governance feedback.
- [x] `AGENTS.md` points agents to the governance feedback channel.
- [x] USC-lift follow-up note is recorded.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

- Created `.ai/feedback/governance.md` with format template, rules, and empty entries section.
- Updated `.ai/task-contracts/agent-task-execution.md` with a `## Governance Feedback` section explaining the distinction from escalation and directing agents to `.ai/feedback/governance.md`.
- Updated `.ai/task-contracts/question-escalation.md` with a `## Governance Feedback (Not Escalation)` section explaining when to use each channel.
- Updated `AGENTS.md` `## Task File Policy` section with a `### Governance Feedback` subsection that references `.ai/feedback/governance.md` and includes the USC lift follow-up note cross-referencing Task 239.
- No derivative status files created.

## Dependencies

- `.ai/task-contracts/agent-task-execution.md`
- `.ai/task-contracts/question-escalation.md`
