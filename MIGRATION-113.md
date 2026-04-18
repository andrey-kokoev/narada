# Migration Guide: Task 113 Package Taxonomy

This document describes the changes made in Task 113 (package taxonomy migration) and what downstream repos must update.

## What Changed

The monorepo packages were reorganized into a layered taxonomy:

| Old Location | New Location | Package Name |
|--------------|--------------|--------------|
| `packages/exchange-fs-sync` | `packages/layers/control-plane` | `@narada2/control-plane` |
| `packages/exchange-fs-sync-cli` | `packages/layers/cli` | `@narada2/cli` |
| `packages/exchange-fs-sync-daemon` | `packages/layers/daemon` | `@narada2/daemon` |
| `packages/exchange-fs-sync-search` | `packages/verticals/search` | `@narada2/search` |
| `packages/charters` | `packages/domains/charters` | `@narada2/charters` |

## Compatibility Shims

Thin compatibility shims remain at the old package names for transitional use:

- `@narada2/exchange-fs-sync` → re-exports `@narada2/control-plane` (shim removed)
- `@narada2/exchange-fs-sync-cli` → re-exports `@narada2/cli` (shim removed)
- `@narada2/exchange-fs-sync-daemon` → re-exports `@narada2/daemon` (shim removed)
- `@narada2/exchange-fs-sync-search` → re-exports `@narada2/search` (shim removed)

The `@narada2/charters` name moved entirely to `packages/domains/charters`; no shim remains at the old location.

## Binary Names

| Old Binary | New Binary | Package |
|------------|------------|---------|
| `exchange-sync` | `narada` | `@narada2/cli` |
| `exchange-fs-sync-daemon` | `narada-daemon` | `@narada2/daemon` |
| `exchange-fs-sync-search` | `narada-search` | `@narada2/search` |

Legacy binaries have been removed. Use `narada`, `narada-daemon`, and `narada-search`.

## Schema Path

Config schema moved:

- Old: `node_modules/@narada2/exchange-fs-sync/config.schema.json`
- New: `node_modules/@narada2/control-plane/config.schema.json`

The compatibility shim has been removed. Update to the new path.

## What to Update in Your Ops Repo

If you have a private ops repo (e.g., `narada.sonar`) that depends on Narada packages:

### 1. `package.json` dependencies

Update `file:` references to point to the new physical locations:

```json
{
  "dependencies": {
    "@narada2/charters": "file:../narada/packages/domains/charters",
    "@narada2/cli": "file:../narada/packages/layers/cli",
    "@narada2/daemon": "file:../narada/packages/layers/daemon",
    "@narada2/search": "file:../narada/packages/verticals/search",
    "@narada2/control-plane": "file:../narada/packages/layers/control-plane"
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
  "$schema": "../node_modules/@narada2/control-plane/config.schema.json"
}
```

### 4. Reinstall

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Workspace Consumers

If you consume Narada packages from within the monorepo via `workspace:*`, update your dependency names:

- `@narada2/exchange-fs-sync` → `@narada2/control-plane`
- `@narada2/exchange-fs-sync-cli` → `@narada2/cli`
- `@narada2/exchange-fs-sync-daemon` → `@narada2/daemon`
- `@narada2/exchange-fs-sync-search` → `@narada2/search`

The `workspace:*` protocol will resolve them to the new locations automatically.
