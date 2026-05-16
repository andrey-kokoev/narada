# SiteRegistry Read Model v0

`site_registry_read_model.v0` is a bounded projection over known Sites and their
relationship to an owning Site or awareness locus.

It is a read model first. Registry membership, freshness, endpoint visibility,
or capability summary does not transfer mutation authority. A future
SiteRegistry authority substrate must be separately admitted with its own
lifecycle, mutation rules, and evidence.

## Schema

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | yes | `narada.site_registry.read_model.v0`. |
| `registry_id` | yes | Stable read-model identity. |
| `owning_site_id` | yes | Site or awareness locus that owns this projection. |
| `generated_at` | yes | Time the read model was derived. |
| `sites` | yes | Projected Site entries. |
| `source_event_refs` | yes | Telemetry event ids or evidence refs used for derivation. |
| `authority_limits` | yes | Non-empty read-model authority limits. |
| `future_authority_substrate` | yes | Criteria for any later authority-bearing registry. |

## Site Entry

Each `sites[]` entry includes:

- `site_id`;
- `locus_type`;
- `relation_posture`;
- `authority_boundaries`;
- `advertised_surfaces`;
- `telemetry_endpoints`;
- `inbox_message_endpoints`;
- `pubsub_posture`;
- `freshness`;
- `health`;
- `capabilities_summary`;
- `capability_denials`;
- `provenance`;
- `conflicts`;
- `read_model_authority_limits`.

## Derivation Rules

- `site_health` events update health and freshness posture.
- `site_inbox` events update inbox/message endpoint posture.
- `agent_session` events update current carrier/session availability only as
  projection data.
- `task_work` events update work posture summaries, not lifecycle rows.
- `attention` and `report` events update bounded summaries, not admission.
- `site_registry` events may advertise surfaces, relations, and capabilities,
  but cannot certify ownership or grant capability.
- Stale events remain visible as stale rather than disappearing.
- Conflicting signals are represented under `conflicts[]`; the read model does
  not silently choose a winner unless a deterministic rule and evidence ref are
  recorded.

## Future Authority Substrate Criteria

A SiteRegistry authority substrate is not earned by this read model alone. It
would require:

- a declared owner and mutation authority;
- admitted lifecycle and mutation commands;
- durable evidence for membership changes;
- conflict resolution rules;
- capability grant/revocation rules;
- replay/rebuild rules independent of a hosted projection store;
- review/closure evidence proving why read-model projection is insufficient.

## Fixtures

- `docs/product/fixtures/site-registry-read-model/site-registry-input-events.json`
- `docs/product/fixtures/site-registry-read-model/site-registry.expected.json`

The fixture covers a repo Site and a User Site with multiple telemetry surfaces.
