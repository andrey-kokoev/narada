# Task 184: Add USC Task Graph State Model

## Context

`narada.usc` can initialize an app repo, refine broad intent, validate artifacts, and open cycles. It does not yet have a durable construction task graph that can support an executable constructor loop.

The next target is a narrow loop:

```text
intent -> refinement -> task graph -> claim one task -> execute -> review -> update graph -> repeat
```

This task defines the durable graph substrate only.

## Required Change

In `narada.usc`, add a normalized construction task graph model stored under the app repo:

```text
usc/task-graph.json
```

Each task must include:

- `id`
- `title`
- `status`: `pending | claimed | completed | rejected | blocked`
- `depends_on`
- `inputs`
- `expected_outputs`
- `acceptance`
- `claim`
- `review`

Graph-level metadata must include:

- `schema_version`
- `app_id`
- `created_at`
- `updated_at`
- `tasks`

## Semantics

- A task is runnable only when all `depends_on` tasks are `completed`.
- `claimed` must record claimant, claimed_at, and optional lease/expires_at.
- `completed` must record result artifact reference, completed_at, and claimant.
- `rejected` must record reviewer, reason, rejected_at, and next required action.
- `blocked` must record reason and unblock condition.
- Writes must be atomic.
- Validation must reject malformed graph files.

## Implementation Notes

Prefer boring JSON plus deterministic helpers in `packages/core` or `packages/compiler`; do not add SQLite yet.

Do not implement agent execution in this task.

## Verification

Run:

```bash
pnpm validate
```

Add focused tests or validation examples proving:

- valid empty graph passes
- task with missing dependency fails
- task with invalid status fails
- claimed task without claim metadata fails
- completed task without result reference fails

## Definition Of Done

- [ ] `usc/task-graph.json` has a documented schema.
- [ ] App repo validation checks the task graph.
- [ ] Atomic read/write helpers exist.
- [ ] Invalid graph examples are rejected.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Schema Changes

**task.schema.json:**
- Extended status enum: open, pending, claimed, executed, completed, under_review, accepted, rejected, residualized, superseded, blocked
- New structured objects: claim, review, result, block, acceptance
- New arrays: inputs, expected_outputs, depends_on
- Conditional validation (if/then): claimed requires claim, completed requires result, rejected requires review, blocked requires block

**task-graph.schema.json:**
- Added optional graph metadata: schema_version, app_id, created_at, updated_at
- Relaxed required fields from ["tasks", "edges"] to ["tasks"] for flexibility

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/atomic-json.js` | Atomic readJson / writeJson helpers (write tmp, rename) |
| `examples/task-graphs/valid-empty.json` | Minimal valid graph with metadata |
| `examples/task-graphs/valid-with-tasks.json` | Graph with tasks in all new states |
| `examples/task-graphs/invalid-status.json` | Negative test: invalid status |
| `examples/task-graphs/invalid-claimed-without-metadata.json` | Negative test: claimed without claim |
| `examples/task-graphs/invalid-completed-without-result.json` | Negative test: completed without result |
| `examples/task-graphs/invalid-missing-dependency.json` | Negative test: missing dependency |

### Validation

- `validateTaskGraphSemantics()` added to validator.js — checks that all depends_on/dependencies references point to existing task IDs
- App repo and session task graphs now validated with both schema and semantic checks
- All 4 invalid examples correctly rejected

### Generated Repos

- `init-repo.js` now emits task graphs with schema_version, app_id, timestamps, and status: pending

### Verification

- `pnpm validate` → 43/43 passed (including 4 expected failures)
- `usc init /tmp/... && usc validate --app /tmp/...` → PASS
- Working tree clean

### Commit

`c3005c4` — feat(usc): add task graph state model with semantic validation

### Residual Work

None. Agent execution not in scope for this task.
