# Migration Guide: Task 113 Package Taxonomy

This document describes the changes made in Task 113 (package taxonomy migration) and what downstream repos must update.

## What Changed

The monorepo packages were reorganized into a layered taxonomy:

| Old Location | New Location | Package Name |
|--------------|--------------|--------------|
| `packages/exchange-fs-sync` | `packages/layers/control-plane` | `@narada-core/control-plane` |
| `packages/exchange-fs-sync-cli` | `packages/layers/cli` | `@narada-core/cli` |
| `packages/exchange-fs-sync-daemon` | `packages/layers/daemon` | `@narada-core/daemon` |
| `packages/exchange-fs-sync-search` | `packages/verticals/search` | `@narada-core/search` |
| `packages/charters` | `packages/domains/charters` | `@narada-core/charters` |

## Compatibility Shims

Thin compatibility shims remain at the old package names for transitional use:

- `@narada-core/exchange-fs-sync` → re-exports `@narada-core/control-plane` (shim removed)
- `@narada-core/exchange-fs-sync-cli` → re-exports `@narada-core/cli` (shim removed)
- `@narada-core/exchange-fs-sync-daemon` → re-exports `@narada-core/daemon` (shim removed)
- `@narada-core/exchange-fs-sync-search` → re-exports `@narada-core/search` (shim removed)

The `@narada-core/charters` name moved entirely to `packages/domains/charters`; no shim remains at the old location.

## Binary Names

| Old Binary | New Binary | Package |
|------------|------------|---------|
| `exchange-sync` | `narada` | `@narada-core/cli` |
| `exchange-fs-sync-daemon` | `narada-daemon` | `@narada-core/daemon` |
| `exchange-fs-sync-search` | `narada-search` | `@narada-core/search` |

Legacy binaries have been removed. Use `narada`, `narada-daemon`, and `narada-search`.

## Schema Path

Config schema moved:

- Old: `node_modules/@narada-core/exchange-fs-sync/config.schema.json`
- New: `node_modules/@narada-core/control-plane/config.schema.json`

The compatibility shim has been removed. Update to the new path.

## What to Update in Your Ops Repo

If you have a private ops repo (e.g., `narada.sonar`) that depends on Narada packages:

### 1. `package.json` dependencies

Update `file:` references to point to the new physical locations:

```json
{
  "dependencies": {
    "@narada-core/charters": "file:../narada/packages/domains/charters",
    "@narada-core/cli": "file:../narada/packages/layers/cli",
    "@narada-core/daemon": "file:../narada/packages/layers/daemon",
    "@narada-core/search": "file:../narada/packages/verticals/search",
    "@narada-core/control-plane": "file:../narada/packages/layers/control-plane"
  }
}
```

### 2. `package.json` scripts

Update binary references:

```json
{
  "scripts": {
    "sync": "narada sync -c ./config/config.json",
    "sync:dry": "narada sync -c ./config/config.json --dry-run",
    "status": "narada status -c ./config/config.json",
    "daemon": "narada-daemon -c ./config/config.json",
    "search": "narada-search -h"
  }
}
```

### 3. `config/config.json` schema reference

Update the `$schema` field:

```json
{
  "$schema": "../node_modules/@narada-core/control-plane/config.schema.json"
}
```

### 4. Reinstall

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Workspace Consumers

If you consume Narada packages from within the monorepo via `workspace:*`, update your dependency names:

- `@narada-core/exchange-fs-sync` → `@narada-core/control-plane`
- `@narada-core/exchange-fs-sync-cli` → `@narada-core/cli`
- `@narada-core/exchange-fs-sync-daemon` → `@narada-core/daemon`
- `@narada-core/exchange-fs-sync-search` → `@narada-core/search`

The `workspace:*` protocol will resolve them to the new locations automatically.
