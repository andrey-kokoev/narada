# Task 179: Correct Task 171 `refine --target` Overwrite Behavior

## Context

Task 171 required:

> Do not overwrite existing meaningful artifacts without `--force`.

Current implementation in:

```text
packages/cli/src/usc.js
```

still writes these files unconditionally when `--target` is provided:

```text
usc/refinement.json
usc/refinement.md
```

This can destroy prior refinement work.

## Goal

Make `usc refine --target` safe by default.

It must refuse to overwrite existing refinement artifacts unless `--force` is provided.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Fixes

### 1. Add `--force` handling to refine

Support:

```bash
pnpm usc -- refine --target <repo> --intent "..." --force
```

Behavior:

- If `usc/refinement.json` or `usc/refinement.md` already exists and `--force` is not set, exit non-zero.
- Error message must name the file(s) that would be overwritten.
- If `--force` is set, overwrite both files.

### 2. Avoid partial writes

If one target file exists and the other does not, do not write either file unless `--force` is set.

The command should check all target paths before writing.

### 3. Document behavior

Update README and/or CLI help:

```text
refine --target refuses to overwrite existing refinement artifacts unless --force is provided.
```

### 4. Preserve stdout mode

When `--target` is omitted, behavior should remain unchanged:

```bash
pnpm usc -- refine --intent "I want ERP system" --format json
```

prints refinement output to stdout.

## Acceptance Criteria

- First target write succeeds.
- Second target write without `--force` fails.
- Second target write with `--force` succeeds.
- No partial overwrite occurs.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
rm -rf /tmp/narada.usc.refine-smoke
pnpm usc -- init-app --name refine-smoke --target /tmp/narada.usc.refine-smoke --principal "Test Principal" --intent "Test app" --cis
pnpm usc -- refine --target /tmp/narada.usc.refine-smoke --intent "I want ERP system" --format json
node packages/cli/src/usc.js refine --target /tmp/narada.usc.refine-smoke --intent "I want ERP system" --format json && exit 1 || true
pnpm usc -- refine --target /tmp/narada.usc.refine-smoke --intent "I want ERP system" --format json --force
pnpm validate -- --app /tmp/narada.usc.refine-smoke
rm -rf /tmp/narada.usc.refine-smoke
pnpm validate
git status --short
```

If Task 170 has changed command names, adjust `init-app` to the current init command while preserving the refine overwrite checks.

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- overwrite behavior implemented
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
