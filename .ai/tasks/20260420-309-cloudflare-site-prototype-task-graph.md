---
status: opened
depends_on: [308]
---

# Task 309 — Cloudflare Site Prototype Task Graph

## Context

Task 308 designs Cloudflare as Narada's first concrete `Site materialization`.

This task converts that design into a disciplined implementation DAG, but still does not implement the prototype.

The goal is to prevent a large agent from starting with "make Cloudflare work" and producing an unreviewable cross-cutting patch.

## Goal

Create a minimal, ordered task graph for implementing the first Cloudflare-backed Site prototype.

The graph should decompose implementation into small, reviewable tasks with clear dependencies and no provider-neutral over-abstraction before the Cloudflare path is proven.

## Required Work

### 1. Review Task 308 Output

Read:

```text
docs/deployment/cloudflare-site-materialization.md
SEMANTICS.md §2.14
docs/concepts/runtime-usc-boundary.md
```

Use Task 308's terms. Do not reintroduce `operation` smear.

### 2. Create DAG File

Create a DAG file for the Cloudflare prototype tasks.

Use the next contiguous task range after this task.

Expected shape:

```text
.ai/tasks/20260420-320-32X.md
```

The Mermaid graph must be plain and must not use Mermaid classes.

### 3. Create Implementation Task Files

Create one task file per graph node.

The graph should likely include tasks for:

- Cloudflare Worker scaffold and package boundary
- Site manifest/config schema for Cloudflare materialization
- Durable Object Site coordinator/lock/health skeleton
- bounded Cycle runner contract
- Sandbox/Container execution proof spike
- R2 Trace/evidence storage adapter
- secret binding and egress policy design
- operator status endpoint
- local-to-Cloudflare smoke fixture
- prototype closure/review

Adjust the list based on Task 308. Do not invent broad generic deployment abstractions unless Task 308 proves they are needed.

### 4. Keep Tasks Implementation-Ready

Each produced task must include:

- context
- goal
- required work
- non-goals
- acceptance criteria
- focused verification guidance
- explicit boundary against generic deployment framework overreach

### 5. Mark Task 309 Complete

After creating the DAG and task files, update this task file in place:

- check acceptance criteria
- add execution notes
- list created task files

Do not create derivative status files.

## Non-Goals

- Do not implement Cloudflare code.
- Do not add dependencies.
- Do not create Wrangler config unless the task graph explicitly assigns that to a future implementation task.
- Do not edit runtime code.
- Do not rename existing `operation`/`scope` surfaces.
- Do not create provider-neutral deployment architecture before one Cloudflare prototype proves the seams.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Task 308 output is reflected accurately.
- [x] A contiguous implementation DAG file is created.
- [x] Implementation task files are created for every DAG node.
- [x] Tasks are small enough for independent agents to execute/review.
- [x] Tasks use `Aim / Site / Cycle / Act / Trace` vocabulary correctly.
- [x] Tasks explicitly avoid generic deployment-framework overreach.
- [x] No implementation code, dependencies, runtime changes, CLI/API/DB renames, or Wrangler config are added by this task.
- [x] No derivative task-status files are created.

## Execution Notes

- **DAG chapter file created**: `.ai/tasks/20260420-320-329-cloudflare-site-prototype-chapter.md`
- **Implementation task files created**:
  - `20260420-320-cloudflare-site-manifest-schema.md`
  - `20260420-321-cloudflare-worker-scaffold.md`
  - `20260420-322-durable-object-site-coordinator.md`
  - `20260420-323-r2-trace-storage-adapter.md`
  - `20260420-324-secret-binding-and-egress-policy.md`
  - `20260420-325-bounded-cycle-runner-contract.md`
  - `20260420-326-sandbox-execution-proof-spike.md`
  - `20260420-327-operator-status-endpoint.md`
  - `20260420-328-local-to-cloudflare-smoke-fixture.md`
  - `20260420-329-prototype-closure-review.md`
- No implementation code, dependencies, or runtime changes were added.

## Suggested Verification

Task-file/documentation-only task:

```bash
pnpm verify
```

If no code is touched, task-file guard plus manual inspection of the DAG and created task files is sufficient.
