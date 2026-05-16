# Site Telemetry Publication Edge v0

`site_telemetry_publication_edge.v0` is the durable configuration record that
declares a publisher Site may send selected telemetry event families to a
specific telemetry surface owned by an owning Site.

The edge is an influence and capability relation. It is not mutation authority,
does not admit receiver-side consequences, and does not contain raw secret
values.

## Schema

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | `narada.site_telemetry.publication_edge.v0`. |
| `edge_id` | yes | Stable identity for this publisher/surface relation. |
| `publisher_site_id` | yes | Site that owns the decision to publish bounded telemetry. |
| `owning_site_id` | yes | Site that owns the telemetry surface policy. |
| `surface_id` | yes | Stable telemetry surface coordinate. |
| `surface_endpoint` | yes | HTTPS or local endpoint coordinate for publish transport. |
| `accepted_event_families` | yes | Event families this edge may publish. Empty means invalid. |
| `capability_refs.publish` | yes | Capability reference used for publish transport. This is never a token or secret value. |
| `capability_refs.read` | no | Optional read capability reference for projection reads. |
| `capability_refs.message_submit` | no | Optional remote candidate submit capability reference. |
| `capability_refs.poll` | no | Optional remote candidate poll capability reference. |
| `capability_refs.finalize` | no | Optional remote candidate finalize capability reference. |
| `capability_refs.admin` | no | Optional administration capability reference. |
| `secret_resolver_policy` | yes | Names the resolver family and explicitly forbids storing raw values in the edge record. |
| `trust_posture` | yes | Trust state for publisher/surface relation. |
| `revocation_posture` | yes | Current revocation state and evidence. |
| `rotation_posture` | yes | Credential reference freshness, rotation owner, and next rotation expectation. |
| `lifecycle_state` | yes | Edge lifecycle state. |
| `preflight_requirements` | yes | Local checks required before publish. |
| `authority_limits` | yes | Non-empty list of things the edge cannot do. |
| `evidence_refs` | yes | Bounded evidence references for the declaration. |

## Lifecycle States

| State | Meaning |
| --- | --- |
| `draft` | Proposed edge; not publishable. |
| `configured` | Required config is present, but preflight has not proven it. |
| `preflight_passed` | Local preflight passed for current config and capability references. |
| `active` | Edge is allowed for publish attempts. Runtime still checks capability on each send. |
| `blocked` | Edge cannot publish until a named blocker clears. |
| `revoked` | Edge is no longer allowed to publish. |
| `rotating` | Credential reference rotation is in progress. |
| `stale` | Edge evidence or credential reference is too old for publish. |

## Preflight Checks

Local preflight must report:

- endpoint is present and parseable;
- endpoint surface identity matches `surface_id` when a surface descriptor is
  available;
- `accepted_event_families` is non-empty and contains only declared event
  families;
- publish capability reference is present;
- resolver policy names a resolver without exposing raw secret values;
- credential reference is present, not stale, and not revoked;
- publisher Site and owning Site are explicit and different roles are not
  collapsed;
- authority limits are non-empty and deny mutation/admission/capability grants;
- optional read/message/poll/finalize/admin capabilities are treated as separate
  references, not inferred from publish.

## Failure States

| Failure | Meaning |
| --- | --- |
| `publication_edge_endpoint_missing` | `surface_endpoint` is absent. |
| `publication_edge_endpoint_invalid` | Endpoint cannot be parsed or uses an unsupported scheme. |
| `publication_edge_surface_mismatch` | Endpoint or surface descriptor does not match `surface_id`. |
| `publication_edge_event_family_missing` | No accepted event families are declared. |
| `publication_edge_event_family_unsupported` | A family is outside the telemetry event contract. |
| `publication_edge_publish_capability_missing` | Publish capability reference is absent. |
| `publication_edge_raw_secret_value_present` | Edge record includes a raw token, password, API key, or secret value. |
| `publication_edge_credential_ref_stale` | Credential reference freshness is older than policy allows. |
| `publication_edge_credential_ref_revoked` | Credential reference or edge was revoked. |
| `publication_edge_authority_limits_missing` | Edge lacks explicit non-authority limits. |

## Fixtures

The normative examples are:

- `docs/product/fixtures/site-telemetry-publication-edge/publication-edge.valid.json`
- `docs/product/fixtures/site-telemetry-publication-edge/publication-edge-preflight.pass.json`
- `docs/product/fixtures/site-telemetry-publication-edge/publication-edge-preflight.failures.json`

## Residual Implementation Tasks

- Add package-level Publication Edge types, reader, and validator.
- Add local config projection for Site-owned edge declarations.
- Implement preflight without network publish by default.
- Wire local publisher helpers to require an active edge before preparing
  outbound telemetry.
- Add stale/revoked credential reference checks through the capability/consent
  registry without materializing raw secrets.
- Preserve separate capability references for publish, read, message submit,
  poll, finalize, and admin.
