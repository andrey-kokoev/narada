# Task 199: Correct Task 198 USC Summary and Protocol Residuals

## Context

Task 198 tightened authority-class enforcement and moved `narada.usc` task status vocabulary toward compiler-only states:

```text
draft | proposed | admitted | archived
```

Review confirmed:

- `pnpm typecheck` passes in Narada proper.
- `pnpm --filter @narada2/charters test` passes.
- `pnpm --filter @narada2/ops-kit test` passes.
- `pnpm --filter @narada2/cli build` passes.
- `pnpm validate` passes in `narada.usc`.
- `narada init usc ...` still creates a valid app repo.

Two residuals remain.

## Findings

### 1. Narada proper still expects the old USC plan summary shape

`narada.usc` changed `plan()` summary from:

```text
runnable_count
blocked_count
```

to:

```text
proposed_count
admitted_count
```

But Narada proper still prints the old fields:

```text
Tasks: 10, Runnable: undefined, Blocked: undefined
```

This occurs in:

```bash
node packages/layers/cli/dist/main.js init usc /tmp/narada.usc.task198 --intent "I want ERP system" --domain erp --cis
```

### 2. `narada.usc` still has protocol/example drift around operator lifecycle

The compiler task schema now uses compiler statuses, but stale operator lifecycle language remains in canonical docs/examples.

Examples found during review:

```text
docs/protocols/construction-state.md: If a pending transformation fails readiness...
docs/system.md: TaskGraphFormed --> TaskClaimed: executor claims work
examples/full-cycle/07-outcome.md: T1 accepted, T2 open, ...
```

Some mentions of review/integration are valid downstream concepts, but canonical USC compiler examples should not use stale task status vocabulary like `accepted` or `open` as if it belongs to the `narada.usc` task graph.

## Required Changes

### A. Update Narada proper to consume the new plan summary

Update `packages/layers/cli/src/commands/usc-init.ts` and any type declarations in:

```text
packages/layers/cli/src/types/usc.d.ts
```

Expected output should be compiler-status aligned:

```text
Tasks: 10, Proposed: 10, Admitted: 0
```

Do not print `Runnable` or `Blocked` for USC compiler task graphs unless those concepts are reintroduced as derived downstream runtime state.

### B. Finish USC protocol/example cleanup

In `narada.usc`, update canonical docs/examples so compiler-owned task status vocabulary is only:

```text
draft | proposed | admitted | archived
```

Fix at minimum:

- `docs/protocols/construction-state.md`
- `docs/system.md`
- `examples/full-cycle/07-outcome.md`

Review all matches from:

```bash
rg -n "pending|claimed|executed|under_review|accepted|rejected|residualized|completed|blocked|open|loop" \
  packages/core/schemas packages/compiler/templates docs README.md AGENTS.md examples
```

Allowed matches must either:

- be generic English not referring to task status
- explicitly describe downstream runtime/operator concepts
- be part of residual/review vocabulary, not task graph status

### C. Re-run verification

In Narada proper:

```bash
pnpm typecheck
pnpm --filter @narada2/cli build
rm -rf /tmp/narada.usc.task199
node packages/layers/cli/dist/main.js init usc /tmp/narada.usc.task199 --intent "I want ERP system" --domain erp --cis
pnpm --dir /home/andrey/src/narada.usc validate --app /tmp/narada.usc.task199
rm -rf /tmp/narada.usc.task199
```

Expected:

- no `undefined` counts in CLI output
- generated repo validates

In `narada.usc`:

```bash
pnpm validate
```

## Definition Of Done

- [x] Narada proper prints the new USC plan summary fields.
- [x] USC type declarations match the current compiler API.
- [x] USC canonical docs/examples no longer use stale operator task statuses as compiler-owned task status.
- [x] `narada init usc ...` output contains no `undefined`.
- [x] generated USC app repo validates.
- [x] `pnpm validate` passes in `narada.usc`.
- [x] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
