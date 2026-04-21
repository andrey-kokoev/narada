---
status: opened
depends_on: [307]
---

# Task 308 — Cloudflare Site Materialization Design

## Context

Task 307 introduced the higher-order vocabulary:

```text
Aim / Site / Cycle / Act / Trace
```

Narada should not rush into Cloudflare implementation before defining how Cloudflare fits the crystallized ontology.

The intended design stance:

```text
Cloudflare is the first concrete Site materialization.
It is not the generic deployment layer itself.
```

Narada should learn the real deployment boundary from one honest Cloudflare-backed Site before extracting a provider-neutral substrate model.

## Goal

Design the first Cloudflare-backed `Site materialization` for Narada without writing implementation code.

The output should make clear:

- what Cloudflare resources map to in Narada's ontology
- how bounded Cycles run on Cloudflare
- what local assumptions must be removed or adapted
- what storage/secrets/scheduling/observability contracts are needed for a first prototype

## Required Work

### 1. Create Design Document

Create:

```text
docs/deployment/cloudflare-site-materialization.md
```

The document must define:

- `Site`: semantic anchor for an Aim-at-Site binding.
- `Site substrate`: capability class, here `cloudflare-workers-do-sandbox`.
- `Site materialization`: concrete Cloudflare project/resources.
- `Cycle runner`: Worker/Cron/Sandbox machinery that advances an Aim at the Site.
- `Trace storage`: where decisions, logs, run evidence, and health are written.

### 2. Map Cloudflare Resources to Ontology

Include a mapping table.

At minimum:

| Cloudflare Resource | Narada Reading |
| --- | --- |
| Worker | control/API surface and Cycle entrypoint |
| Cron Trigger | Cycle scheduler |
| Durable Object | per-Site coordination, lock, compact SQLite/control state |
| Durable Object SQLite | coordinator/control-state candidate |
| Sandbox / Container | bounded Cycle execution environment |
| R2 | large artifact, evidence, raw snapshot, backup storage |
| Worker Secrets | credential binding for Graph/Kimi/etc. |
| Routes / Access policy | operator surface exposure boundary |
| Queues / Workflows | deferred optional orchestration primitives |

### 3. Define Bounded Cloudflare Cycle

Specify one Cloudflare Cycle as a bounded attempt to:

1. acquire Site/Cycle lock
2. sync source deltas
3. derive/admit work
4. run charter evaluation
5. create draft/intent handoffs as allowed
6. reconcile submitted effects
7. update health and Trace
8. release lock and exit

The design must explicitly avoid long-running daemon assumptions.

### 4. Identify Local Assumptions That Break

Inventory current assumptions that do not transfer cleanly:

- local filesystem mailbox root
- PID-file daemon health
- local `better-sqlite3` coordinator file
- long-running process lifecycle
- `.env` file loading
- local logs as primary Trace
- direct package/file dependency layout
- one-shot CLI used as deployment primitive

For each, name the Cloudflare replacement or mark as unresolved.

### 5. Define Prototype Boundary

Define the smallest useful Cloudflare prototype.

It should be a design target, not implementation.

Candidate target:

```text
One Cloudflare Worker + one Durable Object + one R2 bucket + one Sandbox runner
can execute one bounded mailbox Cycle for one configured Aim-at-Site binding,
write health/Trace, and expose a private operator status endpoint.
```

Clarify what is in v0 and what is deferred.

### 6. Add Documentation Cross-References

Update root `AGENTS.md` Documentation Index with the new document.

Update `SEMANTICS.md §2.14` only if a small clarification is needed. Do not rewrite Task 307's semantic section.

## Non-Goals

- Do not implement Cloudflare Worker code.
- Do not create Wrangler config.
- Do not add Cloudflare dependencies.
- Do not migrate storage.
- Do not rename CLI flags, DB columns, or runtime APIs.
- Do not create a generic deployment framework.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `docs/deployment/cloudflare-site-materialization.md` exists.
- [x] The document uses `Aim / Site / Cycle / Act / Trace` correctly.
- [x] The document maps Cloudflare resources to Narada ontology.
- [x] The document defines a bounded Cloudflare Cycle.
- [x] The document inventories local assumptions that break on Cloudflare and names replacements or unresolved gaps.
- [x] The document defines a minimal v0 prototype boundary.
- [x] Root `AGENTS.md` links the document.
- [x] No implementation code, Cloudflare config, package dependency, CLI/API/DB rename, or generic deployment framework is added.
- [x] No derivative task-status files are created.

## Execution Notes

- **Design document created**: `docs/deployment/cloudflare-site-materialization.md` with definitions, resource mapping, bounded Cycle, assumption inventory, and v0 boundary.
- **Root AGENTS.md updated**: Documentation Index now links to the new document.
- **SEMANTICS.md §2.14**: No small clarification needed; existing definitions already cover the concepts used in the design doc.
- **No code changes**: No implementation code, Wrangler config, package dependencies, or renames were added.

## Suggested Verification

Documentation-only task:

```bash
pnpm verify
```

If no code or task guard-sensitive filenames are touched, manual inspection plus task-file guard evidence is acceptable.
