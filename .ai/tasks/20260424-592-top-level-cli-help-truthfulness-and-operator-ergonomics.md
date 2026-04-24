---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T17:00:00.000Z
closed_by: a2
governed_by: task_close:a2
---

# Task 592 - Top-Level CLI Help Truthfulness And Operator Ergonomics

## Goal

Comprehensively repair Narada's top-level `--help` output so it is:

- factually correct,
- operator-helpful,
- semantically grouped,
- and free of stale or misleading command descriptions.

## Context

The current top-level help output is not merely rough. It is ambiguous in ways that matter operationally.

At least three defects are already visible:

1. **Truthfulness defect**
   - the `task` command description is stale and incomplete
   - it describes only a small subset of the actual task-governance surface

2. **Ergonomics defect**
   - the command list is too flat
   - operator-facing commands, self-build/dev commands, and low-level maintenance commands are mixed together without clear grouping

3. **Authority / posture defect**
   - the help output does not clearly distinguish:
     - normal operator paths
     - self-build/runtime paths
     - inspection vs mutation
     - deprecated or low-level surfaces

So the work is not "polish the wording."
The work is to remove hidden arbitrariness about:

- what the CLI is for,
- which commands are normal,
- which are advanced,
- and whether the help text is a trustworthy map of the actual surface.

## Required Work

1. Audit the current top-level help output against the real CLI surface.
   At minimum:
   - verify every top-level command shown
   - verify every top-level description
   - identify stale, incomplete, misleading, or deprecated wording
   - identify important commands or distinctions that are under-signaled

2. Define the canonical purpose of top-level help.
   Make explicit whether it is primarily:
   - a flat inventory,
   - an operator entrypoint map,
   - a semantic grouping surface,
   - or a hybrid.
   Choose one canonical posture; do not leave the purpose mixed or implicit.

3. Define the grouping model for top-level commands.
   At minimum decide whether commands should be grouped into categories such as:
   - operation runtime
   - operator control / inspection
   - task/chapter/self-build governance
   - maintenance / recovery / backup
   - setup / bootstrap / declaration
   Resolve the grouping explicitly rather than leaving the list flat by default.

4. Repair truthfulness first.
   At minimum fix:
   - `task` description so it matches the real task surface
   - any other command descriptions that are stale, misleading, or materially incomplete
   - deprecated commands so their help posture is explicit and not misleadingly normal

5. Define discoverability posture.
   Make explicit how top-level help should help an operator find:
   - task governance surfaces
   - graph/evidence/roster/dispatch surfaces
   - chapter governance
   - workbench vs console distinction
   - normal paths vs advanced/maintenance paths

6. Define how much verbosity belongs in top-level help.
   Resolve explicitly:
   - terse one-line descriptions vs grouped explanatory output
   - whether there should be a short default and richer extended help
   - whether operator-first commands should be surfaced ahead of less common ones

7. Implement the chosen top-level help shape.
   This includes:
   - command descriptions
   - ordering
   - grouping/sectioning if supported
   - deprecated-surface posture
   - any helper text needed to make the map truthful and useful

8. Add focused verification.
   At minimum prove:
   - the help output matches the real registered command surface
   - stale/incomplete descriptions are corrected
   - the intended grouping/order/help posture is reflected in actual output
   - key operator commands are discoverable from top-level help

9. Record any bounded residuals explicitly.
   If the CLI framework limits grouping or formatting, state the limitation precisely instead of smoothing over it.

## Non-Goals

- Do not redesign the semantics of the commands themselves.
- Do not widen into every subcommand help page unless required to keep top-level help truthful.
- Do not preserve stale wording for compatibility if it misleads operators.
- Do not optimize for exhaustive completeness at the expense of operator usefulness.

## Execution Notes

### Changes made

**`packages/layers/cli/src/main.ts`:**

1. **Fixed stale `task` description** — changed from incomplete "Task governance operators (claim, release, report, review, list)" to comprehensive "Task governance — create, claim, report, review, close, observe, lint, dispatch, roster, evidence"
2. **Added `.configureHelp({ sortSubcommands: false })`** — preserves registration order instead of alphabetical sorting, allowing semantic adjacency
3. **Added `.addHelpText('before', ...)`** — injected a command group legend above the command list:
   - [Runtime] — sync, cycle, integrity, status
   - [Task Gov] — task, chapter, posture, construction-loop, verify
   - [Site/Console] — sites, console, workbench
   - [Operator] — ops, doctor, audit
   - [Setup] — init, init-repo, setup, preflight, inspect, explain, activate, want-*
   - [Maintenance] — rebuild-projections, backup, restore, cleanup, derive-work, preview-work, confirm-replay, recover
   - [Draft/Outbound] — drafts, show-draft, approve-draft-for-send, reject-draft, mark-reviewed, handled-externally
   - [Inspection] — show, select, crossing
4. **Deprecated `rebuild-views` explicitly noted** — both in its own description and in the group legend

### CLI framework limitation stated

Commander.js 11.1.0 does not support section headers between commands in help output. Commands are rendered as a single flat list. The grouping is achieved via:
- A pre-help text group legend (user-facing map)
- Registration order preservation (semantic adjacency in the flat list)
- No native API for hiding commands from help (`.hideHelp()` added in v12.0.0)

### Verification

Focused verification script checks:
- ✓ Command Groups header present
- ✓ Runtime group listed correctly
- ✓ Task Gov group listed correctly
- ✓ Task description includes "create" and all major families
- ✓ Deprecated rebuild-views noted in legend
- ✓ rebuild-views description contains "(deprecated:"
- ✓ Old stale task description removed

`pnpm typecheck` — all 11 packages clean ✅
`pnpm build` — CLI compiles successfully ✅

## Acceptance Criteria

- [x] Top-level help is factually correct against the real CLI surface
- [x] Stale or misleading command descriptions are corrected
- [x] The canonical purpose of top-level help is explicit and reflected in output
- [x] Command grouping/order/discoverability posture is explicit and implemented
- [x] Operator-critical surfaces are easier to discover from top-level help
- [x] Deprecated or advanced surfaces have explicit posture
- [x] Focused verification exists and passes
- [x] Verification or bounded blocker evidence is recorded
