---
status: closed
closed: 2026-04-21
---

# Task 371 — Windows Site Materialization Chapter

## Assignment

Create the next self-standing chapter for Windows-backed Narada Site materializations.

## Context

Cloudflare is currently the only explicit `packages/sites/*` materialization. In practice, Narada is also being run from a developer machine using WSL/local processes, but that substrate is implicit and operationally under-specified.

We need to make the local Windows family explicit without smearing verticals, operations, or deployment targets:

- Windows 11 native Site: PowerShell, Task Scheduler, Windows filesystem, Windows Credential Manager or environment bindings, Windows service/log/event surfaces where appropriate.
- Windows 11 WSL Site: Linux userspace under Windows, systemd/cron or shell supervisor, WSL filesystem boundary, Windows-host interop only when explicitly declared.

Both are **Sites** / **runtime loci**, not mailbox verticals and not Narada operations.

## Goal

Produce a disciplined task chapter for Windows Site materialization that defines the target shape, task DAG, and first implementation tasks. The chapter should make Windows a sibling of Cloudflare in the Site ontology, while keeping native Windows and WSL as distinct substrate variants.

## Required Work

1. Review the existing Site vocabulary:
   - `SEMANTICS.md §2.14`
   - `docs/deployment/cloudflare-site-materialization.md`
   - `docs/product/unattended-operation-layer.md`
   - current `packages/sites/cloudflare/` package shape
2. Create a Windows Site design document under `docs/deployment/`.
3. The design document must distinguish:
   - **Windows native Site**: PowerShell + Task Scheduler + native filesystem/SQLite + native credential/logging surfaces.
   - **Windows WSL Site**: Linux process model hosted by Windows + WSL filesystem/process boundaries.
4. Define what is common across both Windows variants:
   - Site identity
   - Cycle trigger
   - coordinator/storage location
   - lock/recovery model
   - health/trace location
   - secret binding
   - operator inspection/control surface
5. Define what must not be claimed:
   - no generic Site abstraction unless this chapter proves enough commonality;
   - no Windows service production claim unless implemented;
   - no conflation of Windows Site with mailbox vertical;
   - no hidden dependence on the developer's current machine layout.
6. Create a chapter DAG task file after this task with monotonically increasing task numbers.
7. Create first implementation/review tasks. At minimum, include tasks for:
   - Windows Site boundary/design contract;
   - native Windows runner/supervision spike;
   - WSL Site runner/supervision spike;
   - credential and path binding contract;
   - health/trace/operator-loop integration;
   - closure review.
8. Ensure every task is self-standing: an agent must be able to execute `Task NNN` without needing pasted side instructions from chat.
9. Do not implement Windows runtime code in this task unless narrowly necessary to validate task scope.
10. Do not create derivative task-status files.

## Acceptance Criteria

- [x] A Windows Site materialization design doc exists under `docs/deployment/`.
- [x] Native Windows and WSL Site variants are explicitly separated.
- [x] A numbered chapter DAG file exists with monotonic task numbers after 371.
- [x] The chapter includes self-standing implementation/review tasks.
- [x] The docs preserve Aim / Site / Cycle / Act / Trace terminology.
- [x] The task explicitly records whether generic Site abstraction remains deferred or becomes justified.
- [x] No derivative task-status files are created.

## Execution Notes

- Design document created: [`docs/deployment/windows-site-materialization.md`](../../docs/deployment/windows-site-materialization.md)
  - 368 lines; distinguishes native Windows and WSL variants
  - Defines Site substrate classes: `windows-11-native-powershell-sqlite` and `wsl-2-linux-systemd-sqlite`
  - Resource mapping tables for both variants
  - Filesystem layout sections for `%LOCALAPPDATA%\Narada\{site_id}` and `/var/lib/narada/{site_id}`
  - "What Must Not Be Claimed" table with explicit deferrals
  - Generic Site abstraction explicitly **deferred** pending evidence from Tasks 372–377
- Chapter DAG file created: [`.ai/tasks/20260421-371-377-windows-site-materialization.md`](20260421-371-377-windows-site-materialization.md)
- Self-standing task files created:
  - `20260421-372-windows-site-boundary-design-contract.md`
  - `20260421-373-native-windows-runner-supervision-spike.md`
  - `20260421-374-wsl-site-runner-supervision-spike.md`
  - `20260421-375-credential-and-path-binding-contract.md`
  - `20260421-376-health-trace-operator-loop-integration.md`
  - `20260421-377-windows-site-materialization-closure.md`
- No Windows runtime code implemented.
- No derivative task-status files created.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
