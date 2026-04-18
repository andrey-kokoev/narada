# Task 121: Implement Demo And Safe Local Trial Paths

## Why

Narada's real mailbox path is the main practical entry path, but two important first-time user intents are still missing as first-class product surfaces:

- "show me what this is"
- "let me try it safely without touching live systems"

Right now those intents are only partially served by scattered examples, fixtures, and internal test machinery.

That is not enough for a smooth first-time experience.

## Goal

Implement two explicit non-live entry paths for Narada:

1. a **demo path** for users who want a fast, zero-risk taste
2. a **safe local trial path** for users who want a near-real run without live mailbox credentials or live outbound behavior

This task must produce real command surfaces and runnable flows, not just documentation.

## Required User Intents

### 1. Demo Path

User intent:

> I heard about Narada and want to see what it does.

Expected characteristics:

- no Azure setup
- no real mailbox
- no private ops repo knowledge required
- low time-to-first-value
- high explanatory value

### 2. Safe Local Trial Path

User intent:

> I want to try Narada end to end, but I do not want to touch live systems yet.

Expected characteristics:

- local/private repo flow
- fixture-backed or mock-backed operation
- no live mailbox credentials required
- no live outbound execution
- should feel close to the real operational path

## Scope

This task must cover:

- command surface for the two trial modes
- fixture/example selection and loading
- local repo/bootstrap implications where relevant
- explanatory output
- first-run docs for these paths

## Non-Goals

- Do not redesign the real mailbox gold path
- Do not require live Graph credentials
- Do not add fake complexity to simulate realism
- Do not add autonomous send behavior
- Do not depend on the user understanding workspace internals

## Required Outcomes

### 1. First-Class Demo Command

Implement one obvious demo entry command.

Examples of acceptable shapes:

- `narada demo`
- `narada examples run starter-mailbox`

But there must be exactly one clearly recommended first demo command.

Expected behavior:

- run one curated example
- show what Narada ingests, decides, and proposes
- explain results in user language
- finish safely and locally

### 2. First-Class Safe Trial Command Or Flow

Implement one obvious safe trial path.

Examples of acceptable shapes:

- `narada init-repo --demo ~/src/my-tryout`
- `narada init-repo ~/src/my-tryout && narada want-mailbox-demo ...`
- `narada trial mailbox ~/src/my-tryout`

The exact command shape is less important than the semantic outcome:

- a new user can create a local Narada operation backed by fixtures or mocks
- the flow feels close to the real mailbox operation path
- nothing touches live systems

### 3. Curated Example Selection

Do not expose a sprawling example catalog as the primary entry.

Choose one or two curated starter examples only.

At minimum:

- one mailbox-support style example
- optionally one workflow/timer example if it materially improves understanding

### 4. Explanatory Output

The non-live trial paths must not just "run"; they must teach.

They should explain, briefly:

- what source/input was used
- what operation was formed
- what posture applied
- what Narada would do in a live system
- why this mode is safe

### 5. Docs Alignment

Update first-run docs so these paths are discoverable and intentionally placed.

Desired entry ordering:

1. `show me` demo path
2. `try safely` local path
3. `use on a real mailbox` path

## Deliverables

- one first-class demo command
- one first-class safe local trial flow
- curated starter fixture/example support
- explanatory output for both paths
- first-run docs that explicitly present these paths

## Definition Of Done

- [ ] a brand new user can run one command to see Narada safely in action
- [ ] a brand new user can try a near-real local Narada flow without live credentials
- [ ] both paths are documented as intentional first-time entry paths
- [ ] both paths explain what Narada is doing rather than only emitting raw output
- [ ] neither path requires understanding monorepo/workspace internals

## Notes

This task is implementation-oriented. It should not become another abstract onboarding taxonomy exercise.

It complements:

- Task 118: unify the canonical CLI
- Task 120: repair the real first-run gold path

Together, those tasks should give Narada three coherent entry paths:

- demo
- safe local trial
- real mailbox operation
