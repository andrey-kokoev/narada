# Task 203: Add Preview Derivation From Stored Facts

## Why

Task 201 covers explicit work derivation from stored facts, which is state-advancing inside the control plane.

Narada also needs the lighter sibling:

- derive what would happen
- without opening work
- without claiming leases
- without creating intents/outbound handoffs

This is the clean way to inspect “what would the charter propose for this existing thread?” before promoting anything into governed work.

## Goal

Add a preview-only derivation surface that runs stored facts through context formation and charter evaluation, but stops short of control-plane mutation.

## Required Behavior

- select a bounded stored-fact set
- form the same context that live/replay derivation would use
- build the same charter invocation envelope shape
- run charter evaluation
- return/report the resulting proposed action(s)
- do not open `work_item`
- do not create `intent`
- do not create outbound handoff/draft automatically

## Coherence Rule

Preview is not fake work. It is a read-only derivation mode.

It should reuse canonical derivation/evaluation code paths as far as possible, but remain clearly non-authoritative.

## Immediate Use Case

For an already-synced mailbox thread:

- preview what `support_steward` would propose
- inspect proposed draft body / categorization / no-action
- decide whether to promote into governed work later

## Definition Of Done

- [x] Narada has a preview-only stored-fact derivation surface.
- [x] Preview does not create work, intents, or outbound commands.
- [x] Preview uses canonical context/evaluation logic as far as possible.
- [x] Preview output is inspectable for an existing mailbox thread.
- [x] Docs clearly distinguish preview from replay work derivation.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
