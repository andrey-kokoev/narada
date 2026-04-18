# @narada2/charters

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
npm install @narada2/charters
# or
pnpm add @narada2/charters
```

## Related Packages

- `@narada2/control-plane`: deterministic kernel and mailbox vertical
- `@narada2/daemon`: long-running orchestration surface
- `@narada2/cli`: operator CLI
