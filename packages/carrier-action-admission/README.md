# Carrier Action Admission

Carrier-neutral v0 implementation of the Carrier Action Admission Boundary.

This module converts non-read-only carrier tool requests into durable request/decision evidence. It does not execute mutating actions and does not create canonical candidates in v0.

## Authority

This package owns the carrier-neutral admission boundary used by Narada-owned
carriers.

Canonical source:

```text
D:\code\narada\packages\carrier-action-admission\src\
```

`@narada-core/agent-cli` and Agent Runtime Server use this package to keep model-selected MCP calls
from becoming authority merely because a tool exists.

## Invariant

Carrier action admission does not grant authority by itself. It converts a
requested action into one of:

- read-only admission under declared read policy;
- refusal;
- durable admission-required evidence;
- inert routed evidence for a later authority surface.

No carrier should bypass this boundary for non-read-only MCP calls.

## Relationship To MCP Fabric

`@narada-core/mcp-fabric` projects the Site MCP fabric and tool metadata.
`@narada-core/carrier-action-admission` decides whether a carrier request against
that fabric may execute, must be refused, or must be routed as evidence.

## Verification

```powershell
pnpm --filter @narada-core/carrier-action-admission test
pnpm --filter @narada-core/carrier-action-admission typecheck
```
