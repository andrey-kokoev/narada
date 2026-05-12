# @narada2/site-inbox

Descriptor contracts for Canonical Inbox intake and portable envelope artifacts.

This package models inert envelope admission requests, crossing coordinates, portable artifact plans, and refusal behavior. It does not create or mutate `.ai/inbox.db`, import source Site inbox history, publish Git artifacts, grant task lifecycle authority, or copy secrets, credentials, operator-surface runtime state, PC-locus state, rosters, or checkpoints.

## First Slice

- Build neutral envelope admission requests.
- Decide whether an envelope is admissible as descriptor-only local intake.
- Plan a Git-visible envelope artifact path without writing it.
- Refuse source DB/history imports, runtime state import, empty payloads, missing authority, and unsafe path references.

Receiving Sites own their own inbox substrate, publication policy, task promotion, and local evidence storage.
