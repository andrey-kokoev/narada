# Site Telemetry Publication

Site Telemetry Publication is the Narada shape for bounded signals, state
summaries, and candidate messages moving between Sites through a hosted or local
projection surface.

It is the generic structure behind the Staccato published surface pattern and
the first Cloudflare hosted Site Registry slice. SiteRegistry is one read model
inside this shape, not the whole structure.

## Rule

```text
A Site may publish bounded telemetry.
A surface may receive and project it.
Only the owning authority admits consequences.
```

Publication is not replication. Arrival is not admission. Projection is not Site
truth. A hosted Worker, D1 database, KV namespace, dashboard, route, or domain
name is a realization/interface unless an explicit authority object says
otherwise.

## Components

| Component | Meaning | Authority posture |
| --- | --- | --- |
| Publisher Site | Site that emits bounded telemetry events. | Owns the truth it summarizes and the decision to publish. |
| Owning Site | Site that owns the publication surface policy, accepted publishers, event families, and candidate-message handling. | Owns admission policy for the surface, not the publishers' Site truth. |
| Telemetry event contract | Typed event family, payload bounds, provenance, idempotency, freshness, and authority limits. | Contract over a crossing artifact. It does not make payload truth canonical for the receiver. |
| Publication edge | Declared relationship that a publisher may send event families to a surface. | Influence/capability edge; not mutation authority. |
| Telemetry surface | Hosted or local receiver/API/UI that accepts, stores, and renders bounded projections. | Interface/realization. Not the Site itself. |
| Projection store | KV, SQLite, D1, files, or another read-model substrate for latest summaries. | Projection/candidate substrate. Not authority record by default. |
| SiteRegistry read model | Projection over known Sites, relations, freshness, health, endpoints, and capabilities. | Registry projection unless a separate SiteRegistry authority object is declared. |
| Remote candidate exchange | Hosted message submit/list/detail/finalize/receipt flow. | Candidate state until the local receiving Site admits, rejects, or errors. |
| Local publisher | Site-side tool that constructs and sends bounded telemetry events. | Executes under publisher Site authority and secret/capability policy. |
| Local puller | Site-side tool that fetches hosted candidates and routes them through local admission before finalization. | Local receiving Site owns inbox/task/knowledge admission. |
| Readiness/operations | Deploy, migration, smoke, rollback, monitoring, rotation, ownership, and evidence handling. | Operational readiness; not semantic authority. |

## Authority Boundaries

| Crossing | Durable artifact | What it can do | What it cannot do |
| --- | --- | --- | --- |
| Publish telemetry | Site telemetry event | Carry bounded current-state evidence to a surface. | Mutate the receiving Site, import raw DB/logs, or grant capability. |
| Receive telemetry | Receiver decision / audit row | Accept or refuse a projection event under the surface contract. | Certify the publisher's Site truth globally. |
| Project state | Latest read model | Answer bounded current-state/freshness questions. | Replace authority records, lineage, task lifecycle, or canonical inbox. |
| Submit remote message | Remote pending message and cloud receipt | Preserve a candidate addressed to a Site. | Admit a local inbox envelope by itself. |
| Pull message | Local admission plan / envelope candidate | Present the candidate to the target Site's admission boundary. | Treat cloud receipt as local admission. |
| Finalize message | Finalized receipt with local admission/rejection/error reference | Report what local authority did. | Create that local admission retroactively. |
| Deploy surface | Worker version, D1/KV bindings, route evidence | Materialize an interface. | Make the interface the Site authority. |

## Relationship To SiteRegistry

SiteRegistry should be treated as one chapter within Site Telemetry Publication.

SiteRegistry answers questions like:

- Which Sites are known to this registry or awareness locus?
- What relation does each Site have to the owning Site?
- What telemetry endpoints and inbox endpoints are known?
- What freshness/health/capability posture is currently projected?

Those answers are read models unless a separate SiteRegistry authority substrate
is explicitly admitted. A URL named `site-registry.*` should therefore name the
surface/read-model purpose, not imply that Cloudflare owns Site authority.

## Relationship To User Site Awareness

The User Site awareness registry can own or consume a Site Telemetry Publication
surface for coordination across many Sites. That does not make the User Site the
mutation authority for project, PC, client, data, ELT, or Narada proper Sites.

Correct shape:

```text
publisher Sites -> telemetry publication edge -> User Site owned telemetry surface
surface -> SiteRegistry/read projections
surface -> remote candidate exchange
receiving Sites -> local pull/admit/finalize
```

The owning Site must be explicit. For personal multi-Site awareness, the likely
owner is a User Site such as `narada-andrey`. For a project-only surface, the
owner may be that project Site. The domain name should follow the surface role
and ownership decision rather than smearing both.

## Relationship To Existing Doctrine

- Site factorization: the telemetry surface is an interface/projection/realization,
  not the Site authority object.
- Governed locus federation: Sites federate awareness while preserving singular
  mutation authority.
- Site pub/sub: telemetry publication is a typed signal exchange family; arrival
  remains inert until admission.
- User Site awareness registry: awareness can list and coordinate Sites without
  owning them.
- Site state projections: telemetry projections must expose freshness and source
  evidence and must not hide stale/runtime-only assumptions.
- Canonical inbox: remote messages become local consequences only through the
  receiving Site admission boundary.

## Chapter Map

The Site Telemetry Publication uber-chapter should decompose into these earned
subchapters:

1. **Telemetry Event Contract**: event families, bounds, provenance, authority
   limits, idempotency, and raw-value exclusions.
2. **Publication Edge And Capability Policy**: publisher/surface/owner relation,
   accepted event families, capability refs, and secret posture.
3. **Telemetry Surface Realizations**: Cloudflare Worker first, later local or
   other hosted realizations.
4. **SiteRegistry Read Model**: known Sites, relation posture, endpoints,
   freshness, health, capabilities, and provenance.
5. **Remote Candidate Exchange**: generic remote candidate contract, submit,
   pending, detail, receipt, finalize, ledger, and local-admission-reference
   semantics. See [`remote-candidate-exchange.v0.md`](remote-candidate-exchange.v0.md).
6. **Local Publisher And Puller Tools**: Site-side emit and admit/finalize loops.
7. **Readiness And Operations**: deploy gates, migration evidence, smoke proof,
   rollback, monitoring, rotation, and operational ownership.
8. **Inquiry/Doctrine Feedback**: branch pressure and concept lifecycle notes
   generated when telemetry naming exposes missing ontology.

## First Slice Assessment

The completed Cloudflare hosted Site Registry work is an implementation slice of
this uber-chapter:

- implemented: Cloudflare realization, event receiver, projection reads,
  SiteRegistry read model seed, remote candidate exchange, local client helpers,
  non-live smoke, deployment runbook;
- not yet resolved: owning Site, formal publication-edge registry, first-class
  SiteRegistry authority substrate, User Site awareness integration, live
  Cloudflare deployment evidence, monitoring ownership, and Inquiry Space
  import of the branch pressure.

Verdict for that slice remains: smoke-ready, not live-deployed.

## Residuals

- Decide the owning Site for the first hosted Site Telemetry Publication surface.
- Decide whether the first public domain should be user-owned, project-owned, or
  neutral surface-owned.
- Specify `SiteRegistry` as read model first, then decide if/when it needs a
  separate authority substrate.
- Define the publication-edge config shape and capability resolver posture.
- Lift the current Cloudflare package names/docs from "Site Registry" toward
  "Site Telemetry Publication" where appropriate.
- Route the Site Telemetry Publication branch into Inquiry Space once machinery
  exists.
