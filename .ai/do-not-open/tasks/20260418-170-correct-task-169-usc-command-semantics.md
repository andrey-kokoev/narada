# Task 170: Correct Task 169 USC Command Semantics

## Context

Task 169 correctly pivots `narada.usc` toward:

```text
narada.usc = executable implementation of the Universal Systems Constructor
```

However, its command model preserves the earlier weaker framing:

```bash
usc init-session
usc init-app
```

That is semantically off.

A user does not wake up wanting to create a “session.” They want to start constructing a system. A session/cycle may exist internally, but it should not be the primary user-facing primitive.

## Correct Command Semantics

Use:

```bash
usc init <path> --name <name> --principal <name> --intent <text> [--cis] [--git] [--force]
```

Meaning:

> initialize a USC-governed construction repo/workspace at `<path>`.

Use:

```bash
usc cycle --intent <text> [--name <cycle-name>]
```

Meaning:

> open a new construction cycle/checkpoint inside an existing USC-governed repo.

Use:

```bash
usc validate [--app <path>]
```

Meaning:

> validate USC artifacts against constructor schemas/policies.

Future commands:

```bash
usc plan
usc compile
```

Do not implement future commands beyond clear placeholders unless already trivial.

## Goal

Correct Task 169’s implementation target before or during execution so `narada.usc` exposes a coherent constructor CLI:

```text
usc init      # initialize a USC-governed construction repo
usc cycle     # open a construction cycle in an existing repo
usc validate  # validate USC artifacts
```

Do not preserve `init-session` as the main command.

## Required Corrections to Task 169

When executing Task 169, apply these corrections:

### 1. Replace `init-session`

Do not use this as a primary command:

```bash
usc init-session
```

Replace with:

```bash
usc cycle
```

If backward compatibility is needed temporarily, it may exist only as an undocumented alias with a deprecation warning. Prefer no alias if not already published.

### 2. Replace `init-app`

Do not use this as the primary command:

```bash
usc init-app
```

Replace with:

```bash
usc init <path>
```

The initialized target is a USC-governed construction repo. It may become an app, service, library, runtime operation, or any other constructed system.

### 3. Target repo layout

Generated repo should look like:

```text
<target>/
  README.md
  AGENTS.md
  usc/
    construction-state.json
    decision-surface.md
    task-graph.json
    reviews/
    residuals/
    closures/
    cycles/
      <cycle-name>/
```

Product code belongs outside `usc/`.

### 4. Root scripts

Root scripts in `narada.usc` should favor:

```json
{
  "scripts": {
    "validate": "node packages/cli/src/usc.js validate",
    "usc": "node packages/cli/src/usc.js"
  }
}
```

Avoid accumulating many script aliases for every command.

Usage:

```bash
pnpm usc -- init ../narada.usc.helpdesk --name helpdesk --principal "Alice" --intent "Build helpdesk system" --cis --git
pnpm usc -- validate --app ../narada.usc.helpdesk
pnpm usc -- cycle --intent "Add support mailbox operation"
```

### 5. Documentation language

README should not say “start a session” as the main path.

Use:

```text
Initialize a USC-governed construction repo.
Open a construction cycle.
Validate USC artifacts.
```

### 6. Package architecture remains from Task 169

Keep Task 169’s package architecture:

```text
packages/core
packages/compiler
packages/cli
packages/policies
```

Only correct the user-facing command model and generated repo semantics.

## Acceptance Criteria

- No primary docs present `init-session` as a first-class command.
- `usc init <path>` initializes a USC-governed construction repo.
- `usc cycle` creates a new construction cycle/checkpoint in an existing repo or the current repo.
- `usc validate` validates USC artifacts.
- Generated repo uses `usc/` for construction artifacts.
- README explains the corrected command model.
- AGENTS.md explains that `session` is not the user-facing primitive.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run after Task 169 implementation:

```bash
cd /home/andrey/src/narada.usc
pnpm usc -- init /tmp/narada.usc.smoke --name smoke --principal "Test Principal" --intent "Test construction" --cis --git
pnpm usc -- validate --app /tmp/narada.usc.smoke
cd /tmp/narada.usc.smoke
pnpm --dir /home/andrey/src/narada.usc usc -- cycle --intent "Smoke cycle"
pnpm --dir /home/andrey/src/narada.usc usc -- validate --app /tmp/narada.usc.smoke
rm -rf /tmp/narada.usc.smoke
cd /home/andrey/src/narada.usc
pnpm validate
git status --short
```

## Output

Commit corrections in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- command model implemented
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.

---

## Execution Notes

**Date:** 2026-04-13

### Command Model Implemented

| Old Command | New Command | Meaning |
|-------------|-------------|---------|
| `usc init-session` | `usc cycle --intent <text>` | Open a construction cycle/checkpoint |
| `usc init-app --target <path>` | `usc init <path>` | Initialize a USC-governed construction repo |
| `usc list-sessions` | — | Removed (not a user-facing primitive) |
| `usc validate` | `usc validate` | Unchanged |
| `usc refine` | `usc refine` | Unchanged |

### Files Changed

| File | Change |
|------|--------|
| `packages/compiler/src/init-app.js` | Renamed → `init-repo.js`, exports `initRepo`, creates `usc/cycles/` |
| `packages/compiler/src/init-session.js` | Deleted |
| `packages/compiler/src/create-cycle.js` | New — creates cycles under `usc/cycles/<name>/` with manifest and state snapshot |
| `packages/compiler/src/index.js` | Exports `initRepo` and `createCycle` |
| `packages/cli/src/usc.js` | Replaced `init-session`/`init-app`/`list-sessions` with `init`/`cycle` |
| `package.json` | Removed accumulated aliases (`usc:init`, `usc:list`, `usc:init-app`, `usc:refine`, `usc:json`); kept only `usc` and `validate` |
| `README.md` | Updated command examples and descriptions |
| `AGENTS.md` | Updated to explain `session` is not the user-facing primitive; added `init` and `cycle` examples |
| `CONTRIBUTING.md` | Updated verification examples |

### Generated Repo Layout

```
<target>/
  README.md
  AGENTS.md
  usc/
    construction-state.json
    task-graph.json
    reviews/
    residuals/
    closures/
    cycles/
```

### Verification

- `pnpm usc -- init /tmp/narada.usc.smoke --name smoke --principal "Test Principal" --intent "Test construction" --cis --git` → PASS
- `pnpm usc -- validate --app /tmp/narada.usc.smoke` → PASS (including app validation)
- `pnpm usc -- cycle --target /tmp/narada.usc.smoke --intent "Smoke cycle" --name smoke-cycle` → PASS
- `pnpm validate` → 35/35 passed
- Working tree clean

### Commit

`f0162f0` — refactor(usc): correct command semantics — init, cycle, validate

### Residual Work

None.
