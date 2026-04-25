# Task 131: Correct Task 123 Persist-Evaluation Authority Ambiguity

## Why

Review of Task 123 found that the envelope authority cleanup largely landed, but evaluation persistence responsibility is still not structurally singular.

The production daemon path now persists evaluations before foreman resolution, which is the right direction.

However, `@narada2/charters` still exposes a first-class `RuntimeHooks.persistEvaluation` hook in `runtime/runner.ts`, and the runner will call it if provided.

That leaves two different persistence mechanisms in the architecture:

- daemon/runtime-side explicit persistence via `persistEvaluation(...)`
- runner-hook persistence via `RuntimeHooks.persistEvaluation`

Even if production currently uses only one of them, the public runtime surface still communicates split authority.

## Goal

Make evaluation persistence responsibility singular and obvious across the runtime boundary.

## Findings Being Corrected

### 1. Runtime surface still advertises two persistence mechanisms

Current state:

- daemon dispatch persists evaluations explicitly before `resolveWorkItem()`
- `CodexCharterRunner` still supports `hooks.persistEvaluation(...)`

That means the system still has two plausible places where a caller might believe evaluation persistence belongs.

### 2. Structural ambiguity remains even if production is consistent

It is not enough that the current daemon happens to use only one path.

As long as the public runtime API still presents both paths as valid first-class designs, the authority boundary is still ambiguous.

## Required Outcomes

### 1. Choose one persistence authority model and make it exclusive

The preferred direction, based on the current tree, is:

- evaluation persistence belongs to the runtime/daemon integration layer
- the charter runner returns output only
- the foreman consumes already-persisted evaluations

If that is the chosen model, remove the competing runner-hook persistence path.

### 2. Remove or neutralize `RuntimeHooks.persistEvaluation`

Implement one coherent outcome:

- remove `persistEvaluation` from `RuntimeHooks`, or
- reduce it to a private/internal-only adapter surface that is not presented as a canonical runtime boundary

Disallowed outcome:

- leaving `persistEvaluation` as a normal public runtime hook while also treating daemon-side persistence as the canonical model

### 3. Align docs and exports

Update any docs or package guidance that still imply the runner may own evaluation persistence.

At minimum review and align:

- `packages/domains/charters/src/runtime/runner.ts`
- `packages/domains/charters/src/runtime/index.ts`
- `packages/layers/kernel/AGENTS.md`
- any docs describing runtime hooks or evaluation persistence responsibility

### 4. Keep trace persistence separate if appropriate

If `persistTrace` remains a runner hook, that is acceptable only if the docs clearly distinguish it from evaluation persistence.

The distinction should be explicit:

- trace persistence may remain runner-adjacent commentary capture
- evaluation persistence is authoritative control-plane durability and therefore belongs to runtime integration

### 5. Update tests to reflect the chosen model

Tests should no longer reinforce the idea that evaluation persistence is a normal runner-hook responsibility if that is no longer canonical.

## Deliverables

- singular evaluation persistence authority across runtime surfaces
- runner API no longer suggests a second canonical persistence path
- updated docs/tests aligned with the chosen model

## Definition Of Done

- [ ] evaluation persistence responsibility is singular and explicit
- [ ] the charter runner surface no longer presents `persistEvaluation` as a competing canonical mechanism
- [ ] trace persistence, if retained as a hook, is clearly distinguished from authoritative evaluation persistence
- [ ] docs/tests align with the corrected authority boundary

## Notes

This is a corrective cleanup for the remaining ambiguity after Task 123.

It should not reopen the envelope-authority decision that already landed successfully.
