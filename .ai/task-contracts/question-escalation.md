# Question and Escalation Contract

> **Narada-local instance** of the USC [Question and Escalation Protocol](https://github.com/narada2/narada.usc/blob/main/docs/protocols/question-escalation.md).

This contract defines when a worker agent should stop and ask for help instead of making an arbitrary architecture, product, safety, or authority decision.

It applies to all Narada tasks unless a task explicitly overrides it. The canonical source of this protocol is `narada.usc`; this file is a project-local specialization that preserves Narada-specific examples and conventions.

## When To Escalate

Escalate before proceeding if the task requires a choice that is not already determined by code, docs, contracts, or task text.

Mandatory escalation triggers:

- Authority boundary ambiguity: it is unclear which component is allowed to mutate or decide.
- Semantic conflict: task requirements contradict canonical docs, code invariants, or another active task.
- Live external mutation: sending email, mutating Graph state, deleting drafts, changing production data, or calling external systems is needed but not explicitly authorized.
- Secret/private-data ambiguity: credentials, mailbox contents, customer data, or ops-repo data might be committed, logged, or exposed.
- Product decision: multiple user-visible behaviors are plausible and no canonical choice exists.
- Broad scope expansion: completing the task would require work outside the stated task boundary.
- Verification ambiguity: tests fail for reasons that appear systemic, unrelated, or safety-relevant.
- Dishonest completion risk: the agent cannot satisfy the Definition of Done without overclaiming.
- Irreversible migration or data change: schema/data migration cannot be safely reversed or replayed without a decision.

## When Not To Escalate

Do not escalate for ordinary implementation details when the local design is implied by existing patterns.

Examples:

- Choosing a file-local helper name.
- Adding a focused unit test for new behavior.
- Following an existing interface shape.
- Fixing a clear type error.
- Updating task checkboxes after verified completion.

## Escalation Format

Write the escalation in the original task file under:

```md
## Escalation Needed

### Question

...

### Why This Blocks

...

### Options Considered

- A: ...
- B: ...

### Recommendation

...

### Current State

...
```

Keep it concise and concrete. Do not create a separate escalation file unless explicitly asked.

## Pause Rule

After recording `## Escalation Needed`, stop before taking the disputed action.

Allowed before stopping:

- leave code unchanged
- commit no changes
- record exact blocker and current state
- suggest the smallest decision needed

Forbidden before the escalation is answered:

- making the semantic/product/authority choice silently
- marking the task complete
- creating a derivative result/status file
- doing live external mutation

## Decision Recording

When the architect/user answers, record the decision in the original task file:

```md
## Decision

...
```

Then proceed according to that decision.

## Governance Feedback (Not Escalation)

If the task is **not blocked** but the agent notices friction in the governing system itself (ambiguous contracts, repeated criteria, verification policy gaps, task-DAG blocking, or a better rule), do not escalate. Instead:

1. Complete the task.
2. Append feedback to `.ai/feedback/governance.md` using the format documented there.

Escalation is for blockers. Governance feedback is for post-task improvement signals.

## Architect Interaction

If an architect agent is available, ask the architect first. If not, ask the user.

The answer should be treated as task-local unless it clearly updates a reusable contract, canonical doc, or system invariant. If it does, update the relevant canonical artifact as part of the task or create a follow-up task.
