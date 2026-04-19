# Task 181: Correct USC CLI Machine Output

## Context

Task 180 verification specified commands like:

```bash
pnpm usc -- refine --intent "I want ERP system" --domain erp --format json
```

During review, redirecting this output to a file produced invalid JSON because `pnpm` prints script headers to stdout:

```text
> narada.usc@0.1.0 usc /home/andrey/src/narada.usc
> node packages/cli/src/usc.js ...
{ ...json... }
```

Direct node invocation works:

```bash
node packages/cli/src/usc.js refine --intent "I want ERP system" --domain erp --format json
```

But user-facing machine-readable commands should be reliable without requiring users to know pnpm quirks.

## Goal

Make USC machine-readable output easy and reliable.

Users should have a documented command that emits clean JSON to stdout.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Fixes

### 1. Add clean output script

Add a package script that invokes the CLI without pnpm lifecycle noise.

Recommended:

```json
{
  "scripts": {
    "usc:json": "node packages/cli/src/usc.js"
  }
}
```

Then this should emit clean JSON:

```bash
pnpm --silent usc:json refine --intent "I want ERP system" --domain erp --format json
```

Alternatively, document that machine-readable usage must use:

```bash
pnpm --silent usc -- refine ...
```

But prefer a clearer script if possible.

### 2. Update docs and verification examples

Update README/docs so JSON examples use one of:

```bash
pnpm --silent usc -- refine ...
pnpm --silent usc:json refine ...
node packages/cli/src/usc.js refine ...
```

Do not present commands that produce script headers when redirected.

### 3. Add a smoke check

Ensure this passes:

```bash
pnpm --silent usc -- refine --intent "I want ERP system" --domain erp --format json \
  | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); if (d.detected_domain !== "erp") process.exit(1)'
```

If using `usc:json`, verify that command instead.

### 4. Preserve human output

Do not remove Markdown/human output mode.

## Acceptance Criteria

- There is a documented machine-readable command for clean JSON output.
- ERP/helpdesk/marketplace JSON output can be piped into `JSON.parse`.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm --silent usc -- refine --intent "I want ERP system" --domain erp --format json | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); if (d.detected_domain !== "erp") process.exit(1); console.log(d.detected_domain)'
pnpm --silent usc -- refine --intent "I want support helpdesk" --domain helpdesk --format json | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); if (d.detected_domain !== "helpdesk") process.exit(1); console.log(d.detected_domain)'
pnpm --silent usc -- refine --intent "I want marketplace" --domain marketplace --format json | node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync(0,"utf8")); if (d.detected_domain !== "marketplace") process.exit(1); console.log(d.detected_domain)'
pnpm validate
git status --short
```

If a different clean-output command is chosen, update these verification commands accordingly.

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- clean JSON command
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.

---

## Execution Notes

**Date:** 2026-04-13

### Changes Made

1. **`package.json`** — Added `"usc:json": "node packages/cli/src/usc.js"` script
   - Semantically clear entrypoint for machine-readable JSON output
   - Existing `usc:refine` kept for human-facing Markdown output

2. **`README.md`** — Updated refine examples:
   - JSON examples now use `pnpm --silent usc:json refine ... --format json`
   - Markdown examples kept as `pnpm usc:refine -- ... --format md`
   - Target-write example updated to silent JSON path

3. **`CONTRIBUTING.md`** — Updated manual verification example:
   - Changed refinement test to `pnpm --silent usc:json refine ... --format json`
   - Added comment explaining `--silent` is for clean stdout

### Clean JSON Commands

| Use Case | Command |
|----------|---------|
| Machine-readable JSON | `pnpm --silent usc:json refine --intent "..." --format json` |
| Machine-readable JSON (alt) | `pnpm --silent usc -- refine --intent "..." --format json` |
| Human-readable Markdown | `pnpm usc:refine -- --intent "..." --format md` |
| Direct node (no pnpm) | `node packages/cli/src/usc.js refine --intent "..." --format json` |

### Verification

- `pnpm --silent usc -- refine --intent "..." --domain erp --format json | JSON.parse` → PASS
- `pnpm --silent usc -- refine --intent "..." --domain helpdesk --format json | JSON.parse` → PASS
- `pnpm --silent usc -- refine --intent "..." --domain marketplace --format json | JSON.parse` → PASS
- `pnpm --silent usc:json refine --intent "..." --domain erp --format json | JSON.parse` → PASS
- `pnpm validate` → 35/35 passed
- Working tree clean (only untracked task file from prior task)

### Commit

`8caf0a1` — fix(usc): correct CLI machine-readable output commands

### Residual Work

None.
