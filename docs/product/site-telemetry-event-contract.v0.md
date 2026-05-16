# Site Telemetry Event Contract v0

`site_telemetry_event_contract.v0` specifies the bounded crossing artifact a
publisher Site may emit to a Site Telemetry Publication surface. It is a
contract for publication and projection input, not an authority record for the
publisher or receiver.

This document is specification-only. Runtime package adoption belongs to the
follow-on package and receiver integration tasks.

## Canonical Schema

The canonical event object has these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | Contract identifier. Current compatibility value is `narada.site_event.envelope.v0`; future package work may add `narada.site_telemetry.event.v0` as an alias or successor only with explicit migration handling. |
| `event_id` | yes | Stable event identity within the publishing Site's telemetry stream. |
| `idempotency_key` | yes | Retry-stable key. Re-sending the same bounded observation must keep the same key. |
| `source_site_id` | yes | Site that emits the event and owns the truth being summarized. |
| `subject_site_id` | no | Site the event is about when different from the source. |
| `target_site_id` | no | Intended receiving/admitting Site when the event addresses a target. |
| `publication_edge_id` | future | Publication Edge that authorizes this event family for this surface. Specified now, not required by current runtime envelopes. |
| `surface_id` | future | Telemetry surface or receiver coordinate. Specified now, not required by current runtime envelopes. |
| `family` | yes | Event family such as `site_health`, `site_inbox`, `agent_session`, `task_work`, `attention`, `report`, or `site_registry`. |
| `type` | yes | Narrow event type inside the family, versioned by the publisher or package contract. |
| `observed_at` | yes | Time the publisher observed the summarized state. |
| `sent_at` | yes | Time the publisher prepared or sent the event. |
| `freshness` | future | Optional explicit freshness posture. Current receivers may compute freshness from `observed_at` and receiver time. |
| `auth.kind` | yes | Authentication posture: `bearer_capability_ref`, `signed_envelope`, or `none`. |
| `auth.capability_ref` | conditional | Capability reference, not a raw secret. Required when the receiver requires an authenticated bearer capability reference. |
| `auth.authenticated` | yes | Receiver-side authentication result or publisher-side pre-auth posture, depending on lifecycle stage. |
| `payload_bounds.max_bytes` | yes | Maximum serialized payload summary size admitted by the event producer. |
| `payload_bounds.raw_values_excluded` | yes | Must be `true`. Raw logs, raw DB rows, raw task lifecycle dumps, raw mailbox bodies, and raw secrets are excluded. |
| `payload_summary` | yes | Bounded structured summary. It may contain counts, statuses, small labels, and stable references, but not raw source data. |
| `authority_limits` | yes | Non-empty list stating what the event cannot do. |
| `evidence_refs` | future | Stable references to bounded proof, source trace, or verification artifacts. Specified now, not required by current runtime envelopes. |
| `provenance` | future | Optional structured provenance block for source command, runtime, or projection lineage. Specified now, not required by current runtime envelopes. |

The compatibility baseline is the existing `SiteEventEnvelope` TypeScript
shape in `@narada2/site-config`. Current runtime envelopes already cover
identity, source/subject/target Site coordinates, family/type, timestamps,
auth posture, payload bounds, payload summary, and authority limits.

Future fields are deliberately marked `future`. They must not be inferred by a
receiver from route, token, Cloudflare Worker name, or operator memory. Package
adoption must either add optional fields with validation or define a new schema
with explicit compatibility mapping.

## Event Families

Every family must define its interpretation and non-goals before production use.

| Family | Interpretation | Non-goals |
| --- | --- | --- |
| `site_health` | Current health/readiness summary for a Site or surface. | Does not certify full runtime truth or perform remediation. |
| `site_inbox` | Bounded inbox availability, backlog, or intake posture. | Does not admit, reject, or mutate inbox envelopes. |
| `agent_session` | Bounded carrier/session posture. | Does not bind an operator surface or grant tool authority. |
| `task_work` | Bounded task/work posture. | Does not mutate lifecycle or create review decisions. |
| `attention` | Bounded attention/request summary. | Does not create operator consent or local admission. |
| `report` | Bounded report/proof summary. | Does not replace a governed task report or review. |
| `site_registry` | SiteRegistry read-model contribution. | Does not create Site membership authority or transfer mutation authority. |

## Compatibility Mapping

Existing `SiteEventEnvelope` data maps as follows:

| Existing field | Contract field | Compatibility posture |
| --- | --- | --- |
| `schema` | `schema` | Keep `narada.site_event.envelope.v0` for current runtime. |
| `event_id` | `event_id` | Direct. |
| `idempotency_key` | `idempotency_key` | Direct. |
| `source_site_id` | `source_site_id` | Direct. |
| `subject_site_id` / `target_site_id` | `subject_site_id` / `target_site_id` | Direct when present; subject defaults to target or source only for read-model interpretation, not identity rewriting. |
| `family` | `family` | Direct; future package validation should reject undeclared families. |
| `type` | `type` | Direct. |
| `observed_at` / `sent_at` | `observed_at` / `sent_at` | Direct; freshness may be computed from these timestamps. |
| `auth` | `auth` | Direct; `capability_ref` remains a reference, never a secret value. |
| `payload_bounds` | `payload_bounds` | Direct; `raw_values_excluded` must remain `true`. |
| `payload_summary` | `payload_summary` | Direct if bounded and raw-value-free. |
| `authority_limits` | `authority_limits` | Direct and required non-empty. |
| absent | `publication_edge_id`, `surface_id`, `freshness`, `evidence_refs`, `provenance` | Specified as future fields only; receivers must not silently widen old envelopes by inventing them. |

## Fixture Set

The normative examples for this spec are:

- `docs/product/fixtures/site-telemetry-event-contract/site-health.current-envelope.json`
- `docs/product/fixtures/site-telemetry-event-contract/site-health.future-contract.json`
- `docs/product/fixtures/site-telemetry-event-contract/site-event-envelope-compatibility-map.json`

The first fixture is valid current `SiteEventEnvelope`-shaped data. The second
shows the intended future contract shape with publication edge and evidence
coordinates. The mapping fixture records how current data moves into the future
shape without silent semantic widening.

## Residual Implementation Tasks

- Add package-level schema/types and validation helpers for the contract.
- Decide whether the package surface keeps `narada.site_event.envelope.v0` or
  introduces `narada.site_telemetry.event.v0` with explicit migration.
- Extend hosted receiver decisions to record evidence references and
  publication-edge coordinates when the runtime supplies them.
- Add fixture-loading tests for the three contract fixtures.
- Update local publisher helpers to resolve Publication Edge config before
  emitting events.
- Keep raw value exclusion tests active for payload summaries and any future
  provenance fields.
