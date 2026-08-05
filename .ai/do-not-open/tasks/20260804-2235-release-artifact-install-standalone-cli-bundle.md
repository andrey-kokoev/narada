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

