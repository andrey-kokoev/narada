# Task 182: Correct Task 170 Cycle Target Resolution

## Context

Task 170 corrected the command model to:

```bash
usc init <path>
usc cycle
usc validate
usc refine
```

Review found the command rename mostly landed in commit:

```text
f0162f0 refactor(usc): correct command semantics — init, cycle, validate
```

Old primary command names no longer appear in README/AGENTS/package/CLI surfaces.

However, the documented verification path fails:

```bash
cd /tmp/narada.usc.smoke
pnpm --dir /home/andrey/src/narada.usc usc -- cycle --intent "Smoke cycle"
```

Observed failure:

```text
No USC construction repo found at '/home/andrey/src/narada.usc'. Expected 'usc/' directory.
```

Cause:

`pnpm --dir /home/andrey/src/narada.usc` makes `process.cwd()` resolve to the constructor repo, not the caller’s app repo. The CLI therefore looks for `usc/` in `/home/andrey/src/narada.usc` instead of `/tmp/narada.usc.smoke`.

## Goal

Make `usc cycle` usable from the intended workflow.

The user should be able to create a cycle in a USC-governed repo without the CLI accidentally targeting the constructor repo.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Fixes

### 1. Support explicit target for cycle

Ensure this works:

```bash
pnpm --dir /home/andrey/src/narada.usc usc -- cycle --target /tmp/narada.usc.smoke --intent "Smoke cycle"
```

This may already be supported by code. If so, document and update verification.

### 2. Improve error message

If `usc cycle` is run without `--target` and `process.cwd()` is not a USC repo, error should explain:

```text
No USC construction repo found at <path>. If running through pnpm --dir, pass --target <repo>.
```

### 3. Update docs

Update README/AGENTS/examples to avoid the broken form:

Bad:

```bash
cd /tmp/narada.usc.smoke
pnpm --dir /home/andrey/src/narada.usc usc -- cycle --intent "Smoke cycle"
```

Good:

```bash
pnpm --dir /home/andrey/src/narada.usc usc -- cycle --target /tmp/narada.usc.smoke --intent "Smoke cycle"
```

If installed as a global CLI later, the natural form can remain:

```bash
cd /tmp/narada.usc.smoke
usc cycle --intent "Smoke cycle"
```

### 4. Preserve local direct CLI behavior

This should still work when invoked from an app repo without `pnpm --dir`:

```bash
cd /tmp/narada.usc.smoke
node /home/andrey/src/narada.usc/packages/cli/src/usc.js cycle --intent "Smoke cycle"
```

## Acceptance Criteria

- `usc cycle --target <repo>` creates a cycle in the target repo.
- Running cycle without a valid target gives a useful error.
- Docs no longer show the broken `pnpm --dir ... cycle` form without `--target`.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
rm -rf /tmp/narada.usc.smoke
pnpm usc -- init /tmp/narada.usc.smoke --name smoke --principal "Test Principal" --intent "Test construction" --cis --git
pnpm usc -- validate --app /tmp/narada.usc.smoke
pnpm usc -- cycle --target /tmp/narada.usc.smoke --intent "Smoke cycle"
pnpm usc -- validate --app /tmp/narada.usc.smoke
cd /tmp/narada.usc.smoke
node /home/andrey/src/narada.usc/packages/cli/src/usc.js cycle --intent "Direct node cycle"
pnpm --dir /home/andrey/src/narada.usc usc -- validate --app /tmp/narada.usc.smoke
rm -rf /tmp/narada.usc.smoke
cd /home/andrey/src/narada.usc
pnpm validate
git status --short
```

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- cycle target behavior
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

| File | Change |
|------|--------|
| `packages/compiler/src/create-cycle.js` | Improved error message: now suggests `--target <repo>` when running through `pnpm --dir` |
| `README.md` | Updated cycle examples to use `--target`; fixed stale `usc:json`/`usc:refine` script references |
| `AGENTS.md` | Updated cycle examples to show both direct node invocation and `--target` usage |

### Cycle Target Behavior

| Invocation | Result |
|------------|--------|
| `usc cycle --target /path/to/repo --intent ...` | Creates cycle in specified repo |
| `cd /path/to/repo && node /path/to/usc.js cycle --intent ...` | Creates cycle in current directory (CWD) |
| `pnpm --dir /substrate usc -- cycle --intent ...` | Fails with helpful error suggesting `--target` |

### Verification

- `pnpm usc -- init /tmp/narada.usc.smoke ...` → PASS
- `pnpm usc -- validate --app /tmp/narada.usc.smoke` → PASS
- `pnpm usc -- cycle --target /tmp/narada.usc.smoke --intent "Smoke cycle"` → PASS
- `pnpm usc -- validate --app /tmp/narada.usc.smoke` (after cycle) → PASS
- `cd /tmp/narada.usc.smoke && node /home/andrey/src/narada.usc/packages/cli/src/usc.js cycle --intent "Direct node cycle"` → PASS
- `pnpm --dir /home/andrey/src/narada.usc usc -- validate --app /tmp/narada.usc.smoke` → PASS
- `pnpm validate` → 35/35 passed
- Working tree clean

### Commit

`51c5c9b` — fix(usc): correct cycle target resolution and docs

### Residual Work

None.
