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

- [x] QUICKSTART source-checkout instructions succeed on a clean machine
      (five-repo sibling layout now documented; that exact layout passed the
      2026-08-04 clean-machine build below)
- [ ] Release workflow attaches a working CLI artifact per supported platform
      (artifacts exist and are verified, but produced by
      `scripts/pack-artifact.mjs` run manually and attached to the rolling
      `cli-latest` prerelease — release.yml automation still open)
- [x] `irm https://narada.systems/install.ps1 | iex` installs without git/pnpm/build
- [x] End-to-end installer verification on a clean machine recorded in Execution Notes

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

### 2026-08-05 — Release-artifact install shipped (irm|iex is live)

1. **Approach**: `scripts/pack-artifact.mjs` (repo root, `pnpm pack:artifact`).
   Bundling approach from Required Work item 2 resolved as *neither* esbuild
   single-file nor `pnpm deploy`: the CLI's runtime graph (mermaid, vue, tsx,
   workspace dists, JSON contracts read from package roots) makes single-file
   bundling fragile, and `pnpm deploy --prod --legacy` produced a broken
   half-tree (missing externals). Instead the script stages the CLI plus the
   transitive closure of its workspace packages (including workspace
   devDependencies imported at runtime, promoted to dependencies) into a
   `vendor/` tree, rewrites `workspace:`/`link:` specs to `file:`, resolves
   the full external tree with `npm install --omit=dev --install-links
   --ignore-scripts --os <platform> --cpu <arch>`, materializes symlinks npm
   leaves into `vendor/`, and `npm pack`s with `bundleDependencies` = every
   installed package. Installing the tarball needs zero registry resolution.
2. **v1 failure recorded**: a tarball bundling only workspace packages (67)
   with externals left for install-time resolution installed HOLLOW external
   directories under `npm install -g --prefix` (npm 11.17.0): `commander/`
   existed but was empty, `chalk` had content. Verdict: bundle EVERYTHING.
3. **Platform-keyed natives**: the external tree carries esbuild, rolldown
   bindings, `@mariozechner/clipboard-*`, pi-tui prebuilds — one artifact per
   platform is required. Cross-builds work from one Windows host via npm's
   `--os`/`--cpu` flags (no package-lock, `--ignore-scripts`; all natives in
   the tree ship prebuilds).
4. **Artifacts**: `narada-cli-<win32,linux,darwin>-<x64,arm64>.tgz` (~89 MB
   each, ~249 packages bundled, 16–17 native binaries) plus
   `manifest-<platform>-<arch>.json` (sha256, counts) on rolling prerelease
   `cli-latest`: https://github.com/narada-core/narada/releases/tag/cli-latest
   All four asset URLs verified 200 unauthenticated.
5. **Installers**: narada.systems `/install.ps1` `/install.sh` now verify
   Node >= 22, map platform/arch, download the artifact, `npm install -g`
   (honoring `NARADA_NPM_PREFIX`). Source flow preserved at
   `/install-source.ps1` `/install-source.sh`, linked from the landing page.
   Latent PS 5.1 bug fixed: an em-dash inside a double-quoted string in
   install-source.ps1 decodes as a smart-quote string delimiter when read
   without a BOM — all installer content is now ASCII-only (PSParser-clean).
6. **End-to-end verification (2026-08-05)**: win32-x64 sandbox —
   `npm install -g --prefix <sandbox> narada-cli-win32-x64.tgz` then sandboxed
   `narada demo` printed the 5 mock upsert events and success JSON. Full
   live-path test: `irm https://narada.systems/install.ps1 | iex` with
   `NARADA_NPM_PREFIX` set to a clean prefix installed in ~4 min and the
   sandboxed `narada demo` again passed. The operator's real global npm and
   `~/.local/bin` shim were not touched. linux/darwin artifacts are
   structurally identical (same pack path, `--os`/`--cpu` native selection)
   but were NOT run on real Linux/macOS hardware.
7. **Open**: release.yml workflow automation (acceptance box 2); win32-arm64
   artifact if demand appears; cross-check of `added 1 package` npm counting
   quirk (cosmetic — install verified working regardless).
