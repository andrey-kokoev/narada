# Decision 591 — Task Graph Render Artifact and Browser Open

## Status
**Accepted** — implemented and verified.

## Context
The `task graph --format mermaid` surface was an inspection emitter: it dumped raw Mermaid text to stdout, which is acceptable for piping or low-level inspection but poor for normal operator viewing. The ambiguity was: what is the sanctioned ergonomic viewing path?

## Decision

### 1. Canonical Operator Path
The operator-facing viewing path is **`task graph --view`**.

- It creates render artifacts and attempts to open a browser.
- Stdout remains for raw inspection only when `--view` is not used.
- No new subcommand or separate operator is introduced.

### 2. Artifact Set
The `--view` path creates **two artifacts**, both kept:

| Artifact | File | Purpose |
|----------|------|---------|
| Mermaid source | `graph.mmd` | Source-of-truth diagram text; editable, diffable, pipeable |
| HTML wrapper | `index.html` | Self-contained renderable page using Mermaid.js CDN |

Both are written to the same directory. Neither is ephemeral.

### 3. Artifact Location
Artifacts live in a **timestamped subdirectory** of the OS temp directory:

```
${os.tmpdir()}/narada-task-graph-2026-04-24T19-04-18/
  graph.mmd
  index.html
```

- **Canonical target**: `os.tmpdir()` (typically `/tmp` on Linux)
- **Naming**: `narada-task-graph-{ISO-timestamp}`
- **Overwrite**: timestamped directories guarantee uniqueness; no clobbering
- **Cleanup**: none — left to OS temp cleanup policy

### 4. Command Surface
The sanctioned path is a **new flag on the existing `task graph` command**:

```bash
narada task graph --view                # create artifacts + open browser
narada task graph --view --no-open      # create artifacts only
narada task graph --format mermaid      # raw Mermaid to stdout (inspection)
narada task graph --format json         # raw JSON to stdout (inspection)
```

`--view` is orthogonal to `--format`. When `--view` is active, the command produces artifacts and reports paths; when absent, the existing stdout behavior is preserved.

### 5. Browser-Open Behavior

| Scenario | Behavior |
|----------|----------|
| `--view` without `--no-open` | Auto-opens browser by default |
| `--view --no-open` | Creates artifacts, skips browser open |
| Headless / CI / `NARADA_NO_BROWSER=1` | Detected automatically; artifacts created, browser skipped, paths reported |
| Browser open fails | Warns gracefully; artifacts remain accessible |

**Headless detection** uses:
- `CI` environment variable
- `HEADLESS` environment variable
- `NARADA_NO_BROWSER` explicit opt-out
- Linux without `DISPLAY`

### 6. Raw Mermaid Inspection Posture
Raw Mermaid stdout is **explicitly preserved** and remains the canonical inspection path for:

- Piping to other tools
- Test assertions
- Machine consumption
- Debugging and diffing

`--format mermaid` continues to work identically to before.

### 7. Verification
- 31 tests pass (23 existing + 8 new)
- New tests cover: artifact creation, `--no-open`, headless fallback, raw Mermaid preservation, empty graph handling
- `pnpm verify` clean (5/5 steps)

## Implementation

| File | Change |
|------|--------|
| `packages/layers/cli/src/lib/browser-render.ts` | New module: HTML wrapper generation, artifact writing, browser opening, headless detection |
| `packages/layers/cli/src/commands/task-graph.ts` | Added `view` and `open` options; `--view` branches to artifact creation |
| `packages/layers/cli/src/main.ts` | Registered `--view` and `--open` CLI flags |
| `packages/layers/cli/test/lib/browser-render.test.ts` | New tests for helper module (8 tests) |
| `packages/layers/cli/test/commands/task-graph.test.ts` | Added `--view` command tests (5 tests) |

## Consequences

- **Positive**: Normal operator path no longer requires copy/paste from terminal transcripts.
- **Positive**: Raw inspection path is preserved and orthogonal.
- **Positive**: Headless/CI environments degrade gracefully.
- **Trade-off**: Artifact directories accumulate in `/tmp` until OS cleanup; operator can manually delete.
