# Task 192: Add Narada Proper USC App Initialization

## Context

Task 191 establishes the authority split:

```text
narada.usc = USC compiler/artifact/domain package
narada proper = canonical user-facing runtime and authority surface
```

This leaves one product gap.

Users should not need to invoke `narada.usc` directly to create a USC-governed app repo. The canonical entry point should be Narada proper.

## Objective

Add a Narada proper command that initializes a USC app/construction repo by calling USC compiler functionality.

Target shape:

```bash
narada init usc ./narada.usc.erp --intent "I want ERP system" --domain erp --cis
```

Equivalent naming is acceptable if it fits the existing CLI grammar better, but the command must read as Narada proper creating a USC-governed app repo.

## Required Behavior

The command must:

- create a USC app repo at the target path
- write `usc/construction-state.json`
- write initial `usc/refinement.json` and `usc/refinement.md` when `--intent` is provided
- write `usc/task-graph.json` by planning from the refinement
- include CIS policy when `--cis` is passed
- use domain priors when `--domain <domain>` is provided
- validate the generated repo before reporting success
- keep `narada.usc` as the compiler/provider of USC-specific artifacts, not the canonical user CLI

## Boundary Rules

Narada proper may call `narada.usc` library functions classified as:

- `derive`
- `propose`

Narada proper must not call or depend on removed/non-canonical USC operator commands:

- `next`
- `execute`
- `complete`
- `reject`
- `block`
- `loop`

If any of those remain in `narada.usc`, this task must fail until Task 191 is corrected.

## Packaging / Dependency Guidance

Prefer a clean package dependency:

```text
@narada2/cli or @narada2/ops-kit
  -> @narada.usc/compiler or equivalent package export
```

Avoid shelling out to `pnpm --dir /path/to/narada.usc usc ...` as the canonical implementation.

If package naming is not yet publish-ready, use workspace/local package references, but keep the boundary library-shaped.

## Generated Repo Shape

Generated app repo should follow the convention:

```text
narada.usc.<app-name>/
  AGENTS.md
  README.md
  usc/
    construction-state.json
    refinement.json
    refinement.md
    task-graph.json
    policies/
    cycles/
    reviews/
    residuals/
    artifacts/
```

The generated README should tell users to continue through Narada proper, not through `narada.usc` operator commands.

## Optional Operation Registration

If coherent with current ops-kit/config shape, add an option:

```bash
--register-operation <operation-id>
```

This may write a Narada operation config entry pointing at the USC app repo.

If operation registration is not ready, document the gap and create a follow-up task. Do not fake it.

## Verification

Run in Narada proper:

```bash
pnpm verify
```

Run an end-to-end smoke:

```bash
rm -rf /tmp/narada.usc.erp
pnpm narada -- init usc /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --cis
test -f /tmp/narada.usc.erp/usc/construction-state.json
test -f /tmp/narada.usc.erp/usc/refinement.json
test -f /tmp/narada.usc.erp/usc/refinement.md
test -f /tmp/narada.usc.erp/usc/task-graph.json
pnpm --dir /home/andrey/src/narada.usc validate --app /tmp/narada.usc.erp
rm -rf /tmp/narada.usc.erp
```

Adjust the exact `pnpm narada -- ...` command if the repo uses a different local CLI invocation.

Also verify:

```bash
rg -n "next|execute|complete|reject|block|loop" packages/layers/cli packages/ops-kit packages/domains/charters
```

Expected:

- Narada proper does not introduce USC operator-command dependencies.

## Definition Of Done

- [ ] Narada proper exposes canonical USC app initialization.
- [ ] The command calls USC compiler/library functions, not shell-based USC CLI execution.
- [ ] Generated repo includes construction state, refinement, task graph, and policy artifacts.
- [ ] Generated docs point users back to Narada proper as the canonical surface.
- [ ] No USC operator commands are used.
- [ ] `pnpm verify` passes in Narada proper.
- [ ] generated app repo validates through `narada.usc`.
- [ ] follow-up task exists if operation registration is not yet implemented.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
