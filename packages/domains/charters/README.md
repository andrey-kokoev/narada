# @narada-core/charters

## Runtime posture

Local build, typecheck, and tests are Bun-first. The package-local Vitest
config inlines `zod` for Bun because Vitest's Node worker otherwise exposes
the CommonJS shape incorrectly. The `build:node`, `typecheck:node`, and
`test:node` scripts retain Node compatibility; publication admission remains
an explicit Node-only `prepublishOnly` step.

Charter contracts, policy profiles, and runtime bindings for Narada.

## Role

This package defines the policy layer that sits above the kernel and below execution.

It is where charter profiles such as `support_steward` and `obligation_keeper` are expressed, validated, and bound into Narada runtime envelopes.

## What belongs here

- charter/profile definitions
- runtime envelope types
- tool catalog bindings and validation
- policy-facing knowledge source contracts

## What does not belong here

- private operational knowledge
- mailbox-specific live data
- customer-specific instructions

Those belong in private ops repositories such as `narada.sonar`, not in the public source repo.

## Installation

```bash
npm install @narada-core/charters
# or
pnpm add @narada-core/charters
```

## Related Packages

- `@narada-core/control-plane`: deterministic kernel and mailbox vertical
- `@narada-core/daemon`: long-running orchestration surface
- `@narada-core/cli`: operator CLI
