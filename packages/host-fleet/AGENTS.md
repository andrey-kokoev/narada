# AGENTS.md - @narada-core/host-fleet

This package owns the host-only Fleet wire contract and immutable authenticated read model.

## Boundary

- A Fleet member is a host.
- The membership authority scope is always `host`.
- The shared proof is named `host_fleet_membership_secret` and is never projected.
- Host records expose identity, reachability, health, and Operator Console location only.
- This package must not import Site, agent, session, NARS, launcher, or lifecycle packages.
- This package does not discover or control anything inside a host.

The package boundary tests are authoritative. Extend them before extending the contract.

## Verification

```text
pnpm --filter @narada-core/host-fleet test
pnpm --filter @narada-core/host-fleet typecheck
```
