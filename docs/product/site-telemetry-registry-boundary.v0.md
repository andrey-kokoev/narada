# Site Telemetry And Registry Boundary v0

This artifact separates four concerns currently embodied near the hosted
Cloudflare Site Registry package. Shared code, one Worker, one domain, or one
UI must not collapse these concerns into one authority surface.

## Concern Map

| Concern | Owner | Authority boundary | Accepted inputs | Protected writes | Read UI | Write UI | CLI / MCP family |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Site Operational Telemetry | Publishing Site and declared telemetry surface owner | A bounded event is a projection artifact, not publisher Site truth. | `site_telemetry_event_contract.v0`, publication edges, scheduler/run evidence | Telemetry event store, freshness projection, publish run evidence | Site dashboard rows, freshness/status panels | Publish/pull tools after capability and credential posture pass | `site-telemetry *`, future telemetry MCP publish/pull/doctor |
| Site Registry | Registry owner / awareness locus | Relation lifecycle is registry projection policy, not represented Site authority. | Relation transition events, local relation-admission evidence, owner policy, public projection inputs | Registry relation current state, relation event ledger, public Site grid membership | Registry tile grid, relation/freshness/read-model APIs | Relation activate/withdraw/suppress/retire commands after capability admission | `site-registry relation *`, future registry relation MCP surface |
| Registry Operational Telemetry | Registry service owner | Operational health of the registry service is about the hosted service, not any represented Site. | Worker health, D1/KV migration evidence, smoke checks, deploy evidence, monitoring observations | Registry service health/freshness/incident rows and deployment evidence | Registry service status/health panel | Deploy/smoke/monitoring operations under deploy/admin capability | `site-registry ops *`, deployment/worker smoke tools |
| Site Communication Candidate Exchange | Communication surface owner plus target Site local admission | Remote preservation or transport delivery is not target local admission. | Message candidates, chat-composed candidates, receipts, target finalization evidence | Communication candidate rows, receipt rows, pending/finalized projections | Per-Site message/chat panels and receipt projections | Message compose/send/finalize after submit/read/finalize capability checks | `site-communication *`, `remote-candidate *`, inbox-message MCP surfaces |

## Non-Collapse Rules

- Package reuse does not create shared authority.
- A Cloudflare Worker name, route, domain, D1 database, or KV namespace is a
  realization coordinate, not the owner of any Site.
- Site telemetry publish capability does not grant Site Registry relation
  activation, withdrawal, suppression, or retirement.
- Site Registry membership does not grant telemetry publish, inbox submission,
  task lifecycle mutation, Site config mutation, or secret access.
- Registry operational health is not represented Site health unless a bounded
  telemetry projection says so.
- Site-scope projected chat can read only the selected published projection and
  can compose or submit only communication candidates through the guarded
  crossing.

## Current Artifact Classification

| Artifact / package / route family | Concern |
| --- | --- |
| `docs/product/site-telemetry-event-contract.v0.md` | Site Operational Telemetry |
| `docs/product/site-telemetry-publication-edge.v0.md` | Site Operational Telemetry |
| `docs/product/site-telemetry-local-tools.v0.md` | Site Operational Telemetry |
| `docs/product/site-telemetry-scheduler-posture.v0.md` | Site Operational Telemetry |
| `docs/product/site-telemetry-readiness.v0.md` | Site Operational Telemetry and Registry Operational Telemetry, depending on subject |
| `docs/product/site-registry-relation-lifecycle.v0.md` | Site Registry |
| `docs/product/site-registry-relation-capability-verifier.v0.md` | Site Registry |
| `docs/product/site-registry-purge-posture.v0.md` | Site Registry |
| `packages/site-registry-cloudflare` public tile/read APIs | Site Registry read model plus realization UI |
| `packages/site-registry-cloudflare` `/health`, migrations, smoke fixtures | Registry Operational Telemetry |
| `packages/site-registry-cloudflare` message routes and `site-scope-chat` | Site Communication Candidate Exchange |
| `packages/site-operational-dashboard` Site Registry projection rows | Read projection consumer; not registry authority |
| `docs/product/site-communication-surface.v0.md` | Site Communication Candidate Exchange |
| `docs/product/remote-candidate-exchange.v0.md` | Site Communication Candidate Exchange generic crossing |

## narada-andrey Gap Classification

The narada-andrey case exposed a missing Site Registry relation publication
surface.

Observed state:

- narada-andrey locally admitted the registry relation in principle;
- Narada proper directly delivered the original request envelope and recorded
  route/addressability evidence;
- no hosted registry relation publication command or MCP surface exists for
  turning target/local relation evidence into a hosted registry relation
  transition;
- no reusable cross-Site inbox submission capability exists.

Therefore the correct missing command family is:

```text
site-registry relation publish/activate/withdraw/suppress/retire
```

It is not:

```text
site-telemetry publish
```

and not:

```text
site-communication send
```

Site telemetry publication may later carry freshness or health projections for
narada-andrey. Site communication may carry future messages to narada-andrey.
Neither is the authority surface for admitting or publishing a Site Registry
relation.

## Immediate Follow-Up

The next executable shape should specify a dry-run Site Registry relation
publication planner. It should accept local relation evidence, hosted registry
coordinates, relation kind, desired state/visibility, capability reference, and
idempotency key, then produce a transition preview without network mutation.

Live hosted publication remains a separate guarded capability crossing.
