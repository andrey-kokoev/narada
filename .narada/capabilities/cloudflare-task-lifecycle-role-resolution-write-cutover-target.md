# Cloudflare Task Lifecycle Role Resolution Write Cutover Target

This target names the task lifecycle authority slice after assignment writes.

The slice is `task_role_resolution_write`: resolving an assigned principal against Cloudflare site membership for task lifecycle rows that already live in the Cloudflare task lifecycle D1 substrate and already have an admitted Cloudflare assignment write. It is not roster mutation, mailbox delivery, filesystem mutation, or repository publication.

## Admission Contract

`task_lifecycle.role_resolution_write.admit` may be admitted only for an existing Cloudflare task lifecycle row when the request carries:

- `cloudflare_task_role_resolution_write_cutover = true`
- `task_id`
- `assignee_principal_id`
- `role_resolution_authority_ref`
- `roster_source_ref`
- `role_resolution_schema_ref`
- `role_resolution_evidence_ref`
- `cutover_point_ref`
- `governed_write_contract_ref`
- `confirmation_evidence_ref`

The classifier returns:

- `mutation_class = task_role_resolution_write`
- `authority_locus = cloudflare_carrier_site`
- `mutation_authority = cloudflare_task_lifecycle_d1`
- `cloudflare_write_admission = admitted`
- `write_effect = task_lifecycle_role_resolution_write`
- `role_resolution_write_admission = admitted`
- `role_resolution_write_schema = narada.sonar.cloudflare_task_lifecycle_role_resolution_write.v1`
- `role_resolution_roster_read_admission = admitted`
- `role_resolution_roster_mutation_admission = not_admitted`

## Boundary

This cutover only moves role-resolution authority for Cloudflare task lifecycle rows. It reads Cloudflare site membership to resolve the assigned principal and role. It does not move:

- roster mutation
- mailbox mutation
- filesystem mutation
- repository publication
- local resident mechanics

Those remain Windows-owned or refused until their own cutover contracts and confirmation evidence exist.

## Evidence

A successful role-resolution write appends a `narada.sonar.cloudflare_task_lifecycle_role_resolution_write.v1` record to the Cloudflare task lifecycle row. The record names assignee principal identity, resolved role, membership status, role-resolution authority, roster source, schema, evidence refs, cutover refs, governed write contract, confirmation evidence, and the effects still not admitted.
