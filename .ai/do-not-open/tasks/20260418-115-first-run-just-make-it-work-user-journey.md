# Task 115: First-Run "Just Make It Work" User Journey

## Why

Narada has substantial machinery, but a brand new user should not need to learn the architecture before getting a useful result.

The target experience is:

```text
install Narada
-> init private repo
-> declare mailbox
-> add credentials
-> preflight
-> setup
-> explain
-> activate
-> run
-> refine behavior
```

Today that path is only partially real. Pieces exist, but the overall first-run experience is still too implicit, too legacy-shaped, and too dependent on knowing internal package structure.

## Goal

Implement a coherent first-run user journey so a brand new user can go from zero to a live draft-first mailbox assistant with minimal guesswork.

This task is about the integrated first-run experience, not just isolated commands.

## Primary User Story

A new user should be able to:

1. install Narada
2. create a private ops repo
3. declare a real mailbox
4. provide credentials
5. verify readiness
6. understand what Narada will do
7. activate the mailbox
8. run Narada against it

without needing prior knowledge of Narada internals.

## Gold Path

The intended gold path is:

```bash
pnpm add -g @narada2/narada
narada init-repo ~/src/my-helpdesk
cd ~/src/my-helpdesk
pnpm install
narada want-mailbox help@company.com
narada want-posture help@company.com draft-only
# fill .env
narada preflight help@company.com
narada setup
narada explain help@company.com
narada activate help@company.com
pnpm daemon
```

This task must make that path real, coherent, and documented.

## Scope

This task must cover:

- first-run CLI flow
- repo bootstrap expectations
- mailbox shaping defaults
- preflight UX quality
- explanation UX quality
- activation semantics
- first-run docs / quickstart
- operator clarity about what happens after `daemon` starts

## Non-Goals

- Do not redesign Narada architecture
- Do not add fully autonomous send behavior by default
- Do not add magical secret provisioning
- Do not add background service installation / OS daemonization in v1
- Do not require the user to learn package internals to complete the first run

## Required Outcomes

### 1. One Clear Gold Path

There must be one primary documented path for first-time setup.

Avoid multiple equally-promoted variants.

The user should not have to choose among:

- several different binaries
- legacy command names
- several different repo creation approaches
- several different configuration entrypoints

### 2. Private Ops Repo Bootstrap Feels Native

The initialized repo must feel like a Narada workspace, not a bag of files.

The user should understand immediately:

- where config lives
- where mailbox-owned material lives
- where knowledge/scenarios/notes go
- what commands to run next

### 3. Mailbox Declaration Has Safe Defaults

`narada want-mailbox <mailbox>` should create a useful first scope with sane defaults.

Expected default posture for first run:

- draft-first
- human approval required
- primary charter bound
- secondary charter bound if part of the standard starter profile

The user should not be forced to understand charter matrix design before first value.

### 4. Preflight Must Be Operationally Sharp

`narada preflight <mailbox>` must answer:

- is this runnable right now?
- if not, exactly what is missing?
- what should I do next?

The output should be crisp enough that a new user can unblock themselves without reading source code.

### 5. Explain Must Answer "What Will This Do?"

`narada explain <mailbox>` must state in user language:

- which charters are active
- whether outbound is draft-only or send-capable
- whether approval is required
- whether tools may run
- what the likely operational behavior is
- why Narada is still blocked, if blocked

### 6. Activation Must Be Legible

A new user must understand what `narada activate <mailbox>` means.

Activation should be explained as:

- this target is now marked operational/live
- Narada may now treat it as an active scope
- activation itself does not secretly send mail or start daemons

### 7. Run Phase Must Be Explained Clearly

After `pnpm daemon`, the user should know what to expect:

- Narada syncs mailbox state
- contexts are admitted
- work is opened
- charters evaluate contexts
- durable draft-first outbound proposals may be created
- operator review may still be required

This expectation-setting must be present in docs or onboarding output.

## Deliverables

- first-run quickstart aligned to the gold path
- repo bootstrap and shaping commands aligned to that quickstart
- preflight output improved where needed
- explain output improved where needed
- activation semantics documented clearly
- `narada.sonar` can be described as an instance of this journey

## Definition Of Done

- [ ] a brand new user can follow one documented gold path from install to live mailbox operation
- [ ] the first-run path uses `narada`, not internal or legacy command framing
- [ ] initialized repo structure is understandable without architectural background
- [ ] `preflight` gives actionable next steps
- [ ] `explain` tells the user what Narada will actually do
- [ ] activation semantics are explicit and non-misleading
- [ ] first-run docs no longer depend on historical `exchange-*` framing as the primary explanation

## Notes

This task depends conceptually on Task 114, because the first-run path should be built around the unified `narada` CLI. It also benefits from Task 113, but should remain focused on user experience rather than package-internal migration details.
