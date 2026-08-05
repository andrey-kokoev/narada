# @narada-core/ops-kit

Narada operational shaping and preflight library.

## Contract

`ops-kit` covers:

```text
user intent -> Narada operation shape -> readiness -> activate
```

It is Narada-specific. It should not become a generic installer or config-management system.

## User Interface

These commands are exposed through the unified `narada` CLI in `@narada-core/cli`:

- `narada init-repo <path>` — bootstrap a private ops repo
- `narada want-mailbox <mailbox-id>` — shape a mailbox into config
- `narada want-workflow <workflow-id>` — shape a workflow into config
- `narada want-posture <target> <preset>` — apply a posture preset
- `narada setup` — scaffold directories for configured operations
- `narada preflight <operation>` — verify readiness before activation
- `narada inspect <operation>` — show operation configuration
- `narada explain <operation>` — explain what an operation will do
- `narada activate <operation>` — mark an operation as activated

`ops-kit` is a library package. It does not ship a binary.

## Runtime posture

Local build, typecheck, and tests are Bun-first. The package-local Vitest
config inlines `zod` for Bun’s worker interop; `build:node`, `typecheck:node`,
and `test:node` retain explicit Node compatibility paths.
