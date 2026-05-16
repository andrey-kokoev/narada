# @narada2/site-inbox

Descriptor contracts for Canonical Inbox intake and portable envelope artifacts.

This package models inert envelope admission requests, crossing coordinates, portable artifact plans, and refusal behavior. It does not create or mutate `.ai/inbox.db`, import source Site inbox history, publish Git artifacts, grant task lifecycle authority, or copy secrets, credentials, operator-surface runtime state, PC-locus state, rosters, or checkpoints.

## First Slice

- Build neutral envelope admission requests.
- Decide whether an envelope is admissible as descriptor-only local intake.
- Plan a Git-visible envelope artifact path without writing it.
- Refuse source DB/history imports, runtime state import, empty payloads, missing authority, and unsafe path references.

Receiving Sites own their own inbox substrate, publication policy, task promotion, and local evidence storage.

## Remote Message Exchange

The package also models the Staccato-derived pattern where an external or hosted
surface lets someone leave a message for a Site, and the Site later picks it up.
This is a delivery crossing, not a second inbox authority.

The reusable contract is:

- A remote surface stores a `narada.site_inbox.remote_message.v0` record with
  `pending` status, `target_site_id`, source coordinates, `idempotency_key`,
  kind, subject/body/payload, and a receipt.
- The receiving Site plans local canonical inbox admission with
  `planRemoteSiteInboxLocalAdmission`. The plan is descriptor-only and reports
  `db_mutated: false` and `envelope_written: false`.
- Only the receiving Site's canonical inbox admission can make the message local
  Site evidence. The remote row remains `candidate_only` until then.
- After local admission, rejection, or an admission error, the receiving Site can
  build a finalize payload and receipt with local admission or refusal evidence.

This mirrors the Staccato Cloudflare Worker pattern of submit, poll, local
admission, and finalize, while keeping the Worker or other remote surface outside
Site inbox, task lifecycle, identity, and capability authority.

Remote exchange helpers do not implement HTTP, Cloudflare D1/KV, polling,
SQLite writes, artifact writes, task promotion, or secret handling. Site adapters
own those transports and must consume these contracts without importing raw
remote runtime state as authority.
