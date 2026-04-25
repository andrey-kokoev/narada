# Task 118: Make `@narada2/cli` The Only Public CLI And Demote `ops-kit`

## Why

Task 114 execution exposed a structural mistake:

- `@narada2/cli` publishes `narada`
- `@narada2/ops-kit` also publishes `narada`
- the two binaries expose different command surfaces

That is not a coherent hard cutover. It creates two competing meanings of `narada`.

The correct resolution is:

- `@narada2/cli` is the canonical published CLI package
- `narada` is the only public binary
- `ops-kit` becomes an internal/library package only, with no shipped binary

## Goal

Unify all user-facing Narada commands under `@narada2/cli` and remove `ops-kit` as a separate shipped CLI surface.

## Required Outcome

### 1. `@narada2/cli` Owns The User Command Surface

`packages/layers/cli` must be the sole public CLI package.

It must expose one coherent `narada` binary containing:

- existing sync/status/config/integrity/etc. commands that remain valid
- the newer repo/operation shaping commands:
  - `init-repo`
  - `want-mailbox`
  - `want-workflow`
  - `want-posture`
  - `setup`
  - `preflight`
  - `inspect`
  - `explain`
  - `activate`

### 2. `ops-kit` Becomes Library-Only

`packages/ops-kit` may remain as an implementation package if useful, but:

- it must not ship the `narada` binary
- it must not be documented as a separate user-facing CLI
- its command logic should be imported/integrated into `@narada2/cli`

### 3. Remove Competing `narada` Binary Definitions

After this task, there must be exactly one public `narada` binary in the workspace/package graph.

Disallowed end state:

- two packages both defining `narada`
- one `narada` for sync/runtime and another `narada` for ops/bootstrap

### 4. Repair Public CLI Identity

`packages/layers/cli/src/main.ts` must stop presenting itself as `exchange-sync` and instead present itself as `narada`.

The command help, descriptions, and docs must match the unified public CLI identity.

### 5. Update Docs And Generated Repo Expectations

Any docs or generated repo templates that refer to the separate `ops-kit` CLI surface must be updated.

The user-facing story should be:

- install/use `narada`
- run `narada init-repo`
- run `narada want-mailbox`
- run `narada preflight`
- etc.

## Scope

This task must cover:

- CLI package ownership
- binary definitions
- entrypoint integration
- docs/help output alignment
- tests for the unified command surface

## Non-Goals

- Do not redesign the actual command behaviors unless needed for integration
- Do not reopen package taxonomy migration broadly
- Do not reintroduce deprecated aliases as a long-lived surface

## Deliverables

- `@narada2/cli` is the only package shipping `narada`
- unified `narada` help output includes both runtime and ops/bootstrap commands as intended
- `ops-kit` has no public binary
- docs point to one CLI surface only
- command integration tests pass

## Definition Of Done

- [ ] exactly one workspace package ships the `narada` binary
- [ ] `packages/layers/cli/src/main.ts` identifies itself as `narada`
- [ ] `init-repo` and related shaping commands are available through the canonical `narada` CLI
- [ ] `ops-kit` no longer ships a public CLI binary
- [ ] docs/examples/generated repo guidance refer to the unified CLI surface only

## Notes

This is the concrete corrective path for the ambiguity discovered during review of Task 114. It should be completed before Task 114 can be considered truly finished.
