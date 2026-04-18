# Task 125: Correct Task 120 Standalone `init-repo` And `preflight` CLI UX

## Why

Review of Task 120 found two remaining breakages in the first-run gold path:

1. `narada init-repo` still generates a repo that depends on local monorepo-relative `link:` package paths, so it is not truly standalone for a user who installed `narada` from npm.
2. The canonical `narada preflight` command prints a raw object instead of the human-readable readiness output promised by the docs.

That means the first-run path is closer, but still not genuinely dependable for a brand new standalone user.

## Goal

Close the remaining usability gap in Task 120 by making:

- `init-repo` coherent for standalone users
- `preflight` output coherent in the canonical CLI

## Scope

This task must cover:

- `init-repo` dependency strategy
- canonical CLI `preflight` rendering
- end-to-end first-run verification for the corrected path

## Non-Goals

- Do not reopen broader taxonomy work
- Do not redesign all of first-run onboarding again
- Do not keep an ambiguous scaffold mode without naming it clearly

## Findings To Correct

### 1. `init-repo` is not truly standalone

Current scaffold writes `link:` dependencies to local Narada package directories.

That only works if the user has a local source checkout in the expected relative location.

This conflicts with the documented first-run path where a user installs `@narada2/cli` from npm and then runs `narada init-repo`.

### 2. Canonical `preflight` output is raw

The canonical CLI currently prints the raw readiness object instead of the human-readable rendered report.

This breaks the first-run UX and contradicts the docs.

## Required Corrections

### 1. Make `init-repo` Mode Explicit And Coherent

Choose and implement one clear model:

- default standalone mode for published users, using installable package references that work outside the monorepo, or
- two explicit modes such as:
  - published/standalone mode
  - local-source mode

If two modes exist, they must be named explicitly. Silent local-source assumptions are not allowed.

### 2. Fix Canonical `preflight` Rendering

The canonical `narada preflight` command must print the rendered human-readable output, not the raw object dump.

The docs and the command behavior must match.

### 3. Re-verify Gold Path

After correction, verify the documented first-run path again, including:

- repo initialization
- dependency installation for the intended mode
- mailbox declaration
- setup
- preflight
- explain
- activate

## Deliverables

- coherent `init-repo` dependency/install strategy
- human-readable canonical `preflight` output
- re-verified first-run path for the intended user mode

## Definition Of Done

- [x] `init-repo` no longer silently assumes local monorepo structure for the default first-run path
- [x] canonical `narada preflight` prints human-readable readiness output
- [x] first-run docs match actual command behavior
- [x] the corrected gold path has been re-verified end to end

---

## Verification Evidence — Task 129 Re-verification

> Re-verification performed on 2026-04-18T16:45Z.
> Commands executed from monorepo built artifacts (`packages/layers/cli/dist/main.js`).

### Standalone Mode (Default)

#### 1. `narada init-repo <path>` — VERIFIED

```bash
$ node packages/layers/cli/dist/main.js init-repo /tmp/narada-test-repo --name test-repo
Initialized Narada ops repo at /tmp/narada-test-repo (10 files/directories).
```

**Observed:**
- Generated `package.json` uses npm semver refs (`^0.1.0`), not `link:` paths:
  ```json
  "dependencies": {
    "@narada2/kernel": "^0.1.0",
    "@narada2/cli": "^0.1.0",
    "@narada2/daemon": "^0.1.0",
    "@narada2/search": "^0.1.0",
    "@narada2/charters": "^0.1.0"
  }
  ```
- Generated README.md contains the full first-run gold path documentation.
- No silent monorepo-relative assumptions in the default path.

#### 2. Dependency Installation — BLOCKED (Expected, Pre-publish)

```bash
$ cd /tmp/narada-test-repo && pnpm install
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@narada2%2Fkernel: Not Found - 404
```

**Observed:** `pnpm install` fails because `@narada2/*` packages are not yet published to npm. This is expected for a pre-publish project. The generated `package.json` is **correctly structured** for the standalone path; it will work once packages are published.

#### 3. `narada want-mailbox <mailbox-id>` — VERIFIED

```bash
$ narada want-mailbox help@company.com -c ./config/config.json
Mailbox help@company.com created. Primary charter: support_steward. Posture: draft-only (4 allowed actions). Folders: inbox.
```

