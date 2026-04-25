---
status: closed
closed: 2026-04-22
depends_on: [371, 377, 424]
---

# Task 429 — Linux Site Materialization Chapter

## Assignment

Create a self-standing chapter for Linux-backed Narada Site materializations as a sibling of Windows, macOS, and Cloudflare Sites.

## Context

Linux must not be treated as "WSL without Windows" or as a generic local runtime. It has its own unattended-operation primitives:

- `systemd` user and system units;
- timers;
- journald logging;
- filesystem conventions under `/var/lib`, `/etc`, `/run`, and XDG user directories;
- service hardening options;
- Linux Secret Service/libsecret, `pass`, systemd credentials, env files;
- headless server operation;
- boot/network ordering;
- package/service installation expectations.

Windows WSL is a Windows-hosted Linux userspace. A Linux Site is a native Linux substrate.

This task creates the Linux Site chapter. It is a Site-substrate sibling, not a generic Site abstraction.

## Goal

Produce a disciplined task chapter for Linux Site materialization that defines the target shape, task DAG, and first implementation/review tasks.

The chapter should make Linux a first-class Site substrate while preserving Narada's canonical vocabulary and authority boundaries.

## Required Work

### 1. Review existing Site materialization work

Read:

- `SEMANTICS.md` semantic crystallization section;
- `docs/deployment/cloudflare-site-materialization.md`;
- `docs/deployment/windows-site-materialization.md`;
- `docs/deployment/windows-site-boundary-contract.md`;
- `docs/product/unattended-operation-layer.md`;
- `.ai/do-not-open/tasks/20260421-371-windows-site-materialization-chapter.md`;
- `.ai/do-not-open/tasks/20260421-372-windows-site-boundary-design-contract.md`;
- `.ai/do-not-open/tasks/20260421-377-windows-site-materialization-closure.md`;
- `.ai/do-not-open/tasks/20260422-428-macos-site-materialization-chapter.md`.

If Task 424 changes the canonical vocabulary, use Task 424's selected vocabulary. Do not preserve stale vocabulary if superseded.

### 2. Create Linux Site materialization design doc

Create:

`docs/deployment/linux-site-materialization.md`

It must define:

- Linux Site identity;
- default Site root conventions;
- coordinator/storage location;
- lock and stuck-cycle recovery model;
- health and trace storage;
- credential resolution;
- Cycle scheduling and triggering;
- operator inspection/control surface;
- service hardening posture;
- boot/network ordering behavior;
- what must not be claimed.

Candidate defaults to evaluate:

| Concern | Candidate |
|---------|-----------|
| System Site root | `/var/lib/narada/{site_id}` |
| System config | `/etc/narada/{site_id}/config.json` |
| Runtime state | `/run/narada/{site_id}` |
| User Site root | `${XDG_DATA_HOME:-~/.local/share}/narada/{site_id}` |
| Logs | journald first, optional Site-local `logs/` |
| Timer | `systemd` timer |
| Secrets | systemd credentials / env file / Secret Service / `pass` depending on mode |
| Lock | existing `FileLock` if compatible |
| Health | reuse `computeHealthTransition()` |

Do not assume these defaults are correct. Evaluate and decide.

### 3. Distinguish Linux deployment modes

The design must explicitly separate:

- **user-mode Linux Site**: runs under a user account, user-level systemd timers, XDG paths;
- **system-mode Linux Site**: dedicated service user, `/etc` + `/var/lib`, systemd unit/timer, journald;
- **container-hosted Linux Site**: explicitly deferred unless needed; do not smear with Docker/Kubernetes.

For each mode, state what is in scope for v0 and what is deferred.

### 4. Cover Linux-specific concerns

The design must explicitly address:

