# Task 283: Intent-to-Operation Bootstrap Contract

## Chapter

Operation Realization

## Context

Narada has many pieces of a workable bootstrap path, but the first-time user journey is still distributed across commands, docs, and implicit assumptions. The system needs one canonical contract for turning user intent into a runnable operation.

## Goal

Define and implement the primary bootstrap path from user intent to a runnable operation repo/config with minimal manual interpretation.

## Required Work

### 1. Canonical Bootstrap Contract

Make one path canonical and document it clearly:

1. express intent
2. initialize operation repo/config
3. select vertical/runtime posture
4. validate prerequisites
5. reach runnable state

This may update CLI surfaces, repo templates, and docs, but it should produce one obvious path rather than many equivalent ones.

### 2. Bootstrap Artifact Expectations

Make explicit what artifacts a new operation must have after bootstrap, including:

- config
- operation identity
- charter/runtime binding
- required local directories or caches
- first-run command guidance

### 3. First-Run Validation

Ensure the canonical bootstrap path includes explicit validation before the user attempts live run:

- configuration validity
- required credentials/runtime expectations
- clear distinction between blocking vs non-blocking issues

### 4. Docs / Walkthrough

Create or update a concise walkthrough for the first-time user path.

## Non-Goals

- Do not prove the full mailbox vertical here; that belongs in Task 285.
- Do not add fleet/multi-operation orchestration.

## Execution Notes

Task executed in a single pass with planning mode approval.

1. Created `docs/bootstrap-contract.md` — the canonical five-step contract with artifact expectations per step, validation gates (blocking vs non-blocking), path diagrams for demo and live paths, artifact inspection commands, and explicit separation from USC construction.
2. Updated `QUICKSTART.md` — restructured as the concise walkthrough aligned with the contract. Each of the three entry paths (show me / try safely / go live) now maps to contract steps. Artifact lists and validation gates are explicit.
3. Updated `init-repo.ts` — added `InitRepoArtifact` type with categories, `artifacts` array to `InitRepoResult`, and included `narada setup` in the demo path next steps.
4. Updated `want-mailbox.ts` — added `nextSteps` to `ShapedMailbox` return type, populated with the live bootstrap sequence.
5. Updated `main.ts` — `init-repo` handler prints categorized artifacts and references the bootstrap contract; `want-mailbox` handler prints next steps.
6. Updated `AGENTS.md` — added bootstrap contract to Documentation Index and "Where to Find Things".

## Verification Evidence

- `pnpm verify` — 5/5 steps pass
- `pnpm --filter @narada2/cli test` — 175/175 passes
- `pnpm --filter @narada2/ops-kit build` — rebuilt to propagate type changes

## Bounded Deferrals

- The bootstrap contract is not copied into generated ops repos. Users in an ops repo should refer to the Narada source docs or the generated README.md. CLI output corrected to not claim the contract is local repo documentation.
- Fleet/multi-operation orchestration remains deferred (listed in non-goals).

## Acceptance Criteria

- [x] One canonical intent-to-operation bootstrap path is documented.
- [x] Resulting operation artifacts are explicit and inspectable.
- [x] First-run validation is part of the bootstrap contract.
- [x] The path minimizes manual config interpretation.
