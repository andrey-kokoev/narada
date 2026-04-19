# Task 195: Register USC App as Narada Operation

## Context

Task 192 adds `narada init usc <path>` to Narada proper, making Narada the canonical entry point for USC-governed app repo creation. The task spec optionally requested:

```bash
--register-operation <operation-id>
```

This would write a Narada operation config entry pointing at the USC app repo.

## Gap

Narada proper's operation model (`@narada2/ops-kit`) does not yet have an operation type for USC-governed app repos. Existing operation types are:

- `mailbox` (via `want-mailbox`)
- `workflow` (via `want-workflow`)
- `posture` (via `want-posture`)

There is no `usc-app` or equivalent operation type.

## What Would Be Needed

1. Extend `@narada2/ops-kit` operation schema to support `type: "usc-app"` operations
2. Add `wantUscApp(operationId, { appPath, configPath })` to `@narada2/ops-kit`
3. Wire `--register-operation <operation-id>` in `narada init usc` to call `wantUscApp`
4. Ensure the daemon/scheduler understands how to treat USC-app operations (or document that they are inert until further integration)

## Decision

**Deferred.** Task 192 completes without operation registration. This follow-up task documents the gap for future implementation when the operation model is ready to support USC app references.
