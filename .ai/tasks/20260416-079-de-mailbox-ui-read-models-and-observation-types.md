.ai/tasks/20260416-079-de-mailbox-ui-read-models-and-observation-types.md
# Task 079 — De-Mailbox UI Read Models and Observation Types

## Objective
Remove mailbox-first residue from observation/query/type layers that are now used by the UI.

## Why
The UI layer still consumes read models with mailbox-first internals such as:
- `conversation_records`
- `mailbox_id`
- `conversation_id`
- mailbox-specific summary shaping in generic surfaces

That weakens vertical neutrality and blocks clean non-mail evolution.

## Required Changes
- Refactor observation-facing types and query helpers toward neutral names:
  - `context_id`
  - `scope_id`
  - vertical-specific read models only where appropriate
- Preserve a mailbox vertical page, but isolate mailbox naming to that page/model
- Stop using mailbox-shaped naming in generic context/timeline/overview APIs
- Add migration or compatibility shims where necessary

## Acceptance Criteria
- Generic observation routes and types do not expose mailbox-only naming
- Mailbox-specific naming exists only inside mailbox vertical views
- Non-mail fixtures can populate generic UI pages without semantic distortion
- Type-level grep confirms mailbox residue is isolated

## Invariant
Generic read models describe kernel truth, not one vertical’s historical schema.