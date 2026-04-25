# Task 113: Implement Package Taxonomy Migration

## Why

Narada's package structure still reflects the historical `exchange-fs-sync` origin rather than the current architecture.

That is now misleading in a way that affects real work:

- package names imply mailbox/Exchange primacy where the kernel is now vertical-neutral
- import paths teach the wrong conceptual model
- ops repos depend on legacy package names
- docs and schemas are discovered under mailbox-era names
- future work is pressured to keep extending the wrong taxonomy

Tasks `105` and `106` defined the target taxonomy, but they did not execute the repository migration.

## Goal

Implement the package taxonomy migration so the repository structure reflects the architecture directly.

This is a real repo migration task, not another concept-definition task.

## Target Shape

```text
packages/
  layers/
    kernel/
    sources/
    foreman/
    scheduler/
    intent/
    execution/
    outbound/
    observation/
    daemon/
    cli/
  verticals/
    mailbox/
    search/
  domains/
    charters/
    obligations/
    knowledge/
  ops-kit/
```

`ops-kit` remains top-level because it is an operator surface, not a kernel layer or business domain.

## Scope

This task must cover all of the following:

- actual package/folder creation and movement
- package.json rename decisions
- import path migration
- bin rename decisions
- config/schema/doc path migration
- compatibility shims where needed
- repo-level build/typecheck/test recovery
- migration notes for `narada.sonar` and `narada.examples`

## Non-Goals

- Do not redesign the kernel architecture again
- Do not merge/split conceptual layers beyond what `105` and `106` already settled
- Do not try to fully extract every future domain package now if the code does not justify it yet
- Do not break consumers without an explicit compatibility path

## Required Decisions

### 1. Physical Package Moves

Create the new package layout under `packages/layers`, `packages/verticals`, and `packages/domains`.

Minimum expected mapping:

- `packages/exchange-fs-sync` -> split across:
  - `packages/layers/kernel`
  - `packages/layers/sources`
  - `packages/layers/foreman`
  - `packages/layers/scheduler`
  - `packages/layers/intent`
  - `packages/layers/execution`
  - `packages/layers/outbound`
  - `packages/layers/observation`
  - `packages/verticals/mailbox`
- `packages/exchange-fs-sync-cli` -> `packages/layers/cli`
- `packages/exchange-fs-sync-daemon` -> `packages/layers/daemon`
- `packages/exchange-fs-sync-search` -> `packages/verticals/search`
- `packages/charters` -> `packages/domains/charters`

If `obligations` and `knowledge` remain mostly declarative at this stage, create placeholder packages only if they are needed for a coherent target tree; otherwise document them as reserved target slots.

### 2. Compatibility Strategy

Migration must not be a blind flag day.

Provide a compatibility approach for at least one transitional release:

- preserve legacy package names as thin re-export shims where feasible, or
- preserve old bin names as aliases, or
- document an explicit one-step consumer migration if shims are not practical

At minimum, the migration plan must account for:

- `@narada2/exchange-fs-sync`
- `@narada2/exchange-fs-sync-cli`
- `@narada2/exchange-fs-sync-daemon`
- `@narada2/exchange-fs-sync-search`

### 3. Binary Naming

Replace legacy mailbox-era bin names with Narada-conceptual names.

Examples to resolve explicitly:

- `exchange-sync`
- `exchange-fs-sync-daemon`
- `exchange-fs-sync-search`

The task must define the target bin names and whether legacy aliases remain temporarily.

### 4. Config And Schema Paths

Move schema/doc discovery away from mailbox-era package paths.

Examples:

- config schema currently under `packages/exchange-fs-sync/config.schema.json`
- docs currently under `packages/exchange-fs-sync/docs/`

Target locations must match the new package taxonomy.

### 5. Consumer Migration

Update known dependent repos/configs:

- `~/src/narada.sonar`
- `~/src/narada.examples` if any package references exist

At minimum, produce concrete migration notes for these repos even if their changes are split into follow-up tasks.

## Sequencing

Implementation should proceed in ordered stages.

### Stage 1: Introduce new package skeletons

- create new directories and package manifests
- establish new package names
- wire workspace/package discovery

### Stage 2: Move code by stable conceptual boundary

Migrate code in this order:

1. `domains/charters`
2. `layers/cli`, `layers/daemon`, `verticals/search`
3. generic kernel/sources/foreman/scheduler/intent/execution packages
4. `layers/outbound`
5. `layers/observation`
6. `verticals/mailbox`

Reason: mailbox split is the heaviest and should happen after the lower-level package seams exist.

### Stage 3: Restore repository health

- build passes
- typecheck passes
- tests pass
- package exports resolve
- schema generation still works
- docs link paths are repaired

### Stage 4: Apply compatibility and consumer updates

- legacy aliases/shims if chosen
- update ops repo references
- update examples references
- add migration notes

## Deliverables

- new package tree exists physically in the repo
- package names reflect target taxonomy
- imports updated or shimmed
- old `exchange-*` packages either removed or reduced to compatibility shims
- binaries renamed or aliased coherently
- docs/schema paths updated
- workspace passes build/typecheck/test
- migration note committed

## Definition Of Done

- [ ] `packages/layers`, `packages/verticals`, and `packages/domains` exist in the repo as the real package structure
- [ ] mailbox-era top-level package names are no longer the primary implementation homes
- [ ] imports/builds/tests run successfully through the new package graph
- [ ] legacy consumer surface has an explicit compatibility path
- [ ] `narada.sonar` can depend on the new package names coherently
- [ ] docs and schema discovery no longer require navigating through `exchange-fs-sync` as the conceptual root
- [ ] the repository can be explained to a new contributor without using historical exceptions as the main framing

## Notes

This task is intentionally large. It may need execution as a tracked migration epic with sub-tasks, but the deliverable is the real implementation of the package taxonomy change, not another planning artifact.
