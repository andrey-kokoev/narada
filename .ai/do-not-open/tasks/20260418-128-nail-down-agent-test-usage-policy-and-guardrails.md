# Task 128: Nail Down Agent Test Usage Policy And Guardrails

## Why

Coding agents keep launching the full test suite by default.

In this repo, that is currently too easy because:

- `pnpm test` runs `pnpm -r test`
- there is no clearly designated fast verification command
- there is no hard policy in `AGENTS.md` forbidding full-suite runs without explicit user request
- there is no script-level guardrail stopping accidental full-suite execution

That creates repeated wasted time and noisy verification behavior.

This is not just a prompting problem. It is a product-surface problem.

Agents choose what the repo makes obvious.

## Goal

Make Narada's test and verification surface coherent so that:

- agents default to cheap, narrow verification
- full-suite runs are explicit and rare
- repo policy and script behavior agree

## Principles

### 1. Fast verification must be the obvious default

A coding agent should have one obvious command to run after a local change that is materially cheaper than the full suite.

### 2. Full-suite execution must require explicit intent

If a command exercises the entire workspace, that command should be named and guarded like an expensive action.

### 3. Policy and mechanics must agree

It is not enough to write "please don't run full tests" in docs while leaving `pnpm test` as the casual default.

### 4. Narrow verification should be first-class

The repo should provide named commands for:

- fast default verification
- package-scoped verification
- explicit full-suite verification

## Required Outcomes

### 1. Redefine the script surface coherently

Propose and implement a coherent script naming model.

Recommended target shape:

- `pnpm verify` — fast default local verification
- `pnpm test:full` — full recursive test suite
- `pnpm typecheck` — either fast default or explicit full typecheck, but must be documented clearly
- optional package-scoped forms where useful

The important constraint is semantic clarity:

- default command = cheap enough to use routinely
- `:full` command = expensive and explicit

### 2. Remove `pnpm test` as the casual full-suite trap

Do not leave `pnpm test` meaning "run everything in the workspace" if agents are expected not to use it casually.

Acceptable outcomes include:

- repurpose `pnpm test` to a fast/local-safe default
- or hard-fail `pnpm test` with a message directing users to `pnpm verify` or `pnpm test:full`

But the repo must stop presenting `pnpm test` as the obvious casual choice for full recursive execution.

### 3. Add hard guardrails for full-suite runs

Full-suite execution should require an explicit opt-in.

Example acceptable shapes:

- `ALLOW_FULL_TESTS=1 pnpm test:full`
- `NARADA_FULL_VERIFY=1 pnpm verify:full`
- a small wrapper script that refuses to run without an explicit env var or flag

This is required. Documentation-only guidance is not enough.

### 4. Update agent guidance

Update `AGENTS.md` so the policy is explicit.

The guidance should say, in substance:

- do not run full-suite commands unless the user explicitly asks
- prefer the narrowest verifying command first
- prefer package-scoped or changed-surface verification where available
- if broader verification is needed, escalate from fast -> scoped -> full

### 5. Update root docs

Update README / quickstart / contributor-facing docs so the verification story is clear.

At minimum, document:

- the default fast verification command
- the explicit full-suite command
- when each should be used

## Deliverables

- corrected root script surface for test / verify behavior
- hard guard around full-suite execution
- updated `AGENTS.md` policy for agent verification behavior
- updated root docs explaining the verification ladder

## Definition Of Done

- [x] there is a single obvious fast verification command for routine local use (`pnpm verify`, ~8 sec)
- [x] full-suite execution is no longer the casual default (`pnpm test` is blocked at root)
- [x] full-suite execution requires explicit intent via command naming and/or guard variable (`ALLOW_FULL_TESTS=1 pnpm test:full`)
- [x] `AGENTS.md` explicitly instructs agents not to run the full suite unless asked
- [x] root docs explain the verification ladder clearly

## Notes

This task is about repository ergonomics and behavioral control, not about reducing test coverage.

The objective is to make expensive verification intentional instead of accidental.
