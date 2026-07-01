# Narada Runtime Projection Graph Operational Plan

## Purpose

This plan defines the sequence from concept agreement to an operational Narada Runtime Projection Graph. It separates the general graph ontology from the current Cloudflare NARS Web Projection slice, then uses the existing local-NARS-to-Cloudflare path as the first operational graph instance.

## Target Shape

The general model is a graph, not a single linear pipe:

```text
authority_runtime
  -> projection_edge[]
  -> projection_store[]
  -> projection_surface[]

intent_route[]
  -> authority_runtime
```

Durable terms:

| Term | Meaning |
| --- | --- |
| `authority_runtime` | Canonical owner of session state, event identity, mutation admission, lifecycle, health, and recovery semantics. |
| `projection_edge` | Governed replication/selection/redaction path from an authority runtime to a projection store. |
| `projection_store` | Non-canonical materialized state for replay, query, cache, fanout, or remote observation. |
| `projection_surface` | Human or machine interface that reads projection state and may submit intents through admitted routes. |
| `intent_route` | Governed path by which a surface-originated intent reaches the authority runtime for admission or refusal. |

Invariant: anything named `projection_*` is non-canonical unless it explicitly also occupies an authority role.

## Current First Instance

The current Cloudflare NARS Web Projection is one instance of the graph:

```text
local NARS authority_runtime
  -> local-to-cloudflare projection_edge
  -> Cloudflare projection_store
  -> Cloudflare agent-web-ui projection_surface

Cloudflare browser intent
  -> Cloudflare intent_route
  -> local projection bridge
  -> local NARS authority_runtime
```

Cloudflare is currently a remote projection host for local NARS, not a second NARS authority for that session.

## Path To Operational

### 1. Canonicalize The Concept

Create `docs/concepts/narada-runtime-projection-graph.md` as the authoritative concept document for the graph ontology.

Acceptance criteria:

- Defines `authority_runtime`, `projection_edge`, `projection_store`, `projection_surface`, and `intent_route`.
- Defines authority/projection invariants.
- States that four-slot paths are views through a graph, not the whole ontology.
- Includes local-origin and Cloudflare-origin examples.

CL: 0.995.

### 2. Patch Existing Docs To Reference The Graph

Update existing docs so each remains slice-specific and stops re-deriving the general topology.

Minimum docs:

- `docs/concepts/cloudflare-nars-web-projection.md`
- `docs/concepts/nars-runtime-contract.md`
- `docs/concepts/nars-session-management.md`
- `docs/concepts/nars-remote-projection-gateway.md`

Acceptance criteria:

- Cloudflare projection doc says it is one graph instance.
- NARS runtime/session docs point to the graph doc for projection topology semantics.
- Remote gateway doc is marked as a narrower gateway slice, not the general graph model.

CL: 0.99.

### 3. Define The Graph Record Schema Target

Document a target schema before implementing persistent storage:

```text
narada.runtime_projection_graph.v1
```

Minimum record shape:

```json
{
  "schema": "narada.runtime_projection_graph.v1",
  "graph_id": "rpg_...",
  "generated_at": "2026-07-01T00:00:00.000Z",
  "authority_runtimes": [],
  "projection_edges": [],
  "projection_stores": [],
  "projection_surfaces": [],
  "intent_routes": []
}
```

Each node/edge should carry identity, location, implementation kind, authority role, endpoint refs, credential refs, policy refs, health refs, provenance, and lifecycle state.

Acceptance criteria:

- Schema expresses graph nodes and edges without baking in local-to-Cloudflare assumptions.
- Current `projection_id` can be represented as a projection edge or projection instance id.
- Split local/Cloudflare registry is represented without forcing one side to own both authorities.

CL: 0.985.

### 4. Map Current Projection Instance To Graph Terms

Treat existing Cloudflare projection instance records as the first operational graph edge embodiment.

Acceptance criteria:

- Existing `projection_id` remains stable and is mapped into graph terminology.
- Existing local intent and Cloudflare access registry split remains valid.
- Artifact projection, event projection, health projection, and input relay are represented as lanes/policies on the projection edge and intent route.

