# Canonical Mutation Evidence

Canonical Mutation Evidence is Narada's resolution to the SQLite-in-Git problem.

SQLite is a fast local runtime substrate. Git should carry canonical, mergeable evidence of governed mutations. Reconciliation should replay admitted operations into local SQLite, not merge opaque SQLite files as the governing invariant.

## Core Rule

```text
governed mutation
  -> canonical mutation evidence
  -> Git-visible mergeable artifact
  -> local SQLite projection/reconciliation
```

Raw SQLite files may exist locally for speed and ergonomic operation. They are not the portable authority artifact across clones, Sites, or Git branches.

## What Counts As Canonical Mutation Evidence

A mutation evidence artifact must identify:

- the authority class and command/operator that admitted the mutation;
- the target Site or authority locus;
- the principal or actor;
- the mutation subject and stable identity;
- the before/after lifecycle or status when applicable;
- the timestamp and deterministic operation id;
- the confirmation or read-back evidence;
- enough payload to replay or reconcile the local runtime substrate.

Current partial examples include:

| Surface | Current Evidence | Posture |
| --- | --- | --- |
| Task lifecycle | `.ai/task-lifecycle-snapshot.json` plus task artifacts/reviews/admissions | Snapshot-backed projection; not yet full append-only operation log. |
| Inbox | `.ai/inbox-envelopes/*.json` exported envelopes | Mergeable envelope artifacts with import/replay into ignored local SQLite. |
| Publication | publication records and Git commits | Durable publication evidence; repository push is the external confirmation. |
| Verification | recorded verification runs and task reports | Evidence for admission, not the mutation authority itself. |

## Non-Goals

- Do not make raw SQLite merge conflict resolution the primary invariant.
- Do not require every local read model to be human-editable.
- Do not remove SQLite where it is the right local runtime substrate.
- Do not treat snapshots as sufficient forever when an append-only mutation log is required for principled replay.

## Reconciliation Direction

When a clone pulls Git-visible mutation evidence:

```text
import evidence
  -> validate authority/admission fields
  -> replay into local SQLite
  -> compare local projection with exported snapshot if present
  -> emit bounded repair/residual output
```

If local SQLite and Git-visible evidence disagree, the question is not "which SQLite file wins?" The question is:

```text
which admitted mutation evidence is canonical, and has it been replayed?
```

## Guard Direction

The long-term guard is:

```text
No governed SQLite mutation without canonical mutation evidence.
```

That guard should be introduced per authority surface. Until every mutation has append-only evidence, freshness snapshots remain a transitional guard, not the final model.

## Relationship To Other Doctrine

- **Authority-Revealing Inversion**: the SQLite file appears primary; inversion reveals runtime substrate plus mutation-evidence authority.
- **Plural Embodiment, Singular Authority**: multiple clones may embody the operation; mutation evidence prevents split-brain authority.
- **Canonical Inbox**: exported envelopes are already close to the desired pattern.
- **Task lifecycle DB posture**: the current snapshot guard is an interim projection safety rail.
- **Re-derivation / recovery**: replay operates from admitted durable boundaries, not from arbitrary database merges.

## Practical Agent Rule

When adding or modifying a SQLite-backed mutation command, answer before coding:

```text
What canonical mutation evidence will this command emit?
How will another clone import or replay it?
What local SQLite state is projection/substrate rather than portable authority?
What guard prevents mutation without evidence?
```

If these questions are unanswered, the work should produce a bounded design task or residual rather than adding another silent database mutation.