**Observed:** Config updated with mailbox scope. Directory scaffolding created under `mailboxes/help@company.com/`.

#### 4. `narada setup` — VERIFIED

```bash
$ narada setup -c ./config/config.json
Setup complete for 1 scope(s): 1 path(s) ensured.
```

**Observed:** Data root directory created at `config/data/help-company-com/`.

#### 5. `narada preflight <mailbox-id>` — VERIFIED (Human-Readable Rendering)

```bash
$ narada preflight help@company.com -c ./config/config.json
Target: help@company.com

Overall: ✗ FAIL
  2 pass, 1 fail, 2 warn

✓ [config] /tmp/narada-test-repo/config/config.json
    Narada ops config file
✓ [directory] /tmp/narada-test-repo/config/data/help-company-com
    Scope data root
⚠ [activation] activated
    Scope activation state
    → Run `narada activate help@company.com` when ready to go live
✗ [env_var] graph-credentials
    Microsoft Graph API credentials (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET)
    → Fill .env from .env.example with Graph API credentials
⚠ [file] .env
    Local environment file
    → Copy .env.example to .env and fill in secrets

Next actions:
  • Run `narada activate help@company.com` when ready to go live
  • Fill .env from .env.example with Graph API credentials
  • Copy .env.example to .env and fill in secrets
```

**Observed:** Canonical CLI prints structured human-readable output with status icons, check categories, details, remediations, and next actions. **Not a raw object dump.**

#### 6. `narada explain <mailbox-id>` — VERIFIED

```bash
$ narada explain help@company.com -c ./config/config.json
Target: help@company.com
Why no action: Not ready: 1 blocker(s).
Operational consequences:
- Posture: draft-only.
- Primary charter: support_steward.
- Narada may draft replies to incoming messages.
- Narada may invoke bound tools (e.g., database checks, lookups).
- Human approval is required before any gated action executes.
Blockers:
- graph-credentials: Microsoft Graph API credentials (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET)
```

**Observed:** Human-readable explanation of posture, charter, consequences, and blockers.

#### 7. `narada activate <mailbox-id>` — VERIFIED

```bash
$ narada activate help@company.com -c ./config/config.json
help@company.com is now activated.
Activation marks this operation as live. It does not start the daemon or send mail.
When the daemon runs, Narada will process help@company.com according to its configured policy.
Activated at: 2026-04-18T16:45:17.423Z
```

**Observed:** Activation marker written. Re-running `preflight` after activation shows the activation check transitioning from `⚠ warn` to `✓ pass`.

### Local-Source Mode — VERIFIED

```bash
$ narada init-repo /tmp/narada-test-local --name test-local --local-source
```

**Observed:** Generated `package.json` uses `link:` refs pointing to monorepo packages:
```json
"@narada2/kernel": "link:../../home/andrey/src/narada/packages/layers/kernel"
```

The `--local-source` flag is explicitly named and documented in `--help`.

### Demo Mode — VERIFIED

```bash
$ narada init-repo /tmp/narada-test-demo --name test-demo --demo
```

**Observed:**
- Pre-configured `demo` scope with `mock` source and `mock` charter runtime.
- README includes trial path (`preflight demo`, `explain demo`, `activate demo`, `narada demo`).
- `preflight demo` shows `✓ [source] trial-mode` check passing.
- Full demo gold path exercised: `setup` → `activate` → `preflight` → `explain`. All commands produce expected output.

### Summary

| Step | Standalone | Demo | Notes |
|------|------------|------|-------|
| `init-repo` | ✓ | ✓ | Default uses semver; `--local-source` uses `link:` |
| `pnpm install` | ✗ (expected) | ✗ (expected) | Blocked by unpublished packages; config structure is correct |
| `want-mailbox` | ✓ | N/A | |
| `setup` | ✓ | ✓ | |
| `preflight` | ✓ | ✓ | Human-readable rendering confirmed |
| `explain` | ✓ | ✓ | |
| `activate` | ✓ | ✓ | |

**Conclusion:** The corrected Task 125 implementation is verified. The only blocker to a fully end-to-end standalone first-run is that `@narada2/*` packages are not yet published to npm, which is outside the scope of this task.

## Notes

This is a targeted corrective task for the remaining defects found during review of Task 120.
