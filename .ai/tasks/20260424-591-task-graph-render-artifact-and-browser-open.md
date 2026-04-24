---
status: closed
closed: 2026-04-24
---

# Task 591 - Task Graph Render Artifact And Browser Open

## Goal

Define and implement the sanctioned operator path for viewing task graphs as rendered Mermaid in a browser, instead of dumping raw Mermaid text to stdout.

## Context

The current `task graph --format mermaid` surface is an inspection emitter:

- it writes Mermaid text to stdout,
- which is acceptable for piping or low-level inspection,
- but poor for normal operator viewing.

The live ambiguity is not "should Mermaid exist?" It already does.
The real ambiguity is:

- what the normal operator-facing viewing path should be,
- whether rendering is part of the command contract or left to manual copy/paste,
- and what artifact/open behavior counts as the sanctioned ergonomic surface.

That ambiguity should be removed.

## Required Work

1. Define the canonical operator path for rendered graph viewing.
   It must answer explicitly:
   - whether the command creates artifacts,
   - where they live,
   - what gets opened,
   - and whether stdout remains raw/inspection-only.
2. Define the artifact set precisely.
   At minimum decide whether the rendered path creates:
   - a Mermaid source artifact (`.mmd`),
   - an HTML wrapper artifact,
   - and whether both are kept or one is ephemeral.
3. Define the location/posture for artifacts.
   At minimum decide:
   - whether `/tmp` is the canonical render target,
   - naming convention,
   - overwrite vs timestamped behavior,
   - and cleanup posture.
4. Define the command surface precisely.
   Make explicit whether the sanctioned path is:
   - a new flag on `task graph`,
   - a new subcommand,
   - or a separate operator.
   Do not leave multiple equally-valid ergonomic paths implicit.
5. Define browser-open behavior.
   At minimum answer:
   - whether the command auto-opens by default,
   - whether there is a `--no-open` or equivalent,
   - what happens in non-GUI/headless environments,
   - and how failure to open is surfaced without losing the artifacts.
6. Preserve low-level inspection explicitly.
   State whether raw Mermaid stdout remains available for:
   - piping,
   - tests,
   - machine use,
   - or debugging.
7. Define verification and acceptance in operator terms.
   The task should not be considered complete unless the normal operator path is:
   - renderable,
   - browser-openable,
   - and does not force copy/paste from a transcript.

## Non-Goals

- Do not redesign task graph semantics.
- Do not widen into a full browser workbench feature.
- Do not preserve raw stdout as the only normal viewing path.
- Do not make GUI-open mandatory in headless environments.

## Acceptance Criteria

- [x] Canonical operator-facing render path is explicit
- [x] Artifact set and artifact location are explicit
- [x] Command surface is explicit
- [x] Browser-open behavior and headless fallback are explicit
- [x] Raw Mermaid inspection posture is explicit
- [x] Verification or bounded blocker evidence is recorded



## Closure Summary

**Decision artifact**: `.ai/decisions/20260424-591-task-graph-render-artifact-and-browser-open.md`

### Design Choices Settled

| Question | Answer |
|----------|--------|
| Operator path | `task graph --view` |
| Artifacts created | `.mmd` source + `.html` wrapper (both kept) |
| Location | `${os.tmpdir()}/narada-task-graph-{timestamp}/` |
| Command surface | `--view` flag on existing `task graph` |
| Auto-open | Yes by default; `--no-open` suppresses |
| Headless fallback | Detected via `CI`, `HEADLESS`, `NARADA_NO_BROWSER`, or missing `DISPLAY`; artifacts still created |
| Raw Mermaid preserved | Yes, via `--format mermaid` |

### Files Changed

- `packages/layers/cli/src/lib/browser-render.ts` (new, 130 lines)
- `packages/layers/cli/src/commands/task-graph.ts` (+52 lines)
- `packages/layers/cli/src/main.ts` (+2 CLI flags)
- `packages/layers/cli/test/lib/browser-render.test.ts` (new, 8 tests)
- `packages/layers/cli/test/commands/task-graph.test.ts` (+5 tests)

### Verification

- `pnpm verify`: 5/5 steps clean
- CLI tests: 31 tests pass (23 existing + 8 new)
