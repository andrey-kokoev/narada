# AGENTS.md - @narada-core/host-fleet-runtime

This package owns the machine-level Host Fleet authority and publisher
processes. `@narada-core/host-fleet` remains the pure host-only wire contract.

## Boundary

- Fleet members are hosts, never Sites or objects inside Sites.
- Runtime configuration, SQLite state, signing credentials, probes, and OS
  service plans are machine-level concerns.
- The authority HTTP listener is loopback-only. Remote heartbeat admission
  crosses through the dedicated Host Gateway route.
- A heartbeat cannot choose identity metadata or probe targets; the
  authority-owned host roster is canonical.
- Do not import Site registries, agent/session inventories, NARS, launcher, or
  Site lifecycle packages.

## Verification

```text
pnpm --filter @narada-core/host-fleet-runtime test
pnpm --filter @narada-core/host-fleet-runtime typecheck
```
