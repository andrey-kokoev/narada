---
status: completed
depends_on: [307]
---

# Task 310 — Organize Root Docs by Semantic Layer

## Context

Root `docs/` currently mixes several kinds of documents as peers:

- bootstrap/product proof/operator loop docs
- runtime/USC boundary docs
- deployment-oriented docs about to be added by Task 308
- diagrams and system-explanation docs

This is starting to create physical semantic smear. Before Cloudflare Site materialization docs are added, organize root docs by conceptual layer.

## Goal

Create a coherent root `docs/` structure that separates concepts, product/use, deployment, and diagrams without rewriting content.

Target shape:

```text
docs/
  README.md
  concepts/
    runtime-usc-boundary.md
  product/
    bootstrap-contract.md
    first-operation-proof.md
    operator-loop.md
  deployment/
  diagrams/
```

If existing diagram docs are present, place them under `docs/diagrams/`.

## Required Work

### 1. Move Existing Docs

Move existing root docs into the appropriate folders.

Expected moves:

```text
docs/runtime-usc-boundary.md -> docs/concepts/runtime-usc-boundary.md
docs/bootstrap-contract.md -> docs/product/bootstrap-contract.md
docs/first-operation-proof.md -> docs/product/first-operation-proof.md
docs/operator-loop.md -> docs/product/operator-loop.md
```

If additional root docs exist, classify them intentionally.

### 2. Create `docs/README.md`

Add a short index explaining the folder meanings:

- `concepts/`: semantic and architecture-boundary concepts
- `product/`: user-facing product proofs, onboarding, operator loop
- `deployment/`: Site materialization and deployment target docs
- `diagrams/`: system diagrams and interaction diagrams

### 3. Update References

Update direct references in:

- root `AGENTS.md`
- root `README.md` if affected
- docs moved by this task if they cross-reference each other
- active task files only when they point to the old root-doc path and are likely to guide current agent work

At minimum update Task 308 so it creates:

```text
docs/deployment/cloudflare-site-materialization.md
```

and update Task 309 references accordingly.

### 4. Preserve Content

Do not rewrite the moved docs except for path references required after moving.

### 5. Verify No Broken Obvious References

Use `rg` to find stale references to:

```text
docs/runtime-usc-boundary.md
docs/bootstrap-contract.md
docs/first-operation-proof.md
docs/operator-loop.md
```

Update all current live references.

## Non-Goals

- Do not rewrite doc content.
- Do not implement Cloudflare deployment.
- Do not create Cloudflare design content.
- Do not rename CLI flags, DB columns, packages, or runtime APIs.
- Do not move package-local docs under `packages/layers/control-plane/docs/`.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Root `docs/` has `README.md`, `concepts/`, `product/`, `deployment/`, and `diagrams/`.
- [x] Existing root docs are moved into coherent folders.
- [x] Root `AGENTS.md` references are updated.
- [x] Root `README.md` has no affected references (no doc links in root README).
- [x] Task 308 and Task 309 point at the new deployment/concepts paths.
- [x] `rg` finds no stale references to moved root-doc paths.
- [x] No content rewrite beyond path/index updates.
- [x] No implementation code or API/DB/CLI renames.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
rg "docs/(runtime-usc-boundary|bootstrap-contract|first-operation-proof|operator-loop)\\.md" .
pnpm verify
```

If only Markdown path moves and task files are touched, task-file guard plus stale-reference `rg` evidence is sufficient.

## Execution Notes

### Docs Moved

| Old path | New path |
|----------|----------|
| `docs/runtime-usc-boundary.md` | `docs/concepts/runtime-usc-boundary.md` |
| `docs/system.md` | `docs/concepts/system.md` |
| `docs/mailbox-knowledge-model.md` | `docs/concepts/mailbox-knowledge-model.md` |
| `docs/bootstrap-contract.md` | `docs/product/bootstrap-contract.md` |
| `docs/first-operation-proof.md` | `docs/product/first-operation-proof.md` |
| `docs/operator-loop.md` | `docs/product/operator-loop.md` |
| `docs/day-2-mailbox-hardening.md` | `docs/product/day-2-mailbox-hardening.md` |
| `docs/live-graph-proof.md` | `docs/product/live-graph-proof.md` |
| `docs/live-trial-runbook.md` | `docs/product/live-trial-runbook.md` |
| `docs/mailbox-scenario-library.md` | `docs/product/mailbox-scenario-library.md` |
| `docs/operational-trial-setup-contract.md` | `docs/product/operational-trial-setup-contract.md` |
| `docs/runbook.md` | `docs/product/runbook.md` |
| `docs/cloudflare-site-materialization.md` | `docs/deployment/cloudflare-site-materialization.md` |
| `docs/systemd/` | `docs/deployment/systemd/` |

### References Updated

- `AGENTS.md`: 7 references updated to new paths.
- `docs/deployment/cloudflare-site-materialization.md`: 1 cross-folder link updated (`runtime-usc-boundary.md` → `../concepts/runtime-usc-boundary.md`).
- `docs/concepts/mailbox-knowledge-model.md`: 2 cross-folder links updated (`first-operation-proof.md` → `../product/first-operation-proof.md`, `bootstrap-contract.md` → `../product/bootstrap-contract.md`).
- `docs/product/first-operation-proof.md`: 3 cross-folder links updated (`mailbox-knowledge-model.md` → `../concepts/mailbox-knowledge-model.md`).
- `docs/product/*` internal relative links remain valid (all linked docs moved to same `product/` folder).
- Task 308: 3 references updated (`docs/cloudflare-site-materialization.md` → `docs/deployment/cloudflare-site-materialization.md`).
- Task 309: 2 references updated (`docs/cloudflare-site-materialization.md` → `docs/deployment/cloudflare-site-materialization.md`, `docs/runtime-usc-boundary.md` → `docs/concepts/runtime-usc-boundary.md`).

### Verification

- `rg "docs/(runtime-usc-boundary|bootstrap-contract|first-operation-proof|operator-loop)\.md"` — no matches.
- `rg "docs/cloudflare-site-materialization\.md"` — no matches.
- `pnpm build` — clean across all packages.
