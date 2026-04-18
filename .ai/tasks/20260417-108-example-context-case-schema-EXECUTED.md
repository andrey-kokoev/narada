# Example ContextCase Schema — EXECUTED

**Date**: 2026-04-17
**Status**: Complete

---

## Deliverables

### 1. Canonical Schema (`examples/schema/context-case.ts`)

Defined TypeScript interfaces:

- `ContextCase` — the canonical fixture unit
  - `case_id`, `title`, `description`
  - `status`: `FixtureStatus` (`draft` | `active` | `deprecated`)
  - `vertical`: string tag (mailbox, timer, filesystem, webhook, ...)
  - `context_input`: `ContextInput` with `context_id`, `scope_id`, optional `state`
  - **Note**: the original spec's `thread_or_context_state` field was removed — context state is vertical-agnostic and belongs in the optional `state` bag, not a mailbox-biased field
  - `knowledge_items`: optional `KnowledgeItem[]`
  - `expected_primary_charter`: string
  - `expected_invocations`: optional `CharterInvocation[]`
  - `expected_outputs`: `ExpectedOutput[]` (kind, description, matcher)
  - `forbidden_outputs`: optional `ForbiddenOutput[]`

Supporting types:
- `ContextInput` — kernel-neutral input surface
- `KnowledgeItem` — key/value knowledge attachments
- `CharterInvocation` — expected charter calls with role (primary/secondary)
- `ExpectedOutput` — assertable output with `kind`, `description`, `matcher`
- `ForbiddenOutput` — outputs that must NOT be produced
- `FixtureStatus` — `draft` | `active` | `deprecated`

### 2. Fixture Status Model

Three statuses defined:
- `draft` — fixture exists but is not yet treated as a passing executable example
- `active` — fully assertable and expected to pass
- `deprecated` — old fixture, skipped by runner

### 3. Assertion Model

Assertable output kinds:
- `routing` — foreman routing decisions
- `classification` — charter classifications
- `fact` — extracted facts
- `intent` — proposed intents / durable effect creation (the primary assertable boundary for side effects)
- `obligation` — extracted obligations
- `action` — other proposed actions

Each assertion uses a `matcher: Record<string, unknown>` for structured matching.

### 4. Sequence Schema (`examples/schema/sequence.ts`)

Also defined `Sequence` for temporal fixtures:
- `sequence_id`, `title`, `status`, `vertical`
- `base_context` — shared context properties
- `steps: SequenceStep[]` — ordered steps with triggers, context inputs, expected outputs

---

## Definition of Done

- [x] canonical `ContextCase` schema is defined
- [x] fixture status model is defined
- [x] assertable output model is defined
- [x] schema is suitable for use in `examples/context-cases/`
