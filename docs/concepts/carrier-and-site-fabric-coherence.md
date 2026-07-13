# Carrier And Site Fabric Coherence

## Purpose

This document records the coherence boundary for two related gaps:

- carrier families do not all enforce Narada authority at the same level;
- launcher-known Sites do not all claim authoritative MCP surface registries.

The rule is to report those differences explicitly instead of collapsing them into a single "wired up" claim.

## Evidence Levels

Carrier conformance uses these evidence levels:

| Level | Meaning |
| --- | --- |
| `code_enforced` | Narada code mediates execution and can block, route, or refuse the requested action. |
| `config_enforced` | Narada-generated client config constrains available surfaces, but the carrier owns execution mechanics. |
| `startup_enforced` | Launcher/runtime arguments establish expected posture at process start. |
| `documented_advisory` | Prompt, doctrine, extension description, or operator instruction only. |
| `unverified` | No current evidence for the claimed behavior. |

Current carrier matrix:

```powershell
node tools\operator-surface-carriers\carrier-conformance-matrix.mjs
```

The command emits the conformance view for every row in the canonical
`packages/carrier-runtime-contract/contracts/carrier-launch-matrix.json`.
The launch matrix owns the row set and static posture; this report adds the
current launch-registry observation, such as Codex native-shell counts. This
document intentionally does not maintain a second carrier list.

## Site Fabric Audit

Launcher-known Sites are sourced from:

```text
C:\Users\Andrey\Narada\config\launch\agents.psd1
```

`@narada2/mcp-fabric` owns the carrier-side fabric loader and projection
semantics. The `tools\mcp-fabric\*.mjs` commands below are operator audit and
registry-maintenance entrypoints; they do not own the runtime library contract.

The audit command is:

```powershell
node tools\mcp-fabric\site-fabric-audit.mjs --pretty
```

The audit is read-only. It reports:

- launcher root and effective Site root;
- MCP fabric presence and server count;
- registry presence and shape: `surfaces`, `mcp_surfaces`, `absent`, or `invalid`;
- tolerant load status;
- strict validation status;
- authoritative MCP server count;
- live servers without registry metadata;
- stale generated client-config surfaces;
- recommendation.

## Validation Rule

Carrier startup uses tolerant validation. It should not fail merely because a registry is absent or partial.

Doctor, audit, and CI surfaces may use strict validation. Strict validation fails when a Site claims an authoritative generated client config but that generated client config no longer matches live `.ai/mcp` files.

Registry absence is not automatically failure. It means the Site is in `no_registry_claim` posture until it adds authoritative registry metadata.

To materialize a conservative registry from a Site's `.ai/mcp` fabric:

```powershell
node tools\mcp-fabric\generate-mcp-surface-registry.mjs --site-root "<site-root>" --pretty
```

The generated registry binds MCP client configs to Site authority but does not grant tool-level authority. Tools remain unlisted until explicitly classified, so mutating or unknown tools still require admission rather than becoming silently allowed.

The coherence gate is:

```powershell
node tools\mcp-fabric\coherence-gate.mjs --pretty
```

It fails when:

- Codex native shell is enabled in the launch registry;
- a launcher-known Site with MCP servers lacks authoritative registry metadata;
- strict registry validation reports stale generated client-config surfaces;
- a `documented_advisory` carrier is present in the coherent launch registry.

## MCP Runtime Freshness Invariants

MCP runtime freshness is a projection over several authorities. It is not a
single global status flag.

The invariant is:

```text
MCP freshness = Site source fact + Site restart request fact + carrier runtime observation
```

Those facts are correlated for startup reporting, but they keep separate
owners and separate evidence.

### Surface Identity

An MCP runtime surface is identified by this tuple:

```text
site_id + canonical_site_root + surface_id + server_entrypoint
```

`server_name` is display and compatibility metadata. `carrier_session_id` is
runtime lineage. Neither is sufficient identity by itself.

A local surface id such as `task-lifecycle-mcp.local` names a surface only
inside one Site. It is invalid as a global PC-runtime key unless paired with the
canonical Site root. A same-named surface in another Site is a different
surface.

### Authority Split

| Fact | Owning locus | Meaning |
| --- | --- | --- |
| Source freshness | Target Site | The MCP implementation source changed after that Site's recorded baseline. |
| Restart request | Target Site | That Site requested reload/restart for one declared surface. |
| Live callable process | PC/User runtime locus | A process answered the MCP protocol on this carrier/runtime channel. |
| Carrier lineage | PC/User runtime locus | The process inherited or registered a known carrier session. |
| Task/action authority | Target Site lifecycle law | The agent has explicit work authority, independent of MCP liveness. |

