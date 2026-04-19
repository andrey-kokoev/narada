# Task 183: Correct Task 182 Stale Cycle README Example

## Context

Task 182 corrected `usc cycle` target resolution so app repos can be operated from either:

- the app repo working directory, where `--target` may default to `cwd`
- the `narada.usc` repo, where `--target <app-repo>` is required

Runtime smoke verification passes for both target-explicit and app-repo-local cycle creation.

One stale README example remains:

```bash
cd ../narada.usc.my-system
pnpm --dir /path/to/narada.usc usc -- cycle --intent "Add support mailbox operation"
```

This command executes from `/path/to/narada.usc`, so `cycle` resolves the current working directory as the target unless `--target` is provided. The example is therefore still misleading.

## Required Change

Update `README.md` so the Cycle section shows one coherent invocation pattern.

Recommended form:

```bash
pnpm --dir /path/to/narada.usc usc -- cycle \
  --target ../narada.usc.my-system \
  --intent "Add support mailbox operation"
```

Alternatively, show app-repo-local execution:

```bash
cd ../narada.usc.my-system
node /path/to/narada.usc/packages/cli/src/usc.js cycle \
  --intent "Add support mailbox operation"
```

Do not keep the existing mixed form where `cd` points at the app repo but `pnpm --dir` changes execution back to the constructor repo without `--target`.

## Verification

Run:

```bash
rg "pnpm --dir .*cycle --intent|usc -- cycle --intent" README.md AGENTS.md docs packages
pnpm validate
```

Expected:

- no stale targetless `pnpm --dir ... cycle` examples remain
- validation passes

## Definition Of Done

- [ ] `README.md` cycle example is mechanically correct.
- [ ] No targetless `pnpm --dir ... cycle` examples remain.
- [ ] `pnpm validate` passes.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

**Date:** 2026-04-13

### Change

Updated README.md Cycle section to replace the misleading mixed form:

```bash
cd ../narada.usc.my-system
pnpm --dir /path/to/narada.usc usc -- cycle --intent "..."
```

With the explicit --target form:

```bash
pnpm --dir /path/to/narada.usc usc -- cycle \
  --target ../narada.usc.my-system \
  --intent "Add support mailbox operation"
```

### Verification

- `rg "pnpm --dir .*cycle --intent|usc -- cycle --intent" README.md AGENTS.md docs packages` → no matches (exit code 1 means no stale examples remain)
- `pnpm validate` → 35/35 passed
- Working tree clean

### Commit

`c305ffc` — docs(usc): fix stale cycle example in README

### Residual Work

None.
