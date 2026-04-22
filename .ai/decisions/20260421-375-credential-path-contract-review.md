# Task 375 Review — Credential and Path Binding Contract

> Doc / code / test alignment review for Task 375.

## Scope

| Artifact | File |
|----------|------|
| Contract document | `docs/deployment/windows-credential-path-contract.md` |
| Credential resolver | `packages/sites/windows/src/credentials.ts` |
| Path utilities | `packages/sites/windows/src/path-utils.ts` |
| Credential tests | `packages/sites/windows/test/unit/credentials.test.ts` |
| Path tests | `packages/sites/windows/test/unit/path-utils.test.ts` |

## Alignment Matrix

| Contract Claim | Code | Tests | Verdict |
|----------------|------|-------|---------|
| **§2.1 Native precedence**: CM → env → `.env` → config | `credentials.ts:120-142` | `credentials.test.ts:60-108` | ✅ Pass |
| **§2.1 WSL precedence**: env → `.env` → config | `credentials.ts:125-142` | `credentials.test.ts:60-108` | ✅ Pass |
| **§2.2 Env naming**: `NARADA_{SITE_ID}_{SECRET_NAME}` uppercased, sanitized | `credentials.ts:26-30` | `credentials.test.ts:12-21` | ✅ Pass |
| **§2.2 CM target**: `Narada/{site_id}/{secret_name}` | `credentials.ts:36-40` | `credentials.test.ts:24-29` | ✅ Pass |
| **§2.4 Native on non-Windows throws** | `credentials.ts:107-113` | `credentials.test.ts:115-126` | ✅ Pass |
| **§2.4 Missing secret returns `null`** | `credentials.ts:144` | `credentials.test.ts:110-113` | ✅ Pass |
| **§2.4 Required secret throws with checked locations** | `credentials.ts:152-172` | `credentials.test.ts:149-205` | ✅ Pass |
| **§2.4 Empty string treated as missing** | `credentials.ts:127,134,140` | `credentials.test.ts:66-72` | ✅ Pass |
| **§2.4 `keytar` not installed falls through** | `credentials.ts:74-81` | Not directly testable (no `keytar` in deps) | ⚠️ Doc-claimed, code-handled, not covered by test |
| **§3.1 Native default**: `%LOCALAPPDATA%\Narada\{site_id}` | `path-utils.ts:58-69` | `path-utils.test.ts:127-134` | ✅ Pass |
| **§3.1 WSL default**: `/var/lib/narada/{site_id}` if writable | `path-utils.ts:72-78` | `path-utils.test.ts:73-85` | ✅ Pass |
| **§3.1 WSL fallback**: `~/narada/{site_id}` | `path-utils.ts:82` | `path-utils.test.ts:87-111` | ⚠️ Weak test (no real assertion) |
| **§3.1 Override**: `NARADA_SITE_ROOT` env var | `path-utils.ts:55-56` | `path-utils.test.ts:68-71` | ✅ Pass |
| **§4.1 Subdirectories**: 9 standard dirs | `path-utils.ts:8-18` | `path-utils.test.ts:186-202` | ✅ Pass |
| **§4.2 `siteDbPath`**: `db/coordinator.db` | `path-utils.ts:130-135` | `path-utils.test.ts:149-157` | ✅ Pass |
| **§4.3 Separators**: native=`\`, WSL=`/` | `path-utils.ts:20-22` | `path-utils.test.ts:113-125,154-157` | ✅ Pass |
| **Doc API §2.3**: `resolveSecret` exported | `index.ts:72-77` | — | ✅ Pass |
| **Doc API §2.3**: `resolveSecretRequired` exported | `index.ts:74` | — | ✅ Pass |
| **Doc API §2.3**: `envVarName` exported | `index.ts:72` | — | ✅ Pass |
| **Doc API §2.3**: `credentialManagerTarget` exported | `index.ts:73` | — | ✅ Pass |
| **Doc API §3.2**: `resolveSiteRoot` exported | `index.ts:11-12` | — | ✅ Pass |
| **Doc API §3.2**: `sitePath` exported | `index.ts:13` | — | ✅ Pass |
| **Doc API §4.2**: Convenience getters exported | `index.ts:15-18` | — | ✅ Pass |

## Findings

### 1. Type Mismatch — `WindowsVariant` vs `WindowsSiteVariant`

**Severity**: Minor

`credentials.ts` defines its own `WindowsVariant` type:
```typescript
export type WindowsVariant = "native" | "wsl";
```

But `./types.ts` already exports `WindowsSiteVariant` with the same shape. The credential resolver should reuse the canonical type instead of defining a duplicate.

**Fix**: Import `WindowsSiteVariant` from `./types.js` and remove the local `WindowsVariant` definition.

### 2. Untested `keytar` Fallback Path

**Severity**: Low

The contract documents: "`keytar` not installed → Credential Manager step returns `null`; falls through to env / `.env` / config."

The code implements this correctly (`credentials.ts:74-81` catches the dynamic import failure and returns `null`). However, no test verifies this path because `keytar` is not a dependency and is not mocked.

**Fix**: Add a test that mocks `import("keytar")` to throw, verifying the fallback behavior. Or document in the test file why this path is not tested (external dependency, covered by code review).

### 3. Weak WSL Fallback Test

**Severity**: Low

The test for WSL fallback to `~/narada/{site_id}` (`path-utils.test.ts:87-111`) does not actually assert the fallback behavior. It creates a read-only temp directory but cannot override the hardcoded `/var/lib/narada` path, so it just does `expect(true).toBe(true)`.

**Fix**: Either:
- Accept the limitation and add a code-level unit test that mocks `existsSync`/`accessSync` to verify the fallback logic, or
- Inject the base path as a parameter to make it testable.

### 4. `credentials.ts` Uses Platform `join` for `.env` Path

**Severity**: Very low / cosmetic

`resolveSecret` builds the `.env` path with `join(resolveSiteRoot(siteId, variant), ".env")` using the default `node:path` import. Since `resolveSiteRoot` already returns a variant-appropriate path, this works correctly. However, for absolute clarity, it could use `getPathLib(variant)` from `path-utils.ts` to ensure consistency.

**Verdict**: Not a bug; the result is correct because `resolveSiteRoot` already handled variant-specific separators.

## Corrective Actions Applied

None required for functional correctness. The following are recommended cleanups:

1. **Type deduplication** — Replace `WindowsVariant` with `WindowsSiteVariant` in `credentials.ts`.
2. **Test gap documentation** — Add a comment in `credentials.test.ts` explaining why the `keytar` fallback path is not directly tested.
3. **WSL fallback test** — Refactor `resolveSiteRoot` to accept an optional base path parameter, or mock `fs` functions for a real assertion.

## Verification

```bash
cd packages/sites/windows
npx tsc --noEmit                    # → pass
npx vitest run test/unit/credentials.test.ts test/unit/path-utils.test.ts  # → 31 pass
```
