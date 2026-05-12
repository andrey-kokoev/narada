# narada-proper.task-0024: Implement Greenfield Create-Site Live Carriers

## Authority Basis

- Site: `narada-proper`
- Authority root used by this carrier: `D:\code\narada`
- Upstream evidence: User Site report that Robin completed requirements and Bob implemented all four carriers.
- External evidence read:
  - `C:\Users\Andrey\Narada\kb\operations\greenfield-create-site-live-carriers.md`
  - `C:\Users\Andrey\Narada\tools\site-init\site-live-carriers.mjs`
  - `C:\Users\Andrey\Narada\tools\site-init\site-live-carriers.test.mjs`

The User Site artifacts were used as external implementation evidence and examples, not as Narada proper runtime truth.

## Goal

Recreate Narada proper greenfield create-Site live carriers for:

- target-Site local DB init/mutation;
- local storage/hydration;
- MCP registration transport;
- Windows profile mutation.

## Scope

- `tools/site-init/site-live-carriers.mjs`
- `tools/site-init/site-live-carriers.test.mjs`
- `tools/site-init/README.md`
- task/audit/ledger evidence under `.narada`

## Non-Goals

- No source Site runtime import.
- No direct Windows profile file mutation outside the target Site.
- No private MCP client config mutation.
- No source DB/task/inbox/checkpoint/roster/operator-surface/PC/secrets import.
- No destructive rollback or arbitrary repair.

## Verification

- `node --check tools\site-init\site-live-carriers.mjs`
- `node --test tools\site-init\site-live-carriers.test.mjs`
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts`

## Terminal Claim

Narada proper has a focused, tested live carrier implementation for the four previously blocked greenfield create-Site setup gates. Single-command orchestration through `narada sites create` remains a separate implementation slice.
