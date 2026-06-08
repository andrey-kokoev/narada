# Cloudflare Task Lifecycle Source-State Write Cutover Target

This target names the next task lifecycle authority slice after projection writes.

The slice is not a request to run SQLite on Cloudflare. SQLite is the Windows local source-state substrate. The Cloudflare target is `task_source_state_write`: canonical source-state authority for task lifecycle rows that already live in the Cloudflare task lifecycle D1 substrate.

## Admission Contract

`task_lifecycle.source_state_write.admit` may be admitted only for an existing Cloudflare task lifecycle row when the request carries:

- `cloudflare_task_source_state_write_cutover = true`
- `task_id`
- `source_state_authority_ref`
- `source_state_schema_ref`
- `source_state_evidence_ref`
- `cutover_point_ref`
- `governed_write_contract_ref`
- `confirmation_evidence_ref`

The classifier returns:

- `mutation_class = task_source_state_write`
- `authority_locus = cloudflare_carrier_site`
- `mutation_authority = cloudflare_task_lifecycle_d1`
- `cloudflare_write_admission = admitted`
- `write_effect = task_lifecycle_source_state_write`
- `source_state_write_admission = admitted`
- `windows_sqlite_source_write_admission = not_admitted`

## Boundary

This cutover only moves canonical source-state authority for Cloudflare task lifecycle rows. It does not move:

- Windows-originated task assignment
- Windows roster or role resolution
- mailbox behavior
- filesystem mutation
- repository publication
- local resident mechanics

Those remain Windows-owned or refused until their own cutover contracts and confirmation evidence exist.

## Evidence

A successful source-state write appends a `narada.sonar.cloudflare_task_lifecycle_source_state_write.v1` record to the Cloudflare task lifecycle row. The record names previous Windows SQLite source authority, canonical Cloudflare D1 source authority, cutover refs, governed write contract, confirmation evidence, and the effects still not admitted.
