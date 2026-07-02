# Narada Runtime Projection Graph

## Purpose

The Narada Runtime Projection Graph is the canonical topology for describing how an authority runtime exposes non-canonical projections to local, remote, human, and machine surfaces, and how those surfaces submit intents back to the authority runtime.

This document owns the general graph ontology. Slice-specific documents, such as [`cloudflare-nars-web-projection.md`](cloudflare-nars-web-projection.md), [`nars-runtime-contract.md`](nars-runtime-contract.md), [`nars-session-management.md`](nars-session-management.md), and [`nars-remote-projection-gateway.md`](nars-remote-projection-gateway.md), describe concrete embodiments of this graph.

## Core Shape

The graph has authority nodes, projection nodes, and governed edges:

```text
authority_runtime
  -> projection_edge[]
  -> projection_store[]
  -> projection_surface[]

projection_surface
  -> intent_route[]
  -> authority_runtime
```

A four-slot path is a useful view through the graph:

```text
origin_authority
  -> projection_edge
  -> projection_store
  -> projection_surface
```

It is not the whole ontology. One authority runtime may fan out to many projection stores and surfaces, and one surface may submit intents through one or more explicit routes.

## Terms

| Term | Meaning |
| --- | --- |
| `authority_runtime` | Canonical owner of runtime/session state, event identity, mutation admission, lifecycle, health, and recovery semantics. |
| `projection_edge` | Governed replication, selection, transformation, redaction, or fanout path from an authority runtime to a projection store. |
| `projection_store` | Non-canonical materialized state for replay, query, cache, fanout, diagnostics, or remote observation. |
| `projection_surface` | Human or machine interface that reads a projection and may submit intents through admitted routes. |
| `intent_route` | Governed path by which a surface-originated intent reaches an authority runtime for admission or refusal. |

Anything named `projection_*` is non-canonical unless it explicitly also occupies an authority role. Projection stores may be durable, indexed, cached, replicated, or served over public infrastructure; those operational qualities do not make them canonical.

## Authority Invariants

1. An authority runtime mints canonical event identity and owns mutation admission.
2. A projection edge may copy, filter, summarize, redact, transform, and attest, but it does not become authority over the copied state.
3. A projection store is allowed to be useful and durable, but disagreement between an authority runtime and its projection resolves in favor of the authority runtime unless a separate governed authority transfer occurs. For NARS sessions, that transfer is modeled as a [`NARS Authority Runtime Host Transition`](nars-authority-runtime-host-transition.md).
4. A projection surface does not become an admission authority by rendering state or collecting input.
5. Intent routes are not reverse projections. They are explicit admission paths into an authority runtime.
6. Transport choices such as JSONL, HTTP, WebSocket, SSE, Worker, Durable Object, tunnel, file, or cache are implementation details unless they change authority or admission semantics.

## Runtime Fanout

A runtime can fan out to multiple projection stores and surfaces:

```text
local NARS authority_runtime
  -> local event/session projection_store      -> agent-cli projection_surface
  -> local browser projection_store            -> agent-web-ui projection_surface
  -> Cloudflare projection_store               -> Cloudflare agent-web-ui projection_surface
  -> diagnostics projection_store              -> health/status surfaces
  -> artifact projection_store                 -> artifact renderers
```

The graph form prevents the local-to-Cloudflare path from being mistaken for the general model.

## Operator Projection Open Requests

An `OperatorProjectionOpenRequest` is the governed request to make one projection visible to the operator through a host UI such as the default browser, artifact viewer, dashboard, file viewer, or auth-flow surface.

It is not a projection store and not an authority runtime. It is the handoff request from a domain command or projection surface to an operator-visible projection executor. The target URL, artifact, dashboard, or file is a projection target; the browser or host app is only the presentation carrier for that target.

In graph terms:

```text
domain command or projection_surface
  -> OperatorProjectionOpenRequest
  -> admitted browser/file/dashboard executor
  -> projection_surface visible to operator
```

The request does not move authority into the browser. For example, opening `agent-web-ui` makes a NARS projection visible; it does not make the browser the NARS authority runtime. Browser input still returns through an explicit `intent_route` and must be admitted by the authority runtime.

