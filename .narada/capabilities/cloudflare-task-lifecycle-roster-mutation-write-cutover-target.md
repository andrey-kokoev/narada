# Cloudflare Task Lifecycle Roster Mutation Write Cutover Target

This target names the task lifecycle authority slice after role-resolution writes.

The slice is `task_roster_mutation_write`: mutating the Cloudflare roster substrate for the already assigned and role-resolved principal of a Cloudflare task lifecycle row. It is not mailbox delivery, filesystem mutation, repository publication, or general site-membership administration outside the task lifecycle cutover path.

## Admission Contract

`task_lifecycle.roster_mutation_write.admit` may be admitted only for an existing Cloudflare task lifecycle row when the request carries:

- `cloudflare_task_roster_mutation_write_cutover = true`
- `task_id`
- `assignee_principal_id`
- `roster_mutation_authority_ref`
- `roster_schema_ref`
- `roster_evidence_ref`
- `membership_role`
- `membership_status`
- `cutover_point_ref`
- `governed_write_contract_ref`
- `confirmation_evidence_ref`

The classifier returns:

- `mutation_class = task_roster_mutation_write`
- `authority_locus = cloudflare_carrier_site`
- `mutation_authority = cloudflare_task_lifecycle_d1`
- `cloudflare_write_admission = admitted`
- `write_effect = task_lifecycle_roster_mutation_write`
- `roster_mutation_write_admission = admitted`
- `roster_mutation_write_schema = narada.sonar.cloudflare_task_lifecycle_roster_mutation_write.v1`
- `roster_mailbox_mutation_admission = not_admitted`
- `roster_filesystem_mutation_admission = not_admitted`
- `roster_repository_publication_admission = not_admitted`

## Boundary

This cutover only moves roster mutation authority for Cloudflare task lifecycle rows. It upserts the assigned principal's Cloudflare site membership row and records the mutation on the task lifecycle row. It does not move:

- mailbox mutation
- filesystem mutation
- repository publication
- local resident mechanics

Those remain Windows-owned or refused until their own cutover contracts and confirmation evidence exist.

## Evidence

A successful roster mutation write appends a `narada.sonar.cloudflare_task_lifecycle_roster_mutation_write.v1` record to the Cloudflare task lifecycle row. The record names assignee principal identity, previous and resulting membership role/status, roster mutation authority, schema, evidence refs, cutover refs, governed write contract, confirmation evidence, and the effects still not admitted.
