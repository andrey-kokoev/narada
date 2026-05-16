# Hosted Site Registry D1 Schema

`0001_site_event_projection.sql` creates the local Cloudflare D1 projection
schema for the hosted registry Worker.

Tables:

- `site_registry_event_audit`: bounded Site event receipt audit metadata.
- `site_registry_remote_messages`: hosted remote message candidate state,
  including source/idempotency uniqueness and retry count.
- `site_registry_remote_message_events`: message lifecycle event metadata for
  submit, duplicate, and finalize transitions.

KV remains the latest projection store for event records, idempotency records,
per-Site event lists, and current read models. D1 rows are not Site authority and
do not admit canonical inbox or task lifecycle state.
