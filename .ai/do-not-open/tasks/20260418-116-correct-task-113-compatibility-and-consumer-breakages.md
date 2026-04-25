# Task 116: Correct Task 113 Compatibility And Consumer Breakages

## Why

Task 113 achieved the major structural migration into:

- `packages/layers/*`
- `packages/verticals/*`
- `packages/domains/*`

and the workspace currently builds.

But the execution left compatibility and consumer-facing breakages that make the migration incomplete.

This task is a corrective task for those concrete defects.

## Findings To Correct

### 1. `packages/charters` compatibility shim is invalid

Current state:

- `packages/charters/package.json` uses the name `@narada2/charters`
- `packages/domains/charters/package.json` also uses the name `@narada2/charters`
- `packages/charters` depends on `@narada2/charters`
- `packages/charters/src/index.ts` re-exports from `@narada2/charters`

That creates an invalid self-referential / duplicate-name compatibility arrangement.

A compatibility layer cannot share the exact same package identity as the target package while also depending on it as a workspace dependency.

### 2. Schema discovery for legacy consumers is broken

Current state:

- `narada.sonar/config/config.json` points at `../node_modules/@narada2/exchange-fs-sync/config.schema.json`
- `packages/exchange-fs-sync/package.json` now publishes only `dist/`

So the compatibility package no longer ships the config schema path that existing consumers still reference.

This breaks the practical consumer story even if runtime imports still work.

### 3. Consumer migration is unfinished

Known dependent repo `~/src/narada.sonar` still uses:

- legacy package dependencies
- legacy binary names
- legacy schema path

Task 113 required either:

- explicit compatibility that keeps consumers working, or
- concrete consumer migration

Right now it has neither in a complete form.

## Goal

Repair the compatibility layer and consumer path after Task 113 so the taxonomy migration is actually usable and coherent.

## Scope

This task must cover:

- fixing the broken `charters` compatibility arrangement
- restoring coherent schema discovery
- making `narada.sonar` work cleanly after the migration
- documenting the consumer migration path explicitly

## Non-Goals

- Do not redo the entire Task 113 migration
- Do not reopen package taxonomy design
- Do not introduce deprecated compatibility surfaces beyond what Task 113 already chose
- Do not mix this task with the later `narada` CLI hard cutover from Task 114

## Required Corrections

### 1. Fix `charters` Packaging Identity

Choose one coherent model and implement it fully.

Allowed solutions:

- keep `@narada2/charters` as the canonical published package and let `packages/domains/charters` be the physical implementation home only, without a second published package identity, or
- rename one side so the compatibility package and target package no longer share the same package name

Disallowed outcome:

- two workspace packages with the same package name
- a package depending on itself via workspace resolution
- a shim that re-exports from its own name

### 2. Restore Schema Path Coherence

Make sure config schema discovery works for consumers.

Allowed solutions:

- re-export / republish `config.schema.json` from the legacy compatibility package if that package remains part of the consumer path, or
- migrate consumers to the new schema path and update their configs accordingly

But the result must be explicit and working, not incidental.

### 3. Repair `narada.sonar`

Bring `~/src/narada.sonar` into one coherent state.

That means either:

- it is intentionally still on the legacy compatibility surface and all of its references work, or
- it is migrated to the new package/bin/schema names completely

Mixed half-state is not allowed.

Areas to fix:

- `package.json` dependencies
- `package.json` scripts
- `config/config.json` `$schema`
- README/setup guidance if needed

### 4. Produce Explicit Migration Note

Create a concrete migration note for downstream repos.

It should cover:

- old package names -> new package names
- old bin names -> new bin names
- old schema/doc paths -> new paths
- what existing ops repos must change

This note should be committed as part of the corrective work.

## Deliverables

- no duplicate package-name collision between old/new `charters` locations
- schema discovery works coherently for the chosen consumer path
- `narada.sonar` is no longer in a broken half-migrated state
- explicit migration note exists
- workspace still builds after corrections

## Definition Of Done

- [ ] there is no duplicate-package-name / self-dependency compatibility bug for `charters`
- [ ] schema resolution works for the intended consumer path
- [ ] `narada.sonar` runs coherently against either the legacy compatibility surface or the new names, but not a mixture
- [ ] a committed migration note exists for downstream consumers
- [ ] `pnpm build` still passes after the corrections

## Notes

This is a targeted corrective task for concrete migration defects discovered during review of Task 113 execution. It should be completed before calling Task 113 truly finished.
