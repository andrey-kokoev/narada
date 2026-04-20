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

## Acceptance Criteria

- [ ] One canonical intent-to-operation bootstrap path is documented.
- [ ] Resulting operation artifacts are explicit and inspectable.
- [ ] First-run validation is part of the bootstrap contract.
- [ ] The path minimizes manual config interpretation.
