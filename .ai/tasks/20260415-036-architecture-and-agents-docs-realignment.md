# Architecture and AGENTS Docs Realignment

## Context

The codebase has advanced from:

- deterministic mailbox compiler only

to:

- compiler
- coordinator durable state
- scheduler
- foreman
- charter runtime
- tool execution
- outbound idempotent handoff
- multi-mailbox dispatch
- observability surfaces

The documentation must now be realigned so future contributors do not reintroduce older assumptions.

## Goal

Produce one coherent repo narrative such that:

> the code, tasks, architecture docs, and AGENTS instructions all describe the same system.
