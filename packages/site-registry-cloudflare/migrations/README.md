# Hosted Site Registry D1 Schema

`0001_site_event_projection.sql` creates the local Cloudflare D1 projection
schema for the hosted registry Worker.

`0002_site_registry_relation_lifecycle.sql` creates the hosted registry relation
lifecycle schema.

Tables:

- `site_registry_event_audit`: bounded Site event receipt audit metadata.
- `site_registry_remote_messages`: hosted remote message candidate state,
  including source/idempotency uniqueness and retry count.
- `site_registry_remote_message_events`: message lifecycle event metadata for
  submit, duplicate, and finalize transitions.
- `site_registry_relations`: current registry relation state keyed by
  `relation_id` and unique `(registry_id, site_id, relation_kind)`.
- `site_registry_relation_events`: idempotent relation transition ledger with
  replayable `event_json`.

KV remains the latest projection store for event records, idempotency records,
per-Site event lists, and current read models. D1 rows are not Site authority and
do not admit canonical inbox or task lifecycle state.

Relation lifecycle current state belongs in D1. JSON transition payloads are
stored as replayable evidence in D1 rows. KV is not relation lifecycle authority.
