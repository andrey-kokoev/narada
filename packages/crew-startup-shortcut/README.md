# @narada2/crew-startup-shortcut

Descriptor contracts for governed crew startup shortcuts.

This package defines portable startup/rehydration request and plan shapes. It does not launch processes, create Windows shortcuts, mutate PC/operator-surface state, hydrate runtime memory, or grant capabilities.

The package assumes the receiving Site owns local admission. Narada proper package selection provides descriptors only.

## Posture

- MCP-only by default.
- Native shell fallback is refused.
- User Site shortcut files and runtime state are not valid inputs.
- Missing MCP capability is reported as a blocker, not repaired by direct substrate execution.

## First Slice

The first slice includes:

- `buildCrewStartupPlan`
- `buildCrewStartupLaunchIntentSequence`
- `buildCrewStartupRefusal`
- neutral fixtures for a valid MCP-only startup plan and refused native shortcut fallback
- source-state import guards

`buildCrewStartupLaunchIntentSequence` composes a startup request into a governed sequence:
read task-lifecycle context, plan agent-context hydration, read a checkpoint summary if available,
and prepare an operator-surface launch handoff. It still does not create `.lnk` files, launch
processes, mutate PC-locus/operator-surface runtime state, or allow native shell fallback.
