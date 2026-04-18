# Task 119: Remove Remaining Legacy `exchange-*` Surfaces

## Why

The repository has already migrated toward the new package taxonomy, but legacy `exchange-*` surfaces still remain as compatibility packages and binary names.

That is not acceptable if the rule is:

> no legacy surface should remain lying around

Even functioning compatibility shims are still legacy surface area. They preserve the old conceptual model and keep the codebase semantically split.

## Goal

Remove all remaining legacy `exchange-*` package names, binary names, schema paths, and documentation references from the live Narada surface.

This is a hard cutover task, not a compatibility task.

## Scope

This task must cover:

- legacy package directories
- legacy package names
- legacy binary names
- legacy schema/doc references
- downstream repo references
- docs and examples still mentioning `exchange-*` as a live surface

## Non-Goals

- Do not reintroduce shims
- Do not preserve deprecated aliases
- Do not keep “temporary” compatibility packages around
- Do not reopen the package taxonomy design itself

## Required Removals

### 1. Remove Legacy Package Directories

Delete the remaining compatibility package surfaces:

- `packages/exchange-fs-sync`
- `packages/exchange-fs-sync-cli`
- `packages/exchange-fs-sync-daemon`
- `packages/exchange-fs-sync-search`

After this task, these package directories must not remain as active packages in the repo.

### 2. Remove Legacy Package Names

No user-facing or dependency-facing package references should remain to:

- `@narada2/exchange-fs-sync`
- `@narada2/exchange-fs-sync-cli`
- `@narada2/exchange-fs-sync-daemon`
- `@narada2/exchange-fs-sync-search`

The only valid package names should be the new taxonomy names.

### 3. Remove Legacy Binary Names

No shipped or documented binaries should remain under legacy names such as:

- `exchange-sync`
- `exchange-fs-sync-daemon`
- `exchange-fs-sync-search`

Only the new names should remain.

### 4. Remove Legacy Schema And Doc Paths

No active config/docs should point users to `exchange-fs-sync` package paths as the conceptual root.

Examples to eliminate:

- `node_modules/@narada2/exchange-fs-sync/config.schema.json`
- docs telling users to navigate via `packages/exchange-fs-sync/...`

### 5. Update Downstream Repos Fully

Known dependent repos must be brought fully onto the new surface:

- `~/src/narada.sonar`
- `~/src/narada.examples` if applicable

They must not rely on legacy package names, legacy binaries, or legacy schema paths.

## Deliverables

- no `exchange-*` compatibility packages remain in the repo
- no legacy Narada package names remain in live dependency surfaces
- no legacy binaries remain shipped or documented
- downstream repos are updated to the new names only
- workspace still builds after the hard removal

## Definition Of Done

- [ ] `packages/exchange-fs-sync*` compatibility package directories are gone
- [ ] legacy `@narada2/exchange-*` package references are gone from repo and known dependents
- [ ] legacy binary names are gone from shipped package manifests and docs
- [ ] schema/doc references use only the new package taxonomy
- [ ] `pnpm build` passes after removal
- [ ] a new contributor can no longer discover the old naming surface as a supported path

## Notes

This task supersedes any assumption that compatibility shims are an acceptable steady state. The target is one coherent Narada surface, not old and new in parallel.