- `systemd --user` vs system service boundaries;
- headless server operation;
- boot ordering and network availability;
- journald vs file logs;
- secret injection and file permissions;
- service hardening options (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`, etc.) as recommendations, not required proof unless implemented;
- package manager differences (`deb`, `rpm`, tarball) as deferred unless scoped;
- cron fallback if systemd is unavailable.

### 5. Define sibling relationship to Cloudflare, Windows, and macOS

Create a comparison table:

| Mechanism | Cloudflare | Windows Native | Windows WSL | macOS | Linux |
|-----------|------------|----------------|-------------|-------|-------|

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

### 6. Create Linux chapter DAG and task files

Create a chapter DAG file with monotonic task numbers after this task.

At minimum include tasks for:

1. Linux Site boundary/design contract;
2. systemd runner/supervision spike;
3. Linux credential and path binding contract;
4. health/trace/operator-loop integration;
5. service hardening and recovery fixture;
6. closure review.

Each task must be self-standing. An agent must be able to execute the task from the task file alone.

### 7. Preserve boundaries

The chapter must state:

- Linux is a Site substrate, not an operation;
- Linux is not a vertical;
- systemd timer/service is Cycle machinery, not Narada itself;
- journald/log files are Trace surfaces, not authority;
- credential stores are secret sources, not authority;
- local scripts/tools are effect executors only when routed through governed intents;
- no generic Site abstraction is introduced unless explicitly justified by cross-substrate evidence in a later task.

### 8. Do not implement runtime code in this task

This task is chapter shaping and design only.

Implementation belongs in the task files it creates.

## Non-Goals

- Do not implement `packages/sites/linux/` in this task.
- Do not create a generic Site abstraction.
- Do not rename existing Windows, macOS, or Cloudflare packages.
- Do not implement Docker/Kubernetes support.
- Do not require live Linux root/systemd access in tests.
- Do not use private machine paths or secrets.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `docs/deployment/linux-site-materialization.md` exists and is self-standing.
- [x] Linux Site identity, root paths, scheduler, credentials, lock, health, trace, and operator surface are specified.
- [x] User-mode, system-mode, and container-hosted Linux Site distinctions are explicit.
- [x] Linux-specific concerns are covered: systemd user/system, headless operation, boot/network ordering, journald, secret permissions, service hardening, cron fallback.
- [x] Sibling comparison table includes Cloudflare, Windows native, Windows WSL, macOS, and Linux.
- [x] Numbered Linux chapter DAG file exists with monotonic task numbers after 429.
- [x] First implementation/review task files exist and are self-standing.
- [x] The chapter explicitly preserves Site/operation/vertical boundaries.
- [x] No runtime implementation code is added.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
test -f docs/deployment/linux-site-materialization.md
rg -n "Linux|systemd|journald|/var/lib/narada|/etc/narada|XDG|Secret Service|NoNewPrivileges|cron" docs/deployment/linux-site-materialization.md .ai/do-not-open/tasks/20260422-*.md
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

If only Markdown files are changed, do not run broad test suites.

## Execution Notes

### Review findings

All deliverables were present and complete:

1. **Design doc** — `docs/deployment/linux-site-materialization.md` (651 lines, self-standing)
   - §1–2: Linux Site identity, system-mode vs user-mode substrate classes, definitions
   - §3–5: Resource mapping, bounded Cycle steps, local assumptions that break on Linux
   - §6: v0 prototype boundary with explicit in-scope/deferred lists
   - §7: Secret binding (systemd credentials → env → `.env`) and rotation
   - §8: Filesystem layout for system-mode and user-mode
   - §9: Cycle runner architecture and supervision
   - §10: Sibling comparison table (Cloudflare / Windows Native / Windows WSL / macOS / Linux)
   - §11: "What Must Not Be Claimed" boundary table

2. **macOS-specific concerns covered** — `systemd --user` vs system service, headless server, boot/network ordering (`After=network.target`), journald vs file logs, secret permissions (0600), service hardening (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`), cron fallback, path conventions.

3. **Deployment modes** — System-mode, user-mode, and container-hosted explicitly distinguished with in-scope/deferred lists per mode.

4. **Chapter DAG** — `.ai/do-not-open/tasks/20260422-437-442-linux-site-materialization.md` with tasks 437–442.

5. **Task files** — All 6 self-standing task files exist:
   - 437: Linux Site Boundary / Design Contract
   - 438: systemd Runner / Supervision Spike
   - 439: Linux Credential and Path Binding Contract
   - 440: Health / Trace / Operator-Loop Integration
   - 441: Service Hardening and Recovery Fixture
   - 442: Linux Site Materialization Closure

### Verification results

```bash
test -f docs/deployment/linux-site-materialization.md              # ✅
rg -n "Linux|systemd|journald|/var/lib/narada|/etc/narada|XDG|Secret Service|NoNewPrivileges|cron" docs/deployment/linux-site-materialization.md | wc -l  # 200+ matches
find .ai/do-not-open -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print  # 0 results
```

### Action taken

- Task status: `opened` → `closed`
- Checked all acceptance criteria
- No code changes required (design-only task)
- No derivative files found

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
