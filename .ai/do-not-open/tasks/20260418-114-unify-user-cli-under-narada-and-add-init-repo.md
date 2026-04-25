# Task 114: Unify User CLI Under `narada` And Add `init-repo`

## Why

Narada currently has an operator-facing package `ops-kit` with user commands exposed under the binary name `narada-ops`.

That naming leaks an internal distinction into the public UX.

From the user's point of view, there is no reason to think in terms of:

- Narada core
- Narada ops
- some separate operational tool

The user is just using Narada.

So the coherent top-level user-facing CLI should be `narada`, with subcommands such as:

- `narada init-repo`
- `narada want-mailbox`
- `narada want-workflow`
- `narada want-posture`
- `narada setup`
- `narada preflight`
- `narada inspect`
- `narada explain`
- `narada activate`

## Goal

Make `narada` the primary user-facing CLI surface and add a first-class `init-repo` command that bootstraps a private Narada operational repository.

## Scope

This task must cover:

- user-facing binary naming
- command surface unification
- repo bootstrap command
- docs updates
- hard removal of `narada-ops`
- migration notes for `narada.sonar`

## Non-Goals

- Do not redesign `ops-kit` internals unnecessarily
- Do not block on package taxonomy migration from Task 113
- Do not turn `init-repo` into a generic project scaffolder
- Do not add daemon auto-start or secret provisioning automation in v1

## Required Outcome

### 1. Primary User CLI Is `narada`

The main operator-facing binary must be `narada`, not `narada-ops`.

This means:

- package/bin wiring must expose `narada`
- docs and examples must use `narada ...`
- `narada-ops` must be removed, not retained as an alias

### 2. Add `narada init-repo`

A new command must bootstrap a private Narada ops repo from scratch.

Expected behavior:

- create repo-local `package.json`
- create `.gitignore`
- create `.env.example`
- create `config/config.json`
- create `config/config.example.json`
- create `mailboxes/`
- create `workflows/`
- create `logs/`
- optionally create a starter `README.md`
- wire dependencies on the appropriate Narada packages
- emit clear next steps

The command should be able to create the equivalent of `narada.sonar` without manual skeleton work.

### 3. Reuse Existing Shaping Surface

After `init-repo`, the existing command family should operate naturally inside that repo:

- `narada want-mailbox ...`
- `narada want-workflow ...`
- `narada want-posture ...`
- `narada setup`
- `narada preflight`
- `narada explain`
- `narada activate`

`init-repo` is the missing outer bootstrap layer; it should compose with the existing shaping commands rather than replace them.

### 4. Hard Cutover

There is no transitional deprecated surface.

Required behavior:

- remove `narada-ops` as a shipped user-facing binary
- update all docs/examples/scripts to `narada`
- update dependent repos accordingly

The key requirement is that `narada` is the only user-facing CLI name after this task.

## Suggested Command Shape

```bash
narada init-repo ~/src/narada.sonar
narada want-mailbox help@global-maxima.com
narada want-posture help@global-maxima.com draft-only
narada setup
narada preflight help@global-maxima.com
narada explain help@global-maxima.com
narada activate help@global-maxima.com
```

## Deliverables

- user-facing binary `narada`
- `init-repo` command implemented
- generated repo skeleton is coherent for private ops repos
- README/docs updated to show `narada`, not `narada-ops`, as primary interface
- hard removal of `narada-ops` from the user-facing surface
- verification that an initialized repo can immediately accept `want-mailbox` and `setup`

## Definition Of Done

- [ ] `narada` is the primary documented user CLI
- [ ] `narada init-repo <path>` creates a coherent private ops repo skeleton
- [ ] initialized repo works with existing shaping commands without manual repair
- [ ] `narada-ops` is removed from the user-facing surface
- [ ] `narada.sonar` can be explained as an instance of `narada init-repo`, not a hand-built special case

## Notes

This task is intentionally separate from Task 113. Package taxonomy migration and user-facing CLI unification are related, but should not be coupled tightly enough to block each other.
