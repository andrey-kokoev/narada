---
status: closed
depends_on: [476]
closed: 2026-04-22
---

# Task 477 — Correct Tool Locality Path to `.narada`

## Context

Task 476 documented the Tool Locality Doctrine and initially created / referenced:

```text
~/src/sonar.cloud/tools/narada/
```

That path is semantically weaker than the doctrine. These tools are not ordinary Sonar developer tools. They are the Narada-facing interface exposed by the Sonar repo.

The better shape is:

```text
~/src/sonar.cloud/.narada/
  README.md
  tool-catalog.json
  tools/
    git-read.sh
    psql-readonly.sh
    sentry-search.sh
```

`.narada/` makes the boundary explicit:

```text
This is the Narada interface exposed by this repo.
```

## Goal

Update the Tool Locality Doctrine docs and repo-local scaffolding to use `.narada/` as the canonical system-repo Narada interface path.

## Required Work

### 1. Update canonical docs

Update all Narada docs that mention `tools/narada/` or `tools/narada/catalog.json`:

- `SEMANTICS.md`
- `docs/concepts/runtime-usc-boundary.md`
- `docs/product/tool-catalog-binding.md`
- `docs/product/bootstrap-contract.md`
- `AGENTS.md`

Canonical replacement:

```text
system-repo/.narada/tool-catalog.json
system-repo/.narada/tools/
```

### 2. Update `narada.sonar` docs

Update `/home/andrey/src/narada.sonar/README.md` to point to:

```text
~/src/sonar.cloud/.narada/tool-catalog.json
```

and explain that `.narada/` is Sonar's Narada-facing interface.

### 3. Move Sonar placeholder docs

Move:

```text
/home/andrey/src/sonar.cloud/tools/narada/README.md
```

to:

```text
/home/andrey/src/sonar.cloud/.narada/README.md
```

Remove the now-empty `tools/narada` directory if safe.

Do not create actual git/psql/Sentry tools in this task.

### 4. Add or update examples

Where examples show catalog paths, use:

```json
{
  "type": "local_path",
  "path": "/home/andrey/src/sonar.cloud/.narada/tool-catalog.json"
}
```

### 5. Verify no stale path remains

Run:

```bash
rg -n "tools/narada|tools/narada/catalog|/tools/narada" SEMANTICS.md docs AGENTS.md /home/andrey/src/narada.sonar /home/andrey/src/sonar.cloud/.narada
```

The only remaining uses, if any, must be historical notes that explicitly say the old path was replaced.

## Non-Goals

- Do not implement the Sonar tool catalog.
- Do not add DB/Sentry/Git wrappers.
- Do not change Narada runtime tool execution code.
- Do not edit unrelated task files.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] Canonical docs use `.narada/tool-catalog.json` and `.narada/tools/`.
- [x] `narada.sonar` README uses `.narada/` path.
- [x] Sonar placeholder README lives at `/home/andrey/src/sonar.cloud/.narada/README.md`.
- [x] Old `/home/andrey/src/sonar.cloud/tools/narada/README.md` is removed.
- [x] No stale `tools/narada` path remains outside explicit historical notes.
- [x] No actual diagnostic tools are implemented in this task.

## Execution Notes

Updated all references from `tools/narada/` to `.narada/` across canonical docs, `narada.sonar` README, and the Sonar repo itself.

### Files changed in `~/src/narada`

- `SEMANTICS.md` — Example path updated to `~/src/sonar.cloud/.narada/tool-catalog.json`
- `AGENTS.md` — Tool locality invariant updated to `.narada/tool-catalog.json`
- `docs/product/tool-catalog-binding.md` — Example catalog path and Sonar example text updated
- `docs/product/bootstrap-contract.md` — Example path updated
- `docs/concepts/runtime-usc-boundary.md` — Example path updated

### Files changed in `~/src/narada.sonar`

- `README.md` — Tool Binding section updated to `~/src/sonar.cloud/.narada/tool-catalog.json` with explicit explanation of `.narada/` as the canonical system-repo Narada interface path

### Files changed in `~/src/sonar.cloud`

- `tools/narada/README.md` → `.narada/README.md` (moved and updated)
- `.narada/README.md` — Updated header, intro, and planned catalog shape to use `.narada/` naming
- Old `tools/narada/` directory removed (was empty after move)

### Not changed

- No actual diagnostic tools (git-read.sh, psql-readonly.sh, sentry-search.sh) were implemented.
- No Narada runtime tool execution code was modified.

## Verification

```bash
# No stale paths remain in Narada repo
cd /home/andrey/src/narada && rg -n "tools/narada" --type md .
# → No matches

# No stale paths remain in sonar.cloud or narada.sonar
rg -n "tools/narada" /home/andrey/src/sonar.cloud /home/andrey/src/narada.sonar
# → No matches

# New path exists
ls -la /home/andrey/src/sonar.cloud/.narada/README.md
# → exists
```

No derivative task-status files created.

## Suggested Verification

```bash
rg -n "tools/narada|tools/narada/catalog|/tools/narada" SEMANTICS.md docs AGENTS.md /home/andrey/src/narada.sonar /home/andrey/src/sonar.cloud/.narada
git -C /home/andrey/src/sonar.cloud status --short
git -C /home/andrey/src/narada.sonar status --short
```
