# Windows Credential and Path Binding Contract

> Cross-cutting contract for credential resolution and filesystem path binding across Windows Site variants.
>
> Tasks 373 and 374 implement against this document.

---

## 1. Overview

Windows Sites come in two variants:

| Variant | Runtime | Secret Store | Path Style |
|---------|---------|-------------|------------|
| **Native** | Windows 10/11 | Windows Credential Manager | Windows (`\\`) |
| **WSL** | WSL 2 (Linux) | env / `.env` file only | POSIX (`/`) |

This contract defines the canonical resolution precedence, naming conventions, and path utilities that both variants share.

---

## 2. Credential Resolution

### 2.1 Precedence

Secrets are resolved by name for a given site. The resolution order is:

**Native Windows** (highest to lowest):
1. Windows Credential Manager
2. Environment variable (`NARADA_{site_id}_{secret_name}`)
3. `.env` file in site root
4. Config file value (passed by caller)

**WSL** (highest to lowest):
1. Environment variable
2. `.env` file in site root
3. Config file value

> **Rationale**: Credential Manager is the most secure native store on Windows, so it wins. On WSL, Credential Manager is unavailable, so env vars are the highest-precedence secure channel.

### 2.2 Naming Conventions

#### Environment Variables

Format: `NARADA_{SITE_ID}_{SECRET_NAME}`

- Site ID and secret name are uppercased.
- Non-alphanumeric characters (except `_` and `-`) are replaced with `_`.

Examples:

| Site ID | Secret Name | Env Var |
|---------|-------------|---------|
| `prod` | `api_key` | `NARADA_PROD_API_KEY` |
| `my-site.dev` | `client-secret` | `NARADA_MY_SITE_DEV_CLIENT_SECRET` |

#### Credential Manager Targets

Format: `Narada/{site_id}/{secret_name}`

Used only for the native Windows variant. The target name is passed to `keytar.getPassword()`.

### 2.3 API

```typescript
import {
  resolveSecret,
  resolveSecretRequired,
  envVarName,
  credentialManagerTarget,
} from "@narada2/windows-site";

// Resolve with full precedence chain
const apiKey = await resolveSecret("prod", "api_key", "native");
// → string | null

// Resolve and throw if missing
const required = await resolveSecretRequired("prod", "api_key", "wsl");
// → string (throws with actionable message if not found)

// Build names manually
envVarName("prod", "api_key");           // "NARADA_PROD_API_KEY"
credentialManagerTarget("prod", "api_key"); // "Narada/prod/api_key"
```

### 2.4 Error Behavior

| Scenario | Behavior |
|----------|----------|
| Native variant on non-Windows | Throws: `"Windows Credential Manager resolution requested ... but the current platform is not Windows"` |
| Missing secret (optional) | Returns `null` |
| Missing secret (required) | Throws with list of checked locations |
| Empty string value | Treated as missing (returns `null`) |
| `keytar` not installed | Credential Manager step returns `null`; falls through to env / `.env` / config |

---

## 3. Site Root Resolution

### 3.1 Defaults

| Variant | Default Site Root | Override |
|---------|-------------------|----------|
| Native | `%LOCALAPPDATA%\\Narada\\{site_id}` | `NARADA_SITE_ROOT` env var |
| WSL | `/var/lib/narada/{site_id}` (if writable) | `NARADA_SITE_ROOT` env var |
| WSL fallback | `~/narada/{site_id}` | — |

### 3.2 API

```typescript
import { resolveSiteRoot, sitePath } from "@narada2/windows-site";

resolveSiteRoot("prod", "native");
// → "C:\\Users\\<user>\\AppData\\Local\\Narada\\prod"

resolveSiteRoot("prod", "wsl");
// → "/var/lib/narada/prod" (or "~/narada/prod" if /var/lib/narada not writable)

sitePath("prod", "wsl", "db", "coordinator.db");
// → "/var/lib/narada/prod/db/coordinator.db"
```

---

## 4. Path Utilities

### 4.1 Standard Subdirectories

When `ensureSiteDir(siteId, variant)` is called, the following subdirectories are created under the site root:

| Subdirectory | Purpose |
|-------------|---------|
| `state/` | Sync state, cursors, apply logs |
| `messages/` | Normalized message store |
| `tombstones/` | Deletion markers |
| `views/` | Computed views |
| `blobs/` | Binary large objects |
| `tmp/` | Temporary files |
| `db/` | SQLite databases |
| `logs/` | Log files |
| `traces/` | Trace artifacts |

### 4.2 Convenience Getters

```typescript
import {
  siteConfigPath,
  siteDbPath,
  siteLogsPath,
  siteTracesPath,
} from "@narada2/windows-site";

siteConfigPath("prod", "native");
// → "C:\\Users\\<user>\\AppData\\Local\\Narada\\prod\\config.json"

siteDbPath("prod", "wsl");
// → "/var/lib/narada/prod/db/coordinator.db"

siteLogsPath("prod", "wsl");
// → "/var/lib/narada/prod/logs"

siteTracesPath("prod", "wsl");
// → "/var/lib/narada/prod/traces"
```

### 4.3 Path Separator Rules

- **Native**: Always uses backslash (`\\`) regardless of the runtime platform.
- **WSL**: Always uses forward slash (`/`) regardless of the runtime platform.

This ensures that paths generated for a specific variant are correct even when the code runs on a different platform (e.g., tests running on Linux generating native Windows paths).

---

## 5. Testing

All resolution rules and path constructions are covered by unit tests in `packages/sites/windows/test/unit/`:

- `credentials.test.ts` — precedence chain, platform guard, missing credential errors
- `path-utils.test.ts` — site root resolution, path separators, directory creation, idempotency, WSL fallback

---

## 6. Cross-References

| Document | Relationship |
|----------|--------------|
| [`windows-site-boundary-contract.md`](windows-site-boundary-contract.md) | Parent boundary contract; references this module in §4.6 and §4.7 |
| [`windows-site-materialization.md`](windows-site-materialization.md) | Design document for the full Windows Site materialization |
| [`AGENTS.md`](../../AGENTS.md) | Kernel invariants that must not be violated |
