# Cloudflare Task Lifecycle Assignment Write Cutover Target

This target names the task lifecycle authority slice after source-state writes.

The slice is `task_assignment_write`: assignment authority for task lifecycle rows that already live in the Cloudflare task lifecycle D1 substrate. It is not roster mutation, role resolution, mailbox delivery, filesystem mutation, or repository publication.

## Admission Contract

`task_lifecycle.assignment_write.admit` may be admitted only for an existing Cloudflare task lifecycle row when the request carries:

- `cloudflare_task_assignment_write_cutover = true`
- `task_id`
- assignee identity, such as `assignee_agent_id`
- `assignment_authority_ref`
- `assignment_schema_ref`
- `assignment_evidence_ref`
- `cutover_point_ref`
- `governed_write_contract_ref`
- `confirmation_evidence_ref`

The classifier returns:

- `mutation_class = task_assignment_write`
- `authority_locus = cloudflare_carrier_site`
- `mutation_authority = cloudflare_task_lifecycle_d1`
- `cloudflare_write_admission = admitted`
- `write_effect = task_lifecycle_assignment_write`
- `assignment_write_admission = admitted`
- `assignment_write_schema = narada.sonar.cloudflare_task_lifecycle_assignment_write.v1`

## Boundary

This cutover only moves assignment authority for Cloudflare task lifecycle rows. It does not move:

- roster mutation
- role resolution
- mailbox mutation
- filesystem mutation
- repository publication
- local resident mechanics

Those remain Windows-owned or refused until their own cutover contracts and confirmation evidence exist.

## Evidence

A successful assignment write appends a `narada.sonar.cloudflare_task_lifecycle_assignment_write.v1` record to the Cloudflare task lifecycle row. The record names assignee identity, assignment authority, schema, evidence refs, cutover refs, governed write contract, confirmation evidence, and the effects still not admitted.
