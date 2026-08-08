# Publishing Narada Packages

This repo publishes public npm packages under `@narada-core/*`.

Current packages:

- `@narada-core/control-plane`
- `@narada-core/cli`
- `@narada-core/daemon`
- `@narada-core/search`
- `@narada-core/charters`
- `@narada-core/ops-kit` (library only, no binary)
- `@narada-core/ui` (compiled renderer-neutral stylesheet)

`config/npm-publication-packages.json` is the canonical publication package
inventory. Release validation reads that manifest directly; this list is its
operator-facing summary.

Each canonical package has a `prepublishOnly` admission gate. Only
`scripts/publish-local.ts` issues the short-lived, package-scoped grant consumed
by that gate. Direct `changeset publish` and direct `npm publish` calls fail
before publication.

## Intended Split

- `narada`: public source repo and publish source of truth
- `narada.sonar`: private operational repo consuming released packages or local `file:` links during development
- `~/mailboxes/...`: live compiled state and mailbox data

Operational knowledge, private mailbox configs, and customer-specific playbooks should not live in the public repo.

## CLI Artifact Release (separate from npm)

The installable Narada CLI is distributed as a self-contained per-platform
tarball, not through the npm registry. The npm release process below publishes
`@narada-core/*` packages; the artifact release process publishes the runnable
CLI.

- Workflow: `.github/workflows/release-artifact.yml` runs on `workflow_dispatch`.
- It clones the four sibling workspace repos (`narada-core`, `mcp-surfaces`,
  `agent-cli`, `agent-tui`), installs dependencies, builds the workspace
  (TypeScript + native Rust), and runs `scripts/pack-artifact.mjs` for each
  platform (`win32-x64`, `linux-x64`, `darwin-arm64`).
- It uploads `narada-cli-<platform>-<arch>.tgz` and
  `manifest-<platform>-<arch>.json` to the `cli-latest` GitHub prerelease,
  clobbering the previous assets.
- The narada.systems installers (`/install.ps1`, `/install.sh`) fetch from
  `cli-latest`, so a new artifact run updates what first-time users install.

To verify a release artifact locally:

```bash
node scripts/pack-artifact.mjs --platform linux --arch x64
# inspect artifacts/manifest-linux-x64.json; rust_runtime_binary should be true
```

## One-Time Setup

1. Ensure npm ownership exists for the `@narada-core` scope.
2. Run `npm login` with an account that can publish under that scope.
3. Keep the git worktree clean before publishing.

## Single Safe Publish Command

```bash
pnpm release
```

That command runs `scripts/publish-local.ts` and performs the release in this order:

1. verifies the git worktree is clean
2. verifies `npm whoami` succeeds
3. verifies at least one `.changeset/*.md` file exists
4. refuses changesets that name packages outside the canonical publication manifest
5. runs `pnpm prepublish-check`
6. runs `pnpm version-packages`
7. rebuilds packages
8. runs `pnpm pack:check`
9. runs `changeset publish`

If any step fails, publishing stops.

## Manual Flow

If you want to run the steps yourself:

```bash
pnpm prepublish-check
pnpm version-packages
pnpm build
pnpm pack:check
pnpm release
```

## Notes

- `pnpm release` will modify package versions and changelog files before publish.
- After a successful publish, commit those version bumps.
- Private ops repos such as `narada.sonar` should consume the published `@narada-core/*` packages, not copy source code.