CL: 0.98.

### 5. Make The Local-Origin Cloudflare Path Operational

Finish the current local-NARS-to-Cloudflare path before implementing Cloudflare-origin NARS.

Operational checklist:

1. Build `@narada2/agent-web-ui`.
2. Build/deploy or preview `@narada2/cloudflare-nars-projection` Worker.
3. Register a projection for one live local NARS session.
4. Start the durable local projection bridge.
5. Verify event replay from local NARS to Cloudflare web UI.
6. Verify artifact metadata projection.
7. Verify artifact content projection under policy.
8. Verify downward operator input through `conversation.send` and `conversation.enqueue`.
9. Verify revocation blocks bridge/browser credentials.
10. Run live smoke and save evidence.

Acceptance criteria:

- Operator can open Cloudflare-hosted `agent-web-ui` for a live local NARS session.
- Remote UI shows conversation/events without raw health spam.
- Remote UI can submit admitted operator input and see NARS acknowledgement.
- Revocation and stale credential states are visible and enforced.
- Live smoke evidence is stored under an operator-known evidence path.

CL: 0.99.

### 6. Add Operator CLI And Runbook UX

Operators should not assemble projection graph commands manually.

Target commands, conceptually:

```text
narada projection graph show
narada projection enable cloudflare --site sonar --agent resident
narada projection status <projection-id>
narada projection open <projection-id>
narada projection disable <projection-id>
narada projection smoke <projection-id>
```

Acceptance criteria:

- Commands expose graph state in human-readable and JSON forms.
- Failure messages name the blocked graph component: authority runtime, projection edge, projection store, projection surface, or intent route.
- Commands point to concrete recovery actions for stale auth, unavailable Worker, dead bridge, stale store, or refused intent route.

CL: 0.985.

### 7. Add Graph Health And Observability

Graph health should answer where the projection is blocked.

Minimum health dimensions:

- authority runtime health;
- projection edge connection and last replicated sequence;
- projection store freshness;
- projection surface connection/readiness;
- intent route admission and last acknowledged input;
- credential validity and revocation state.

Acceptance criteria:

- A single graph status view can explain whether the system is usable.
- Health is derived from authoritative sources and projection stores without making the projection store canonical.
- Repeated heartbeat-style noise is summarized rather than flooding conversation views.

CL: 0.985.

### 8. Implement Cloudflare-Origin Authority Runtime Later

Only after the local-origin projection graph is operational, introduce the reflected topology:

```text
Cloudflare hosted NARS authority_runtime
  -> cloudflare-to-local projection_edge
  -> local projection_store
  -> local projection_surface
```

Initial Cloudflare-origin implementation choice:

```text
Cloudflare-hosted session/event authority with execution delegated elsewhere.
```

Acceptance criteria:

- Cloudflare-origin runtime satisfies the abstract `authority_runtime` contract.
- Execution delegation is explicit and does not pretend Cloudflare directly owns capabilities it does not host.
- Local projection of Cloudflare-origin sessions uses the same graph vocabulary as local-origin Cloudflare projection.

CL: 0.98.

## Non-Goals For The First Operational Pass

- Do not implement Cloudflare-origin NARS before the local-origin path is operational.
- Do not rename all existing Cloudflare projection package APIs solely for vocabulary purity.
- Do not make Cloudflare projection store canonical for local NARS sessions.
- Do not make `agent-web-ui` an admission authority.
- Do not collapse projection edges and intent routes into a generic bidirectional tunnel.

## Verification Ladder

1. Documentation review proves the graph terminology is coherent and linked from slice docs.
2. Unit tests prove graph-adjacent schema helpers and projection mapping do not bake in local-to-Cloudflare assumptions.
3. Package tests prove current Cloudflare projection behavior remains intact.
4. Non-live smoke proves registration/preflight/refusal behavior without mutation.
5. Live smoke proves remote event/artifact/input/revocation across one real NARS session.
6. Operator runbook proves a human can recover common failures without reading source code.

## Confidence

Overall CL that this is the correct sequence to operationalize the Narada Runtime Projection Graph: 0.985.
