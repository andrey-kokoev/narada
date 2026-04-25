# Task 160: Correct Task 154 Complete Semantics Ontology

## Source

Review of executed Task 154 found that `SEMANTICS.md` exists and is linked, but it is not yet complete enough to serve as the single canonical ontology without drift.

## Why

`SEMANTICS.md` is now declared the single source of truth. If it omits first-class runtime concepts or contradicts current durability, future docs and agents will keep reintroducing semantic cavities.

## Findings To Correct

### 1. Context durability is contradictory

`SEMANTICS.md` pipeline table marks `Context` as non-durable, but the same document says `context_records` is the durable table for context metadata.

Current implementation has durable context state:

- `context_records`
- `context_revisions`
- work items keyed by `context_id`

Fix the ontology by either:

- marking context metadata/revisions as durable, or
- explicitly distinguishing the abstract grouping from its durable control-plane record.

Do not leave the table saying simply `Context | No` while the document describes durable context records.

### 2. First-class terms are missing from the canonical ontology

Add concise definitions for terms already treated as first-class in code/docs:

- `charter`
- `posture`
- `evaluation`
- `decision`
- `outbound handoff`
- `outbound command`
- `tool call`
- `trace`
- `knowledge source`
- `operator action`

Each definition should include:

- what layer it belongs to
- whether it is user-facing or internal
- durable boundary/table if applicable
- authority owner if applicable

Keep definitions short. This is an ontology, not an architecture essay.

### 3. `TERMINOLOGY.md` duplicates canonical definitions

`TERMINOLOGY.md` repeats full definitions for `operation`, `scope`, `ops repo`, and prohibited terms.

Make `TERMINOLOGY.md` subordinate in practice, not just in prose:

- keep it as a user-facing quick guide
- replace duplicated canonical definitions with short summaries and links to anchors in `SEMANTICS.md`
- preserve the useful “what word should I use?” function
- avoid creating a second definitional source

### 4. Add anchors or stable headings for linked terms

If `TERMINOLOGY.md` and contributor docs point into `SEMANTICS.md`, the relevant headings must be stable enough for links.

Use predictable heading names for core terms. Do not use generated/non-obvious anchor targets.

## Deliverables

- `SEMANTICS.md` has no context durability contradiction.
- `SEMANTICS.md` defines the missing first-class terms listed above.
- `TERMINOLOGY.md` becomes a lightweight user-facing index over `SEMANTICS.md`, not a competing definition source.
- Existing README/AGENTS references still point coherently to `SEMANTICS.md` and `TERMINOLOGY.md`.

## Definition Of Done

- [ ] `SEMANTICS.md` has a coherent durable/non-durable classification for context.
- [ ] All listed first-class terms have concise ontology entries.
- [ ] `TERMINOLOGY.md` no longer duplicates full canonical definitions.
- [ ] Links between `TERMINOLOGY.md`, `README.md`, `AGENTS.md`, and `SEMANTICS.md` remain valid.
- [ ] No derivative task-status files are created.
