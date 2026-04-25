# Task 156: Sweep Stale Old-Kernel References After Control-Plane Rename

## Why

The physical package has moved from:

- `packages/layers/kernel`
- `@narada2/kernel`

to:

- `packages/layers/control-plane`
- `@narada2/control-plane`

Most runtime/package imports now use the new name, but review of Task 155 found remaining stale old-kernel references outside the root README/AGENTS scope, including package docs.

These stale references create broken links and confuse the distinction between:

- the **kernel lawbook** as a conceptual/spec term
- the **control-plane package** as the physical/package term

## Findings Being Corrected

At minimum, review found:

- `packages/layers/cli/README.md` still links to `../kernel/docs/06-configuration.md`

There may also be stale references in:

- package READMEs
- generated or committed lockfile links
- task files that are still meant to represent current repo state
- scripts/help text
- docs that refer to `@narada2/kernel` as a package rather than the conceptual kernel

## Goal

Make old-kernel references accurate after the control-plane rename.

## Required Outcomes

### 1. Fix stale physical paths

Replace stale physical paths such as:

- `packages/layers/kernel`
- `../kernel`
- `layers/kernel`

with the current `control-plane` paths wherever the reference is to the physical package/tree.

### 2. Fix stale package names

Replace stale package references such as:

- `@narada2/kernel`

with:

- `@narada2/control-plane`

where the reference is to the publishable package.

### 3. Preserve conceptual kernel wording where correct

Do **not** blindly remove the word `kernel`.

It remains valid when referring to:

- the kernel lawbook
- kernel invariants
- irreducible kernel semantics
- conceptual architecture

The sweep must distinguish conceptual vocabulary from stale package/path references.

### 4. Refresh generated dependency metadata if needed

If `pnpm-lock.yaml` still contains links to the old package/path, regenerate or update it coherently.

Do not hand-edit dependency metadata unless that is the repo's established pattern.

## Deliverables

- stale `packages/layers/kernel` path references removed from current-state docs
- stale `@narada2/kernel` package references removed from current package/docs surfaces
- broken links repaired
- lockfile/package metadata consistent with current workspace

## Definition Of Done

- [x] `rg 'packages/layers/kernel|layers/kernel|../kernel|@narada2/kernel'` shows no stale current-state package/path references
- [x] any remaining `kernel` wording is conceptual and intentional
- [x] package docs link to `control-plane` paths
- [x] lockfile/workspace metadata does not point at removed package paths
- [x] no derivative task-status files are created

## Execution Notes

### Sweep Results

The sweep found **zero stale package/path references** in current-state files. Prior tasks (notably Task 155) already repaired the known broken link in `packages/layers/cli/README.md` (`../kernel/docs/06-configuration.md` → `../control-plane/docs/06-configuration.md`).

### Verified Clean Surfaces

- **Source code imports**: No `@narada2/kernel` imports in any `packages/` source file
- **Package metadata**: All `package.json` files reference `@narada2/control-plane` in dependencies
- **Path references**: No `packages/layers/kernel`, `layers/kernel`, or `../kernel` in docs, configs, or scripts
- **Lockfile**: `pnpm-lock.yaml` contains zero references to `@narada2/kernel` or `packages/layers/kernel`
- **tsconfig.json**: No path mappings or stale references in any package

### Conceptual `kernel` Wording Preserved

The following intentional conceptual references remain correctly in place:

- `packages/layers/control-plane/docs/00-kernel.md` — the kernel lawbook itself
- `packages/layers/control-plane/README.md` — "The kernel is vertical-agnostic"
- `packages/layers/control-plane/AGENTS.md` — "durable kernel state"
- `packages/layers/cli/README.md` — "kernel-agnostic `@narada2/control-plane` library"
- `packages/layers/daemon/README.md` — "kernel pipeline"
- `packages/domains/charters/README.md` — "sits above the kernel"
- `packages/verticals/search/README.md` — "produced by the kernel"
- `scripts/control-plane-lint.ts` — "kernel modules remain domain-neutral"
- Root `README.md`, `AGENTS.md`, `QUICKSTART.md`, `SEMANTICS.md`, `PERFORMANCE.md` — all conceptual

### Verification

- `pnpm --filter=@narada2/control-plane typecheck` — passes
- `pnpm --filter=@narada2/cli typecheck` — passes
- `pnpm --filter=@narada2/daemon typecheck` — passes
- `pnpm --filter=@narada2/charters typecheck` — passes
- `pnpm --filter=@narada2/ops-kit typecheck` — passes

## Notes

This task is a sweep after the control-plane rename. It should not reopen the larger conceptual question of whether Narada has a kernel; it only removes stale package/path references.
