# Publishing Narada Packages

This repo publishes public npm packages under `@narada2/*`.

Current packages:

- `@narada2/control-plane`
- `@narada2/cli`
- `@narada2/daemon`
- `@narada2/search`
- `@narada2/charters`
- `@narada2/ops-kit` (library only, no binary)
- `@narada2/ui` (compiled renderer-neutral stylesheet)

`config/npm-publication-packages.json` is the canonical publication package
inventory. Release validation reads that manifest directly; this list is its
operator-facing summary.

## Intended Split

- `narada`: public source repo and publish source of truth
- `narada.sonar`: private operational repo consuming released packages or local `file:` links during development
- `~/mailboxes/...`: live compiled state and mailbox data

Operational knowledge, private mailbox configs, and customer-specific playbooks should not live in the public repo.

## One-Time Setup

1. Ensure npm ownership exists for the `@narada2` scope.
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
pnpm --config.node-linker=hoisted exec changeset publish
```

## Notes

- `pnpm release` will modify package versions and changelog files before publish.
- After a successful publish, commit those version bumps.
- Private ops repos such as `narada.sonar` should consume the published `@narada2/*` packages, not copy source code.
