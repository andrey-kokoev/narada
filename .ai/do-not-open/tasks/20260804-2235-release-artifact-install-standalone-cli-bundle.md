---
number: 2235
status: open
tags: release, install, marketing, website
---

# Task 2235: Release-artifact install — standalone CLI bundle for irm|iex

## Goal

Produce standalone per-platform CLI artifacts attached to GitHub Releases so
the narada.systems installers (`install.ps1`, `install.sh`) become
download-expand-PATH scripts instead of source builds.

## Context

The marketing site routes installation through source-bootstrap installers
(`https://narada.systems/install.ps1` / `/install.sh`) that implement
QUICKSTART's source-checkout path. Operator decision (2026-08-04): the install
end-state is a **release-artifact bundle** (pi.dev-style), not npm publish.

End-to-end testing of the installers (2026-08-04, clean temp dir) exposed a
latent product bug: **a lone clone of `narada-core/narada` cannot
`pnpm install`**. `pnpm-workspace.yaml` spans `../narada-core`,
`../mcp-surfaces`, `../agent-cli`, `../agent-tui`, and root `package.json`
depends on `workspace:*` sibling packages (`@narada-core/agent-cli`,
`@narada-core/agent-runtime-server`, `@narada-core/agent-tui`,
`@narada-core/agent-web-ui`), so pnpm fails with
`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`. The installers were patched to clone all
five repos side by side, but QUICKSTART's "Advanced: source checkout" section
still documents the lone-clone path and is wrong for clean machines.

## Required Work

1. **Fix QUICKSTART source-checkout docs** (independent quick fix): document
   the sibling-repo requirement, or make the workspace tolerate a lone clone.
2. **Choose bundling approach**: esbuild single-file ESM bundle vs
   `pnpm deploy`-pruned directory. Verify against `node:sqlite` usage and the
   CLI's workspace dependency graph (`@narada-core/cli` → control-plane →
   sibling packages).
3. **Extend `.github/workflows/release.yml`**: build and attach per-platform
   artifacts (windows-x64, linux-x64, macos arm64/x64 as earned) to the
   Changesets release.
4. **Rewrite the narada.systems installers** to fetch the latest release
   artifact, expand to a canonical install dir, and shim PATH. Keep the
   source-bootstrap scripts available as `install-source.ps1` /
   `install-source.sh`.
5. **Reinstate honest install time/copy** on the landing page once install is
   a download rather than a build (no speed promises until then — operator
   directive 2026-08-04: speed is not Narada's objective).

## Non-Goals

- npm publishing decision (separate question; `@narada-core/cli` and
  `@narada2/cli` are both unpublished as of 2026-08-04).
- Code signing / notarization.
- Package-manager distribution (scoop, winget, brew).

## Acceptance Criteria

- [ ] QUICKSTART source-checkout instructions succeed on a clean machine
- [ ] Release workflow attaches a working CLI artifact per supported platform
- [ ] `irm https://narada.systems/install.ps1 | iex` installs without git/pnpm/build
- [ ] End-to-end installer verification on a clean machine recorded in Execution Notes

## Execution Notes

### 2026-08-04 — Installer end-to-end findings (clean temp workspace)

1. **Lone-clone install failure (confirmed)**: `pnpm install` in a lone clone
   fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` (`@narada-core/agent-cli` and
   other `workspace:*` sibling deps). Installers patched to clone all five
   repos side by side (narada, narada-core, mcp-surfaces, agent-cli,
   agent-tui). Deployed to narada.systems.
2. **mcp-surfaces missing declared types (upstream bug)**: 41 packages under
   `mcp-surfaces/packages/**` import `node:*` builtins but declare no
   `@types/node` (and no `typescript`) — clean-machine `tsc -b` fails with
   TS2307/TS2503/TS2580. Root cause: pnpm publicly hoists `@types/*` to the
   narada workspace root, which narada's own packages reach via tsc's upward
   typeRoots walk; sibling-repo packages sit outside that root and their walk
   never reaches it. Dev machines mask this with stale per-package state.
   Fix: each affected package declares `@types/node@^22.15.3` +
   `typescript@^5.8.3` (convention per `mcp-fabric-contracts`).
3. **agent-tui hardcoded sibling path assumption**: its cargo build reads
   `../../narada/packages/*/contracts/*.json` relative to `src/` — the narada
   checkout must be a sibling **literally named `narada`**. Installers warn
   when `NARADA_SRC` does not end in `narada`. Portability follow-up: make
   agent-tui resolve the narada root the same way mcp-surfaces 3fbc4e4 did.
4. **Resolution (2026-08-04)**: full clean-machine build passed in canonical
   layout (five repos side by side, narada named `narada`): `pnpm install`
   (24.5s), `pnpm build` (all 122 workspace projects incl. cargo), and
   `node packages/layers/cli/dist/main.js demo` ran the zero-setup demo
   successfully (5 mock messages, draft-only posture warning, success JSON).
   The 42-package type fix was upstreamed to `narada-core/mcp-surfaces@main`
   (commit f5a9de4). The repo's own `install-narada-shim.sh` was not exercised
   in the test (it would have overwritten the operator's real `~/.local/bin`
   shim to point at a temp checkout); everything up to the shim step is
   verified.
