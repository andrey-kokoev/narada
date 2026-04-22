---
status: closed
closed: 2026-04-22
depends_on: [371, 377, 424]
---

# Task 428 — macOS Site Materialization Chapter

## Assignment

Create a self-standing chapter for macOS-backed Narada Site materializations as a sibling of the Windows Site materialization chapter.

## Context

Narada now has explicit Site materializations for:

- Cloudflare-backed Sites;
- Windows 11 native Sites;
- Windows 11 WSL Sites.

macOS is a distinct local-user substrate and should not be treated as "basically Linux" or as a generic local runtime. It has its own operational primitives:

- `launchd` / LaunchAgent scheduling;
- Keychain credential storage;
- APFS filesystem conventions;
- local user login/session boundaries;
- app sandbox and TCC permission surfaces;
- unified logging;
- zsh shell environment quirks;
- developer-machine sleep/wake behavior.

This task creates the macOS Site chapter. It is a sibling of the Windows Site chapter, not a generic Site abstraction.

## Goal

Produce a disciplined task chapter for macOS Site materialization that defines the target shape, task DAG, and first implementation/review tasks.

The chapter should make macOS a first-class Site substrate while preserving Narada's canonical vocabulary and authority boundaries.

## Required Work

### 1. Review existing Site materialization work

Read:

- `SEMANTICS.md` semantic crystallization section;
- `docs/deployment/cloudflare-site-materialization.md`;
- `docs/deployment/windows-site-materialization.md`;
- `docs/deployment/windows-site-boundary-contract.md`;
- `docs/product/unattended-operation-layer.md`;
- `.ai/tasks/20260421-371-windows-site-materialization-chapter.md`;
- `.ai/tasks/20260421-372-windows-site-boundary-design-contract.md`;
- `.ai/tasks/20260421-377-windows-site-materialization-closure.md`;

If Task 424 changes the canonical vocabulary, use Task 424's selected vocabulary. Do not preserve stale `Aim / Site / Cycle / Act / Trace` wording if it has been superseded.

### 2. Create macOS Site materialization design doc

Create:

`docs/deployment/macos-site-materialization.md`

It must define:

- macOS Site identity;
- default Site root conventions;
- coordinator/storage location;
- lock and stuck-cycle recovery model;
- health and trace storage;
- credential resolution;
- Cycle scheduling and triggering;
- operator inspection/control surface;
- local permission model and TCC caveats;
- sleep/wake behavior;
- what must not be claimed.

Candidate defaults to evaluate:

| Concern | Candidate |
|---------|-----------|
| Site root | `~/Library/Application Support/Narada/{site_id}` |
| Logs | `~/Library/Logs/Narada/{site_id}` or Site-local `logs/` |
| LaunchAgent | `~/Library/LaunchAgents/dev.narada.site.{site_id}.plist` |
| Secrets | macOS Keychain first, env/config fallback |
| Lock | existing `FileLock` if compatible |
| Health | reuse `computeHealthTransition()` |

Do not assume the exact defaults above are correct. Evaluate and decide.

### 3. Distinguish macOS-specific concerns

The design must explicitly address:

- LaunchAgent vs interactive shell environment mismatch;
- machine sleep/wake and missed Cycle triggers;
- Keychain access from background agents;
- TCC prompts or permission denial for filesystem/network/tool access;
- path names with spaces in `Application Support`;
- local development vs unattended launchd execution;
- whether a visible menu bar app or GUI helper is out of scope.

### 4. Define sibling relationship to Windows and Cloudflare

Create a comparison table:

| Mechanism | Cloudflare | Windows Native | Windows WSL | macOS |
|-----------|------------|----------------|-------------|-------|

Include at minimum:

- scheduler;
- Site root;
- credential store;
- lock;
- health;
- trace;
- operator surface;
- process execution;
- secret injection;
- install/uninstall mechanism.

### 5. Create macOS chapter DAG and task files

Create a chapter DAG file with monotonic task numbers after this task.

At minimum include tasks for:

1. macOS Site boundary/design contract;
2. launchd runner/supervision spike;
3. macOS credential and path binding contract;
4. health/trace/operator-loop integration;
5. sleep/wake and missed-cycle recovery fixture;
6. closure review.

Each task must be self-standing. An agent must be able to execute the task from the task file alone.

### 6. Preserve boundaries

The chapter must state:

- macOS is a Site substrate, not an operation;
- macOS is not a vertical;
- LaunchAgent is Cycle machinery, not Narada itself;
- Keychain is secret storage, not authority;
- local scripts/tools are effect executors only when routed through governed intents;
- no generic Site abstraction is introduced unless explicitly justified by cross-substrate evidence in a later task.

### 7. Do not implement runtime code in this task

This task is chapter shaping and design only.

Implementation belongs in the task files it creates.

## Non-Goals

- Do not implement `packages/sites/macos/` in this task.
- Do not create a generic Site abstraction.
- Do not rename existing Windows or Cloudflare packages.
- Do not add a GUI/menu bar app.
- Do not require live macOS access in tests.
- Do not use private machine paths or secrets.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `docs/deployment/macos-site-materialization.md` exists and is self-standing.
- [x] macOS Site identity, root paths, scheduler, credentials, lock, health, trace, and operator surface are specified.
- [x] macOS-specific concerns are explicitly covered: LaunchAgent environment, Keychain background access, TCC, sleep/wake, and path spaces.
- [x] Sibling comparison table includes Cloudflare, Windows native, Windows WSL, and macOS.
- [x] Numbered macOS chapter DAG file exists with monotonic task numbers after 428.
- [x] First implementation/review task files exist and are self-standing.
- [x] The chapter explicitly preserves Site/operation/vertical boundaries.
- [x] No runtime implementation code is added.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
test -f docs/deployment/macos-site-materialization.md
rg -n "macOS|launchd|LaunchAgent|Keychain|TCC|sleep|wake|Application Support" docs/deployment/macos-site-materialization.md .ai/tasks/20260422-*.md
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
