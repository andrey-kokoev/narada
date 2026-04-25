# Examples Catalog

## Mission
Define and create a top-level `examples/` catalog for cross-cutting use cases, playgrounds, and scenario fixtures that exercise the architecture across layers, verticals, and domains.

## Why Top-Level
Examples should not live inside a single package because they are not owned by one concept only. A real example may involve:

- foreman coordination
- charter invocation
- mailbox vertical inputs
- outbound decisions
- knowledge bindings
- obligation extraction

So `examples/` should sit beside `packages/`, not under any one package.

## Target Shape

```text
examples/
  README.md
  thread-cases/
  sequences/
  mailbox-scenarios/
  playgrounds/
```

## Example Classes

### 1. `thread-cases/`
Unit use cases.

These are the smallest meaningful architecture exercises:

- one thread
- one mailbox binding
- one foreman routing decision
- one primary charter
- zero or more secondary charters
- expected structured outputs and proposed actions

### 2. `sequences/`
Temporal use cases.

These represent the same thread evolving across steps:

- new inbound message
- charter evaluation
- outbound proposal
- reply confirmation
- follow-up or escalation

### 3. `mailbox-scenarios/`
Multi-thread mailbox mixes.

These exercise queue-level behavior:

- many threads in one mailbox
- selective charter invocation
- prioritization and arbitration patterns

### 4. `playgrounds/`
Executable or operator-facing demos.

These are looser interactive surfaces for:

- trying foreman routing
- inspecting charter outputs
- walking through scenarios manually

## Content Rules

- examples are cross-cutting and may reference multiple packages
- examples are not the canonical source of policy or architecture
- examples should be shaped around real `ThreadCase`-like units where possible
- examples should distinguish:
  - input context
  - expected charter invocation
  - expected foreman decision surface
  - expected outbound or obligation proposals

## Deliverables

### 1. Top-Level Directory
Create:

- `examples/`
- `examples/README.md`
- `examples/thread-cases/`
- `examples/sequences/`
- `examples/mailbox-scenarios/`
- `examples/playgrounds/`

### 2. Catalog Index
The README should explain:

- why examples are top-level
- the difference between thread cases, sequences, mailbox scenarios, and playgrounds
- how examples relate to packages and tasks

### 3. Initial Seed Examples
Add placeholders or first real examples for:

- direct support resolution
- support thread with commitment extraction
- obligation-centric internal follow-up
- conflicting charter recommendations requiring foreman arbitration

### 4. Naming Convention
Use concept-first names, not historical `exchange-*` names.

## Definition Of Done

- [ ] top-level `examples/` exists
- [ ] examples catalog subfolders exist
- [ ] `examples/README.md` explains the taxonomy
- [ ] at least a small seed set of example files or placeholders exists
- [ ] examples are clearly treated as cross-cutting, not package-local
