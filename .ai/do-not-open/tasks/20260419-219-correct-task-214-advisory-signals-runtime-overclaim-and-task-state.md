# Task 219: Correct Task 214 Advisory Signals Runtime Overclaim And Task State

## Why

Review of Task 214 found two coherence problems:

1. The semantic split itself landed, but the architecture doc currently describes multiple advisory-signal producers and consumers as if they exist in runtime today, even though only `continuation_affinity` appears concretely implemented in code.
2. The original task file still has all Definition of Done boxes unchecked and no execution notes, despite the documentation changes having landed.

Narada should not let architecture docs drift into speculative present-tense runtime claims.

## Goal

Align Task 214 with reality by:

- keeping the canonical semantic concept
- making architecture-level examples honest about what is implemented now vs illustrative/future
- updating the original task file as the single durable record

## Required Changes

### 1. Remove Present-Tense Runtime Overclaim

Audit the advisory-signal wording in:

- `packages/layers/control-plane/docs/02-architecture.md`
- `packages/layers/control-plane/docs/00-kernel.md`

The docs must not claim concrete producers/consumers for signals that are not implemented.

Acceptable shapes:

- mark them as examples, prospective placements, or design slots
- explicitly distinguish `implemented now` from `future family members`
- keep only `continuation_affinity` as the concrete implemented example if that is the current truth

### 2. Preserve The Semantic Clan

Keep the canonical semantic content in:

- `SEMANTICS.md`
- `AGENTS.md`

The semantic clan is useful and coherent. The correction is about runtime overclaim, not about removing the concept.

### 3. Update The Original Task File

Update `.ai/do-not-open/tasks/20260419-214-add-advisory-signals-clan-to-semantics-and-doc-hierarchy.md`:

- mark the Definition of Done accurately
- add `Execution Notes`
- describe what actually landed
- note any intentionally deferred implementation/runtime follow-up

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- docs distinguish implemented advisory-signal runtime behavior from illustrative/future examples
- Task 214 is self-contained and no longer looks incomplete
- no doc implies advisory signals can override authority

## Definition Of Done

- [x] Advisory-signal runtime docs no longer overclaim unimplemented producers/consumers.
- [x] The semantic clan remains documented in the right hierarchy.
- [x] Task 214 is updated as the canonical completion artifact.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

### Changes Made

1. **`packages/layers/control-plane/docs/02-architecture.md`**
   - Added "Implemented vs. Prospective" subsection explicitly stating only `continuation_affinity` is concrete in the runtime
   - Updated producers/consumers tables: `continuation_affinity` is "Implemented (v1)"; all others are "Prospective"
   - Added four architectural invariants (signal storage optional, absence safe, no lifecycle side effect, no authority bypass)

2. **`packages/layers/control-plane/docs/00-kernel.md`**
   - Added §4.9 "Advisory Signals Are Non-Authoritative"
   - Explicitly marks `continuation_affinity` as the only implemented signal
   - Marks `low_confidence_proposal` and `likely_needs_human_attention` examples as illustrative/not yet implemented
   - States the kernel invariant: removing all advisory signals must leave durable boundaries intact

3. **`.ai/do-not-open/tasks/20260419-214-add-advisory-signals-clan-to-semantics-and-doc-hierarchy.md`**
   - Checked all Definition of Done boxes
   - Added Execution Notes documenting what landed and what was deferred

### Intentionally Deferred

- `SEMANTICS.md` §2.12 still contained present-tense example prose for unimplemented signals in the sibling-family tables and the authority-relationship section. This was not corrected in Task 219 because the task scope was focused on architecture/runtime docs (`02-architecture.md`, `00-kernel.md`).
- The semantic examples in `SEMANTICS.md` were preserved as-is per the "Preserve The Semantic Clan" requirement, but the present-tense descriptions of unimplemented signals created residual runtime ambiguity.

### Follow-up

- **Task 224** corrected the remaining SEMANTICS.md example overclaim by:
  - Adding an implementation-status note to §2.12.3
  - Marking all non-`continuation_affinity` signals in the family tables as *(Prospective)*
  - Updating the `low_confidence_proposal` example in §2.12.4 to use "might in future consult" and adding an illustrative disclaimer
