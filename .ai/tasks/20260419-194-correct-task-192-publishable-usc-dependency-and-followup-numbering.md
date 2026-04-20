# Task 194: Correct Task 192 Publishable USC Dependency and Follow-up Numbering

## Context

Task 192 added Narada proper as the canonical entry point for USC app repo initialization:

```bash
narada init usc /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --cis
```

Review confirmed the command works locally:

- `@narada2/cli` builds
- generated repo contains `construction-state.json`, `refinement.json`, `refinement.md`, and `task-graph.json`
- generated repo validates through `narada.usc`
- the implementation calls USC library functions rather than shelling out to USC operator commands

Two residuals remain.

## Findings

### 1. `@narada2/cli` now has non-publishable external `link:` dependencies

`packages/layers/cli/package.json` contains:

```json
"@narada.usc/compiler": "link:../../../../narada.usc/packages/compiler",
"@narada.usc/core": "link:../../../../narada.usc/packages/core"
```

Those packages are outside the Narada workspace and are currently marked private in `narada.usc`:

```json
{ "name": "@narada.usc/compiler", "private": true }
{ "name": "@narada.usc/core", "private": true }
```

This is acceptable for local proof, but not for a publishable Narada CLI. It conflicts with the broader goal that Narada packages should be npm-publishable and usable from ops repos.

### 2. Operation-registration follow-up task is not monotonically numbered

Task 192 created:

```text
.ai/tasks/20260419-192-follow-up-register-usc-app-operation.md
```

This violates the task numbering discipline. Follow-up tasks should receive the next monotonic task number, not reuse the parent task number.

## Required Changes

### A. Make the USC dependency strategy publishable

Choose one coherent strategy.

Preferred options:

- publish USC compiler/core packages under the `narada2` npm org, then depend on normal semver versions
- move the minimal USC compiler interface into a Narada workspace package if it is meant to ship with Narada
- define a plugin/provider loading boundary where `narada init usc` checks for an installed USC provider and gives a clear install error if absent

Do not keep `link:../../../../narada.usc/...` in a publishable package as final state.

The command may still use local workspace links during development, but package manifests intended for publish must not encode machine-local sibling repo paths.

### B. Fix follow-up task numbering

Replace:

```text
.ai/tasks/20260419-192-follow-up-register-usc-app-operation.md
```

with a monotonically numbered task, likely:

```text
.ai/tasks/20260419-195-register-usc-app-as-narada-operation.md
```

Preserve its content, but update title and references as needed.

### C. Re-run targeted verification

Run:

```bash
pnpm --filter @narada2/cli build
rm -rf /tmp/narada.usc.erp
node packages/layers/cli/dist/main.js init usc /tmp/narada.usc.erp --intent "I want ERP system" --domain erp --cis
pnpm --dir /home/andrey/src/narada.usc validate --app /tmp/narada.usc.erp
rm -rf /tmp/narada.usc.erp
```

Also run the packaging check that best reflects the chosen strategy:

```bash
pnpm pack:check
```

If `pnpm pack:check` is blocked by the known control-plane/V8 verification issue, document that precisely and run the narrow package check available for `@narada2/cli`.

## Verification Note

During Task 192 review, `pnpm verify` still failed at the control-plane unit-test step with:

```text
Fatal JavaScript invalid size error 169220804
Trace/breakpoint trap (core dumped)
```

That crash appears broader than Task 192 and is already captured by Task 193. Do not treat Task 194 as complete by ignoring package publishability.

## Definition Of Done

- [ ] `@narada2/cli` no longer has machine-local `link:` dependencies to sibling repos in its publishable manifest.
- [ ] USC provider/compiler dependency strategy is explicit and publishable.
- [ ] non-monotonic `20260419-192-follow-up-register-usc-app-operation.md` is replaced by a proper next-numbered task.
- [ ] `narada init usc ...` smoke still passes.
- [ ] generated USC app repo validates.
- [ ] relevant package/publish check passes or has a precise blocked-by reference to Task 193.
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
