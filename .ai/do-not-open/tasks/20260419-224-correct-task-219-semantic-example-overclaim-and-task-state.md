# Task 224: Correct Task 219 Semantic Example Overclaim And Task State

## Why

Review of Task 219 found that the main architecture docs were corrected successfully:

- `02-architecture.md` now distinguishes implemented vs prospective advisory signals
- `00-kernel.md` marks non-`continuation_affinity` examples as illustrative
- Task 214 was updated as the canonical artifact

But two residual issues remain:

1. `SEMANTICS.md` still contains present-tense example prose for unimplemented signals, e.g. the `low_confidence_proposal` example in the authority-relationship section reads as if the foreman currently consults it.
2. The Task 219 file itself still has unchecked Definition of Done boxes and no execution notes.

That means the runtime overclaim was reduced, but not fully resolved across the full doc hierarchy.

## Goal

Finish the cleanup by:

- making semantic examples honest about implemented vs illustrative signals
- updating Task 219 as the durable completion artifact

## Required Changes

### 1. Fix `SEMANTICS.md` Example Honesty

Audit advisory-signal examples in `SEMANTICS.md`, especially:

- relationship-to-authority examples
- family tables and example prose

Implemented signals may remain present tense.

Unimplemented signals should be marked clearly as one of:

- illustrative
- prospective
- future family member

Do not remove the clan or weaken the ontology. Only remove runtime ambiguity.

### 2. Keep Hierarchy Coherent

After correction:

- `SEMANTICS.md`
- `00-kernel.md`
- `02-architecture.md`
- `AGENTS.md`

should tell the same story:

- `continuation_affinity` is the only concretely implemented advisory signal
- other named signals are valid semantic family members but not yet runtime-emitted/consumed

### 3. Update Task 219

Update:

- `.ai/do-not-open/tasks/20260419-219-correct-task-214-advisory-signals-runtime-overclaim-and-task-state.md`

with:

- checked Definition of Done items as appropriate
- `Execution Notes`
- explicit note that a follow-up was required for semantic-example honesty if that remains true at the time of update

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- no advisory-signal doc uses present tense for unimplemented runtime behavior without marking it illustrative/prospective
- Task 219 is self-contained and accurately marked

## Definition Of Done

- [x] `SEMANTICS.md` no longer overclaims unimplemented advisory-signal runtime behavior.
- [x] The advisory-signal story is coherent across semantics, kernel, architecture, and AGENTS docs.
- [x] Task 219 is updated as the canonical completion artifact.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Reviewed State

The semantic overclaim was corrected:

- `SEMANTICS.md` now states that only `continuation_affinity` is concretely implemented in runtime today.
- Non-`continuation_affinity` advisory signals are marked as prospective family members.
- The `low_confidence_proposal` authority example is framed as future/illustrative rather than present-tense runtime behavior.
- Task 219 was updated with execution notes and a clear Task 224 follow-up note.

### Verification

Reviewed by inspection of:

- `SEMANTICS.md`
- `packages/layers/control-plane/docs/00-kernel.md`
- `packages/layers/control-plane/docs/02-architecture.md`
- `.ai/do-not-open/tasks/20260419-219-correct-task-214-advisory-signals-runtime-overclaim-and-task-state.md`
