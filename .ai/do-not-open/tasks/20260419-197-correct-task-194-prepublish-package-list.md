# Task 197: Correct Task 194 Prepublish Package List

## Context

Task 194 corrected Task 192 by removing machine-local `link:` dependencies from `@narada2/cli` and replacing the non-monotonic follow-up task with:

```text
.ai/do-not-open/tasks/20260419-195-register-usc-app-as-narada-operation.md
```

Review confirmed:

- `@narada2/cli` no longer declares `@narada.usc/*` link dependencies.
- the USC init smoke passes.
- generated USC app repos validate through `narada.usc`.

However, Task 194 required a relevant package/publish check. `pnpm pack:check` currently fails before checking package tarballs because `scripts/prepublish-check.ts` still references an old package path:

```text
packages/charters/package.json
```

Current package taxonomy uses:

```text
packages/domains/charters
```

## Required Change

Update `scripts/prepublish-check.ts` so its package list matches the current package taxonomy.

At minimum replace:

```ts
'packages/charters'
```

with:

```ts
'packages/domains/charters'
```

Then check for any other stale package paths in publish scripts:

```bash
rg -n "packages/charters|packages/exchange-fs-sync|packages/kernel|packages/layers/kernel" scripts package.json packages
```

Fix stale publish-script package paths only. Do not broaden this into a general docs sweep.

## Verification

Run:

```bash
pnpm pack:check
```

If `pnpm pack:check` exposes a second package metadata issue, fix it if it is directly caused by stale package taxonomy. If it exposes a larger unrelated publishing policy issue, create the next numbered corrective task with exact output.

Also rerun the Task 194 smoke:

```bash
pnpm --filter @narada2/cli build
rm -rf /tmp/narada.usc.erp
node packages/layers/cli/dist/main.js init usc /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --cis
pnpm --dir /home/andrey/src/narada.usc validate --app /tmp/narada.usc.erp
rm -rf /tmp/narada.usc.erp
```

## Definition Of Done

- [ ] `scripts/prepublish-check.ts` uses current package paths.
- [ ] no stale publish-script package paths remain.
- [ ] `pnpm pack:check` passes or a next-numbered task records the next unrelated blocker.
- [ ] Task 194 USC init smoke still passes.
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
