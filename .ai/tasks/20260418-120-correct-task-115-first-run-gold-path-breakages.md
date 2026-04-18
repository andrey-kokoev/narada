# Task 120: Correct Task 115 First-Run Gold-Path Breakages

## Why

Task 115 defined the intended first-run "just make it work" journey, but the executed state still has concrete breakages that prevent the gold path from being real for a brand new user.

This corrective task targets those specific failures.

## Findings To Correct

### 1. First-run docs still route users into legacy `exchange-*` surfaces

Current top-level and quickstart docs still instruct users to install legacy packages and run legacy commands such as:

- `@narada2/exchange-fs-sync-cli`
- `@narada2/exchange-fs-sync-daemon`
- `exchange-sync init`
- `exchange-sync sync`

That directly contradicts the intended gold path based on `narada`.

### 2. `init-repo` scaffolds an ops repo that is not runnable for a standalone new user

Current scaffold uses `workspace:*` dependencies for Narada packages.

That only works inside a workspace. A private ops repo created via `narada init-repo ~/src/my-helpdesk` is supposed to be a standalone repo, not a workspace member.

So `pnpm install` in the generated repo is not coherent for a brand new user.

### 3. The first-run command surface is still split across competing CLIs

The intended gold path uses `narada`, but the canonical CLI package still presents itself as `exchange-sync` while `init-repo` and shaping commands live elsewhere.

That means the user-discoverable first-run path is still not one coherent CLI surface.

## Goal

Repair the first-run journey so the documented gold path is:

- actually documented in the primary docs
- actually runnable for a standalone new user
- actually exposed through one coherent user-facing CLI

## Scope

This task must cover:

- first-run docs and quickstart correction
- `init-repo` scaffold dependency correction
- alignment with the canonical CLI surface
- verification of the end-to-end gold path

## Non-Goals

- Do not reopen broader taxonomy work
- Do not redesign Narada architecture
- Do not add compatibility shims for legacy docs instead of fixing them

## Required Corrections

### 1. Replace Legacy First-Run Docs With The Real Gold Path

Update the primary user-entry docs so a new user is guided through the actual intended path.

At minimum, fix:

- root `README.md`
- quickstart docs
- any first-run README surfaces that still present `exchange-*` as the main setup route

The documented first-run path must use:

```bash
narada init-repo ...
narada want-mailbox ...
narada preflight ...
narada activate ...
pnpm daemon
```

### 2. Make `init-repo` Produce A Standalone Runnable Ops Repo

The generated repo must not depend on `workspace:*` if it is meant for a brand new standalone user.

Choose one coherent solution and implement it, for example:

- published semver package dependencies, or
- explicit file/path wiring intended only for local-source mode with that mode clearly named, or
- two explicit initialization modes if truly necessary

Disallowed outcome:

- default first-run scaffold that only works if the user already understands workspace internals

### 3. Align The Gold Path With The Canonical CLI

The first-run docs must point to the actual canonical CLI surface, not a parallel or hidden one.

This task depends on the resolution from Task 118:

- one canonical `narada` CLI
- no competing first-run binary identity

### 4. Verify The Gold Path End To End

The task is not complete until the documented gold path is exercised as a real path.

That means verifying a fresh initialized repo can:

- install dependencies
- accept `want-mailbox`
- run `setup`
- run `preflight`
- run `explain`
- run `activate`

without hidden manual repair steps.

## Deliverables

- corrected first-run docs
- standalone-coherent `init-repo` scaffold
- first-run flow aligned to the canonical CLI
- verification evidence for the end-to-end gold path

## Definition Of Done

- [ ] primary docs no longer send first-time users through legacy `exchange-*` setup
- [ ] `init-repo` generates a repo that a standalone new user can actually install and use
- [ ] first-run instructions point to the canonical `narada` CLI only
- [ ] the documented gold path has been exercised end to end without hidden fixes
- [ ] a brand new user no longer needs workspace knowledge to get first value

## Notes

This is a corrective task for the concrete defects discovered during review of Task 115 execution. It should be completed after or alongside Task 118, because the first-run journey must sit on the real canonical CLI surface.