The PC runtime registry is an observation index. It may record process ids,
boot times, carrier lineage, and protocol reachability. It does not own Site
source freshness, does not own restart requests, and must not merge observations
from different Sites because their `surface_id` values match.

### Durable Marker Shape

Site-owned freshness markers are per surface:

```text
.ai/tmp/mcp-baselines/<surface-key>.json
.ai/tmp/mcp-restart-requests/<surface-key>.json
```

`<surface-key>` is derived from the Site-scoped surface identity:

```text
hash(canonical_site_root + surface_id + server_entrypoint)
```

A single Site-wide `.ai/tmp/mcp-baseline.json` is legacy posture. It can be
read for migration, but new freshness decisions must not rely on one shared
baseline for multiple MCP surfaces.

PC runtime observations are keyed by:

```text
canonical_site_root + surface_id + server_entrypoint + carrier_session_id
```

The `carrier_session_id` distinguishes successive live embodiments of the same
Site surface. Queries that ask "current surface state" may collapse by
`canonical_site_root + surface_id + server_entrypoint` only after selecting the
newest non-stale carrier observation.

### Startup Interpretation

Startup output reports these fields independently:

- `mcp_callable_now`
- `source_freshness`
- `restart_request_state`
- `carrier_lineage_state`
- `task_action_authority`

The startup sequence must refuse these collapses:

- `mcp_callable_now = true` does not imply standby.
- `mcp_callable_now = true` does not clear a Site-owned restart request.
- `restart_request_state = active` in one Site does not create pressure in a different Site.
- `carrier_lineage_state = missing` degrades runtime confidence but does not prove source staleness.
- `task_action_authority = absent` does not mean MCP is unhealthy.

### Acknowledgement Rule

Auto-acknowledgement is not interpretive silence. It is a mutation with
evidence.

An auto-ack path must perform one of these actions:

- refresh the Site-owned per-surface baseline from live process and source
  evidence; or
- reconcile a Site-owned restart request using post-request boot evidence and
  carrier lineage.

If neither mutation is performed, startup may report that evidence appears to
contradict stale pressure, but it must not claim the pressure is cleared.

### Sheaf Interpretation

MCP freshness is best treated as a sheaf over Site/runtime loci, not as a
global registry table.

The base loci are:

- Target Site;
- PC/User runtime locus;
- carrier session;
- MCP surface;
- startup observation.

Each locus has local sections:

| Locus | Local section |
| --- | --- |
| Target Site | Source freshness, restart request, per-surface baseline. |
| PC/User runtime locus | Process id, boot time, callable protocol observation. |
| Carrier session | Inherited carrier identity and launch evidence. |
| MCP surface | Declared surface id, server entrypoint, tool surface. |
| Startup observation | Readiness packet assembled for one agent/session. |

Restriction maps narrow broader observations to the local authority that can
interpret them:

- PC runtime registry restricts to one `canonical_site_root + surface_id + server_entrypoint`.
- Site freshness restricts to one per-surface marker.
- Startup readiness restricts to one carrier session and one target Site.

Gluing is permitted only when restricted sections agree on the shared surface
identity. A startup packet is therefore a glued view, not a new authority. If
sections do not agree, the correct result is an explicit residual or blocker,
not a guessed global truth.

The anti-global rule:

```text
There is no default global section named "MCP is ready".
```

A readiness claim is valid only over the locus for which the local sections
were actually glued. This is why a restart marker from one Site cannot become
restart pressure in another Site merely because both expose a
`task-lifecycle-mcp.local` surface.

## Current Launcher-Known Site Posture

The current audit writes evidence to:

```text
.ai/tmp/site-fabric-audit.json
.ai/tmp/carrier-conformance-matrix.json
```

Current expected posture:

- User Site has authoritative registry posture and strict validation passes.
- Revolution, Staccato, Utz, Timour Marketing Agent, Sonar, Smart Scheduling, and Thoughts have conservative generated registries sourced from their own `.ai/mcp` fabric.
- No launcher-known Site should have stale generated client-config surfaces.
- Codex launch defaults should have `EnableNativeShell = $false`.
- Launch-time MCP injection scope is governed by [MCP Injection Loci](./mcp-injection-loci.md); `McpScope=local-site` must prevent User Site or host MCP bleed into carriers that otherwise inherit ambient MCP config.

## Closure Condition

This layer is coherent when:

- every launcher-known Site has an audit record;
- every authoritative registry passes strict validation;
- every Site without authoritative registry metadata is explicitly reported as `no_registry_claim`;
- every admitted carrier has a conformance row with an evidence level;
- no carrier is described as stronger than its evidence level supports.