Process-launch posture owns the host-effect mechanics and request outcomes. See [`Process Launch Posture Target`](../architecture/process-launch-posture.md#operator-projection-open-request).

## Local-Origin Cloudflare Projection Instance

The current Cloudflare NARS Web Projection is one graph instance:

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

In this instance, Cloudflare is a remote projection host for a local NARS session. It is not a second NARS authority for that session.

The existing `projection_id` is the stable joining identifier for the projection instance. It can be represented as a projection edge or projection instance id in graph records. The split registry remains valid: local Narada/NARS owns projection intent, and Cloudflare owns remote access state and issued credentials.

## Reflected Cloudflare-Origin Instance

The reflected topology is also expressible without changing the vocabulary:

```text
Cloudflare hosted NARS authority_runtime
  -> cloudflare-to-local projection_edge
  -> local projection_store
  -> local projection_surface
```

The initial Cloudflare-origin authority runtime target is a Cloudflare-hosted session/event authority with execution delegated elsewhere. It must satisfy the abstract authority-runtime contract before local projections can treat it as an origin.

## Graph Record Schema Target

The initial target schema is documentation-first. It does not require immediate runtime behavior or storage changes.

```text
narada.runtime_projection_graph.v1
```

Minimum graph record:

```json
{
  "schema": "narada.runtime_projection_graph.v1",
  "graph_id": "rpg_...",
  "generated_at": "2026-07-01T00:00:00.000Z",
  "authority_runtimes": [
    {
      "authority_runtime_id": "auth_local_nars_...",
      "kind": "nars",
      "location": { "kind": "local", "site_root": "D:/code/narada.sonar" },
      "authority_role": "canonical_session_runtime",
      "session_id": "carrier_...",
      "agent_id": "resident",
      "endpoint_refs": { "events": "ws://127.0.0.1:12345/events", "health": "http://127.0.0.1:12346/health" },
      "health_ref": "session.health",
      "lifecycle_state": "active"
    }
  ],
  "projection_edges": [
    {
      "projection_edge_id": "proj_...",
      "origin_authority_runtime_id": "auth_local_nars_...",
      "target_projection_store_id": "store_cloudflare_...",
      "kind": "local_to_cloudflare_nars_projection",
      "policy_refs": {
        "events": "operations",
        "artifacts": "selected_kinds",
        "health": "summary"
      },
      "credential_refs": { "bridge": "secret_ref:..." },
      "cursor": { "last_replicated_sequence": 120 },
      "lifecycle_state": "active"
    }
  ],
  "projection_stores": [
    {
      "projection_store_id": "store_cloudflare_...",
      "kind": "cloudflare_projection_store",
      "location": { "kind": "cloudflare", "worker_url": "https://projection.example.test" },
      "authority_posture": "non_canonical_projection",
      "freshness_ref": "projection.status"
    }
  ],
  "projection_surfaces": [
    {
      "projection_surface_id": "surface_cloudflare_agent_web_ui_...",
      "kind": "agent-web-ui",
      "location": { "kind": "cloudflare" },
      "reads_from_projection_store_id": "store_cloudflare_..."
    }
  ],
  "intent_routes": [
    {
      "intent_route_id": "intent_cloudflare_to_local_nars_...",
      "origin_projection_surface_id": "surface_cloudflare_agent_web_ui_...",
      "target_authority_runtime_id": "auth_local_nars_...",
      "admitted_methods": ["conversation.send", "conversation.enqueue"],
      "credential_refs": { "browser": "token_fingerprint:..." },
      "acknowledgement_authority": "target_authority_runtime"
    }
  ],
  "provenance": {
    "created_by": "operator_or_system",
    "created_at": "2026-07-01T00:00:00.000Z"
  }
}
```

Records should carry identity, location, implementation kind, authority role, endpoint refs, credential refs, policy refs, health/freshness refs, provenance, and lifecycle state. Schema consumers must not infer canonical authority from durability, public reachability, or cache freshness.

## Operational Sequence

The operational sequence is documented in [`narada-runtime-projection-graph-operational-plan.md`](narada-runtime-projection-graph-operational-plan.md). In short:

1. Canonicalize this graph concept.
2. Link slice docs to this concept.
3. Define the graph record schema target.
4. Map the current Cloudflare projection instance into graph terms.
5. Make the local-origin Cloudflare path operational.
6. Add operator CLI and runbook UX.
7. Add graph health and observability.
8. Implement Cloudflare-origin authority runtime later.

## Non-Goals

- Do not make Cloudflare projection stores canonical for local NARS sessions.
- Do not make `agent-web-ui` an admission authority.
- Do not collapse projection edges and intent routes into a generic bidirectional tunnel.
- Do not require every current package or command to be renamed before the graph vocabulary is useful.
- Do not implement Cloudflare-origin NARS before the local-origin projection graph is operational.
