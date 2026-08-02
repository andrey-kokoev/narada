# Host Fleet Host-Only Contract

## Objective

Host Fleet is a read-only projection of hosts that belong to one Fleet. It does not know what any host contains.

## Authority Boundary

A Fleet member is exactly one host. A host observation crosses into the Fleet read model only when it presents the host-level `host_fleet_membership_secret` configured by the Fleet membership authority. The proof is checked at admission and is never persisted or projected.

The membership authority has one legal scope: `host`. User Site, Site, agent, session, runtime, and launcher scopes are invalid at this boundary.

## Projected Codomain

Each admitted host projects exactly four domains:

1. **Identity**: stable host ID, display name, and platform.
2. **Reachability**: whether the host was reachable and when that was observed.
3. **Health**: host health status, observation time, and bounded diagnostic detail.
4. **Operator Console location**: availability and an HTTP(S) URL when known.

The Fleet snapshot adds only its schema and generation time. It does not contain Site IDs, Site lists, agent IDs, session IDs, runtime targets, capabilities inside a host, or lifecycle commands.

## Read Model

`@narada-core/host-fleet` builds an immutable snapshot from authenticated host observations. Its public registry API exposes only `list()`. It has no enrollment, update, delete, launch, stop, credential-rotation, gateway-control, event-stream, or discovery method.

The Operator Console consumes the same snapshot through a GET-only endpoint and renders a read-only host table. It does not become Fleet authority.

The first implementation has no implicit discovery source. A host-level collector may supply authenticated observations through the read-model construction boundary. Without one, the Operator Console returns a valid empty Fleet snapshot. It must not populate that snapshot by consulting a User Site, Site registry, agent inventory, or runtime-session index.

## Mechanical Enforcement

The package test suite must fail when:

- a host or snapshot carries Site, agent, session, or runtime identity fields;
- membership authority has any scope other than `host`;
- Fleet source imports a Site, agent, session, NARS, launcher, or lifecycle package;
- the package gains a production package dependency;
- the membership secret appears in a projected snapshot;
- the registry gains a mutation method.

The strict runtime validators reject unknown keys at every wire boundary, so a structurally valid Site-aware extension cannot be smuggled through TypeScript's open object assignability.

## Explicit Non-Goals

- discovering Sites, agents, sessions, or runtimes inside a host;
- controlling host or internal-host lifecycle;
- choosing an authority runtime;
- managing per-host credentials;
- defining Cloudflare persistence or replication;
- exposing an MCP mutation surface.

Those concerns require separate authority contracts. They cannot be added by widening the Host Fleet record.
