# Task 112: ops-kit v1 Intent-to-Operationalization

## Why

Narada currently has pieces of the operational substrate:

- scope config
- charter runtime config
- policy bindings
- tool definitions and bindings
- explicit operational requirements for tool bootstrap/preflight

What is still missing is the user-facing path from:

```text
user intent
-> Narada shape
-> readiness
-> optional operation
```

Without that layer, the user must manually infer:

- which Narada objects must exist
- which files and directories must be created
- which policy choices are needed
- which tools/env vars/executables are missing
- what a given mailbox or workflow will actually do once activated

`packages/ops-kit` should provide that shaping and readiness surface without turning Narada into a generic installer, scheduler, or config-management platform.

## Goal

Define and implement `packages/ops-kit` v1 as the Narada-specific operational shaping and preflight layer.

It must support the full user journey:

```text
(user voice) -> (Narada is set up and optionally operational)
```

More precisely:

```text
user voice
-> Narada objects/config derived
-> gaps identified
-> setup applied
-> readiness verified
-> optionally marked operational
```

## Non-Goals

- Do not build a generic package manager
- Do not build Ansible-lite or Terraform-lite
- Do not scrape charter prose to infer requirements
- Do not duplicate runtime tool semantics in a second ad hoc system
- Do not start long-running processes automatically in v1

## Core Principle

`ops-kit` must operate on structured declarations, not prose.

Primary sources of truth:

- ops repo config
- charter bindings
- allowed actions / allowed tools
- tool definitions
- `ToolDefinition.setup_requirements`

`ops-kit` may derive setup/readiness needs from these declarations, but must not invent undeclared dependencies.

## v1 Command Surface

### Shape

Commands that turn user intent into Narada structure.

#### `ops-kit want mailbox <mailbox-id>`

Purpose:

- shape “I want Narada to assist this mailbox” into mailbox-owned Narada objects

Expected behavior:

- scaffold mailbox directory
- create or patch scope config
- bind primary and secondary charters
- apply posture preset
- summarize resulting shape

Typical touched paths:

- `config/config.json`
- `mailboxes/<mailbox-id>/README.md`
- `mailboxes/<mailbox-id>/scenarios/`
- `mailboxes/<mailbox-id>/knowledge/`
- `mailboxes/<mailbox-id>/notes/`

#### `ops-kit want workflow <workflow-id>`

Purpose:

- shape “I want Narada to do this periodically / on a timer” into workflow-owned objects

Expected behavior:

- scaffold workflow directory
- create schedule declaration
- bind charter
- bind tools
- summarize resulting shape

Typical touched paths:

- `config/config.json`
- `workflows/<workflow-id>/README.md`
- `workflows/<workflow-id>/schedule.json`
- `workflows/<workflow-id>/knowledge/`
- `workflows/<workflow-id>/notes/`

#### `ops-kit want knowledge`

Purpose:

- attach knowledge to a mailbox+charter or workflow+charter in a structured way

Expected behavior:

- create or patch knowledge declarations
- validate supported knowledge kinds
- show resulting effective bindings

#### `ops-kit want posture <target> <preset>`

Purpose:

- apply a named action posture rather than forcing raw policy editing first

Initial mailbox presets:

- `draft-only`
- `draft-and-review`
- `send-allowed`

Initial workflow presets:

- `observe-only`
- `draft-alert`
- `act-with-approval`

### Realize

Commands that make the shaped target usable.

#### `ops-kit setup [target]`

Purpose:

- materialize safe local structure needed by already-declared Narada shape

Expected behavior:

- create missing directories/files
- create mailbox/workflow subtrees
- create `logs/`
- optionally create other harmless local structure

Must not:

- run daemon
- perform irreversible side effects
- silently invent undeclared requirements

#### `ops-kit preflight [target]`

Purpose:

- verify whether the target is runnable

Checks:

- config validity
- declared setup requirements
- charter runtime validity
- required env vars
- required executables/files/directories/endpoints
- local package resolution

Output:

- pass/fail
- missing pieces
- exact next actions

#### `ops-kit inspect [target]`

Purpose:

- show the effective Narada object model for a target

Output should include:

- effective config
- bound charters
- allowed actions
- allowed tools
- declared setup requirements
- knowledge bindings

#### `ops-kit explain [target]`

Purpose:

- answer “what will this do?” or “why is this not ready?”

Should explain:

- operational consequences of the current shape
- blockers
- reasons for non-readiness
- why no action would occur if run now

#### `ops-kit activate [target]`

Purpose:

- mark a target operationally ready for runner/daemon use

v1 scope:

- config/state transition only
- no auto-launch of long-running processes

## User Walkthroughs To Cover

### 1. Add a Helpdesk Mailbox

User voice:

- “I want Narada to assist `help@global-maxima.com`.”

Narada objects implied:

- one scope
- mailbox directory
- charter bindings
- action posture
- knowledge bindings

`ops-kit` must make this flow direct.

### 2. Add a Timer Workflow

User voice:

- “Every minute, check Postgres and tell me if something is wrong.”

Narada objects implied:

- timer-backed workflow
- schedule declaration
- charter binding
- tool binding
- setup requirements for the tool

### 3. Attach Knowledge

User voice:

- “This mailbox + charter should know these files/URLs/sqlite sources.”

`ops-kit` must support structured attachment and readiness checking.

### 4. Set Safe Outbound Posture

User voice:

- “Allow drafts, forbid sends.”

`ops-kit` must support readable posture presets and explain the resulting policy.

### 5. Explain Non-Action

User voice:

- “Why didn’t Narada do anything here?”

`ops-kit` must be able to explain readiness and blocked action paths.

## Required Types / Surfaces

v1 should build on existing declarations rather than inventing parallel sources of truth.

Already available:

- runtime tool declarations
- config policy bindings
- `ToolDefinition.setup_requirements`
- `collectOperationalRequirements(...)`

Missing v1 surfaces to add under `packages/ops-kit`:

- intent input types for `want mailbox`
- intent input types for `want workflow`
- posture preset types
- readiness result types
- explain/inspect result types

## Suggested Package Shape

```text
packages/ops-kit/
  src/
    commands/
      want-mailbox.ts
      want-workflow.ts
      want-knowledge.ts
      want-posture.ts
      setup.ts
      preflight.ts
      inspect.ts
      explain.ts
      activate.ts
    intents/
      mailbox.ts
      workflow.ts
      posture.ts
    readiness/
      collect.ts
      report.ts
    render/
      explain.ts
      inspect.ts
    index.ts
```

## v1 Delivery Order

1. scaffold `packages/ops-kit`
2. implement `want mailbox`
3. implement `want workflow`
4. implement `setup`
5. implement `preflight`
6. implement `explain`
7. implement `activate`

`inspect` and `want knowledge` may land in the same wave if scope remains controlled.

## Definition of Done

- `packages/ops-kit` exists with a documented CLI surface
- mailbox intent can be shaped into config + file layout
- workflow intent can be shaped into config + file layout
- `setup` materializes safe local structure
- `preflight` validates declared readiness against structured requirements
- `explain` produces user-facing reasons and next actions
- `activate` marks targets operationally ready without auto-running long-lived processes
- all flows operate on structured declarations, not charter prose
- tests cover at least one mailbox journey and one workflow journey
