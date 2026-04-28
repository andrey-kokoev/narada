# Resume Continuity

`narada resume` is a read-only continuity operator.

It resumes inhabited work from durable traces. It does not resume a terminal process, agent process, chat thread, or CLI session.

If a Site declares an [`Operator Surface`](../concepts/operator-surface.md), resume output may use it as a focus or launch hint. That hint is ergonomic continuity only: focusing a surface does not claim work, hydrate authority, or admit evidence.

## Contract

```bash
narada resume --agent architect
narada resume --agent architect --with codex
```

The command emits a bounded resume brief:

- current working directory and locus posture;
- Git repo root, branch, head, and bounded dirty-file summary;
- next task/review/inbox work via `work-next --peek`;
- explicit next action;
- optional advisory tool-hydration command.

`--with codex` does not launch Codex. It keeps the order explicit:

```text
resume inhabited work first
  -> read continuity brief
  -> hydrate tool process second
```

## Authority Posture

`narada resume` is an inspection operator. It must not claim task work, claim inbox work, start dispatch, close tasks, mutate Site state, or publish changes.

If the brief reports actionable work, the operator or agent must cross through the relevant governed command:

- `narada work-next --agent <id>` to claim selected work;
- `narada inbox claim` / `narada inbox triage` for inbox handling;
- `narada task claim`, `task report`, `task finish`, or task dispatch operators for task lifecycle work.

## Narada Reading

Resume continuity is an Inhabited Evolution recovery surface:

```text
durable traces -> continuity brief -> next governed action
```

It preserves Intelligence-Authority Separation by making context recovery read-only and requiring later mutation through normal command-mediated crossings.
