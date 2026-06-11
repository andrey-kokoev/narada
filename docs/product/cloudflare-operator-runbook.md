# Cloudflare Operator Runbook

This is the first-class operator path for entering the live Cloudflare embodiment of Narada.

It keeps the doctrine boundaries explicit: Cloudflare is a substrate, the service token is an operator credential, Microsoft login is human operator identity, and site-continuity packets are projections/evidence rather than remote mutation authority.

## Command

```powershell
pnpm cloudflare:operator:check
```

The command loads the ignored root `.env` file and expects:

```dotenv
CLOUDFLARE_CARRIER_URL=https://narada-cloudflare-carrier.<account>.workers.dev
CLOUDFLARE_CARRIER_TOKEN_FILE=D:\tmp\narada-cloudflare-carrier-service-token.txt
CLOUDFLARE_CARRIER_SITE_ID=site_narada_cloudflare
CLOUDFLARE_CARRIER_SITE_REF=cloudflare://narada-cloudflare-carrier
CLOUDFLARE_CARRIER_OPERATION_ID=operation_narada_cloudflare_control
```

`site_narada_cloudflare` is the canonical Cloudflare Narada Site identity. Smoke-test Sites such as `site_live_smoke` remain valid for lower-level tests, but the operator runbook defaults to the canonical product Site.

`operation_narada_cloudflare_control` is the canonical Cloudflare control Operation. It is the initial inhabited work locus inside the canonical Site; it is not a substitute for Site identity, provider execution, or membership authority.

The token value stays in the token file and in the deployed Worker secret. The runbook command reports the credential source, not token material.

The service token proves service authority and live substrate readiness. It does not prove that a human operator is logged in. To hard-check the current Microsoft operator session, provide a local cookie file containing either the full `Cookie:` header, the `narada_operator_session=...` pair, or just the raw cookie value:

```powershell
pnpm cloudflare:operator:check -- --operator-cookie-file D:\tmp\narada-cloudflare-operator-cookie.txt --require-operator-session
```

Without `--operator-cookie-file`, the command still verifies that the Microsoft login surface is reachable and reports `human_operator_login_ready` as `surface_only`.

The repeatable capture path is:

```powershell
pnpm cloudflare:operator:login
pnpm cloudflare:operator:site:bootstrap
pnpm cloudflare:operator:operation:bootstrap
pnpm cloudflare:operator:check -- --require-operator-session
```

`cloudflare:operator:site:bootstrap` creates the canonical Site if missing, resolves the Microsoft operator principal from the captured cookie file, grants that principal `owner / active`, and writes `CLOUDFLARE_CARRIER_SITE_ID=site_narada_cloudflare` to the ignored root `.env` file unless `--no-write-env` is supplied.

`cloudflare:operator:operation:bootstrap` ensures the canonical Site exists, ensures the Microsoft operator principal remains `owner / active`, creates or updates `operation_narada_cloudflare_control`, and writes `CLOUDFLARE_CARRIER_OPERATION_ID=operation_narada_cloudflare_control` to the ignored root `.env` file unless `--no-write-env` is supplied.

`cloudflare:operator:login` starts a short-lived loopback listener, opens the Worker capture URL in the browser, sends the operator through Microsoft login if needed, and stores only the signed `narada_operator_session` cookie in `CLOUDFLARE_OPERATOR_COOKIE_FILE`. It updates the ignored root `.env` with that cookie-file path unless `--no-write-env` is supplied. It does not store Microsoft tokens.

To bootstrap the ignored `.env` from explicit local flags:

```powershell
pnpm cloudflare:operator:check -- --url <worker-url> --token-file <path> --write-env
```

## What It Verifies

`pnpm cloudflare:operator:check` is an operator readiness gate. It verifies:

| Check | Evidence |
| --- | --- |
| Console surface | Worker root serves the Narada Cloudflare Carrier console and browser API client. |
| Microsoft login surface | Console exposes the Microsoft login route. |
| Credential posture | The local ignored `.env` points to a readable token file. |
| Human operator session | When `--operator-cookie-file` is supplied, `/auth/session` reconstructs a `microsoft_oidc` principal from the signed browser cookie. |
| Human operator membership | When `--operator-cookie-file` is supplied, cookie-authenticated `site.read` proves active Site membership for that principal. |
| Canonical Operation | `operation.read` proves `operation_narada_cloudflare_control` exists, belongs to the canonical Site, and is active. |
| Human operator Operation visibility | When `--operator-cookie-file` is supplied, cookie-authenticated `operation.read` proves the human operator can see the canonical Operation through active Site membership. |
| Live carrier runtime | `smoke:live` starts a session, admits input, dispatches Workers AI, and records terminal carrier evidence. |
| Tool effect boundary | Cloudflare task create/update tools are admitted through the configured Cloudflare effect boundary. |
| Site product read | `site.read` returns site/product state and membership visibility. |
| Site posture route | `site.list` returns `site_product_overview` and `site_posture_route`, proving the multi-site next-focus route from live site product statuses. |
| Operation posture route | `operation.read` returns `operation_posture_overview` and `operation_posture_route`, proving the operation next-focus route from live operation product data. |
| Persistence posture | `operation.read` returns `cloudflare_persistence_posture` and mirrors it into `operation_product_surface.persistence_posture`. |
| Recovery posture | `operation.read` returns `cloudflare_recovery_posture` and mirrors it into `operation_product_surface.recovery_posture`. |
| Webhook delay directive delivery surface | `webhook_delay.directive.primary_with_fallback.deliver` delivers a critical-delay directive as Cloudflare-primary carrier input, records delivery evidence, and keeps Windows fallback authority visible in `operation.read`. |
| Task lifecycle shadow surface | `operation.read` exposes task lifecycle shadow-read count and preserves Windows mutation authority with Cloudflare write admission refused. |
| Task lifecycle write admission surface | `task_lifecycle.write_admission.classify` records a refused Cloudflare task lifecycle write decision, and `operation.read` exposes the decision count/posture without mutating task lifecycle state. |
| Task lifecycle create cutover surface | The lower-level `task-lifecycle:create-smoke:live` gate proves `task_create` can be admitted on Cloudflare only with explicit cutover evidence while non-migrated task lifecycle mutations retain Windows authority. |
| Task lifecycle claim cutover surface | The lower-level `task-lifecycle:claim-smoke:live` gate proves `task_claim` can be admitted on Cloudflare only for an existing Cloudflare task row with explicit assignment/cutover evidence and opened-only conflict behavior. |
| Task lifecycle report cutover surface | The lower-level `task-lifecycle:report-smoke:live` gate proves `task_report` can be admitted on Cloudflare only for a claimed Cloudflare task with explicit report/cutover evidence while report metadata remains distinct from changed-file evidence admission. |
| Task lifecycle changed-file evidence cutover surface | The lower-level `task-lifecycle:changed-file-evidence-smoke:live` gate proves changed-file evidence can be admitted as task evidence while filesystem mutation, repository publication, and projection writes remain outside Cloudflare authority. |
| Task lifecycle finish cutover surface | The lower-level `task-lifecycle:finish-smoke:live` gate proves `task_finish` can be admitted on Cloudflare only for a closed reported task with explicit finish/cutover evidence and an accepted verdict. |
| Task lifecycle projection-write cutover surface | `task-lifecycle:projection-write-smoke:live` runs inside the root operator gate, proving task lifecycle projection writes can be admitted as Cloudflare read-model records while SQLite source mutation, filesystem mutation, and repository publication remain outside Cloudflare authority. |
| Task lifecycle source-state boundary | `task_lifecycle.write_admission.classify` records a refused `task_source_state_write` decision in the root operator gate, and the lower-level `task-lifecycle:source-state-write-smoke:live` gate proves the explicit source-state cutover route. |
| Task lifecycle role-resolution cutover surface | `task-lifecycle:role-resolution-write-smoke:live` runs inside the root operator gate, proving role resolution can be admitted from Cloudflare site membership while roster mutation, mailbox mutation, filesystem mutation, and repository publication remain outside Cloudflare authority. |
| Task lifecycle roster-mutation cutover surface | `task-lifecycle:roster-mutation-write-smoke:live` runs inside the root operator gate, proving the assigned principal's Cloudflare roster membership row can be mutated under task lifecycle cutover evidence while mailbox mutation, filesystem mutation, and repository publication remain outside Cloudflare authority. |
| Mailbox status shadow-read surface | `mailbox:status-shadow-smoke:live` records mailbox status visibility in Cloudflare operation state while proving mailbox send and mutation remain `not_admitted` and Windows-owned. |
| Site file change proposal surface | `site-file-change:proposal-smoke:live` records proposed site-file change evidence in Cloudflare operation state while proving filesystem mutation and repository publication remain `not_admitted` and Windows-owned. |
| Site file materialization surface | `site-file:materialization-smoke:live` admits a Cloudflare site-file-store materialization record with explicit cutover evidence while proving Windows filesystem mutation and repository publication remain `not_admitted`. |
| Repository publication credential posture | The lower-level `repository-publication:readiness-smoke:live` gate proves whether the Cloudflare GitHub publication executor has an admitted credential substrate, preferably GitHub App installation authority. |
| Resident loop shadow surface | `resident_loop.shadow_read.record` records a Windows-primary resident loop shadow run as read-model evidence and `operation.read` exposes its count/status/dispatch posture. |
| Resident dispatch surface | `resident_dispatch.primary_with_fallback.start` starts a Cloudflare primary carrier session, records the dispatch decision, and keeps Windows fallback authority visible in `operation.read`. |
| Local provider liveness scheduler | The root operator gate runs the live provider-liveness scheduler readback and verifies `\\Narada\\CloudflareProviderLivenessRefresh` points at the hidden `wscript.exe //B` wrapper, matches cadence/content, permits battery execution, and has no scheduler attention reasons. |
| Local site continuity scheduler | The root operator gate runs the live site-continuity scheduler health readback and verifies `\\Narada\\CloudflareSiteContinuitySync` points at the hidden `wscript.exe //B` wrapper, matches cadence/content, permits battery execution, reports synced local/cloud packet artifacts, and has no scheduler attention reasons. |
| Continuity loop | Windows and Cloudflare exchange site-continuity packets through the productized loop. |
| Idempotence | The continuity loop runs twice and the local packet ledger remains at one packet for the Cloudflare-to-Windows direction. |

The final JSON report includes `service_principal_ready`, `human_operator_login_ready`, `human_operator_membership_ready`, `sites.overview`, `sites.route`, `operation`, `operation.persistence_posture`, `operation.recovery_posture`, `operation.repository_publication_readiness_status`, `operation.repository_publication_github_credential_mode`, `operation.repository_publication_github_app_configured`, `operation.repository_publication_missing_configuration`, `operation.webhook_delay_directive_delivery_count`, `operation.task_lifecycle_shadow_read_count`, `operation.task_lifecycle_task_count`, `operation.task_lifecycle_projection_write_count`, `operation.task_lifecycle_projection_write_task_id`, `operation.task_lifecycle_projection_write_effect`, `operation.task_lifecycle_projection_sqlite_mutation_admission`, `operation.task_lifecycle_projection_filesystem_mutation_admission`, `operation.task_lifecycle_projection_repository_publication_admission`, `operation.task_lifecycle_write_admission_count`, `operation.task_lifecycle_source_state_write_admission`, `operation.task_lifecycle_source_state_write_authority`, `operation.task_lifecycle_assignment_write_count`, `operation.task_lifecycle_role_resolution_write_count`, `operation.task_lifecycle_roster_mutation_write_count`, `operation.task_lifecycle_role_resolution_write_admission`, `operation.task_lifecycle_role_resolution_write_authority`, `operation.task_lifecycle_roster_mutation_write_admission`, `operation.task_lifecycle_roster_mutation_write_authority`, `operation.task_lifecycle_roster_read_admission`, `operation.task_lifecycle_roster_mutation_admission`, `operation.task_lifecycle_write_admission_posture`, `operation.task_lifecycle_authority_partition`, `operation.task_lifecycle_cloudflare_write_admission`, `operation.task_lifecycle_projection_write_authority`, `operation.mailbox_status_shadow_read_count`, `operation.mailbox_status_authority`, `operation.mailbox_send_admission`, `operation.mailbox_mutation_admission`, `operation.mailbox_authority_partition`, `operation.site_file_change_proposal_count`, `operation.filesystem_executor_authority`, `operation.filesystem_mutation_admission`, `operation.repository_publication_admission`, `operation.site_file_change_authority_partition`, `operation.resident_loop_shadow_run_count`, `operation.resident_dispatch_decision_count`, `local_provider_liveness_scheduler_readback`, `local_site_continuity_scheduler_health`, `operation_provider_scheduler_posture`, `operation_posture`, `console_url`, and `microsoft_login_url`. The service fields prove automation and substrate readiness. The human fields prove operator entry only when the cookie-backed session check is supplied.

It also includes `operation.site_file_materialization_count`, `operation.site_file_materialization_id`, `operation.site_file_materialization_authority`, `operation.cloudflare_site_file_materialization_admission`, `operation.cloudflare_site_file_materialization_executor_authority`, `operation.windows_filesystem_mutation_admission`, `operation.site_file_materialization_repository_publication_admission`, and `operation.site_file_materialization_authority_partition` once the materialization smoke runs.

Carrier evidence replay can be `loaded`, `partial`, `degraded`, or `no_sessions`. `partial` means the report hit its bounded session read limit and carries `truncated_session_count`; it is not evidence loss. `degraded` remains reserved for attempted sessions with missing or failed evidence reads.

Task lifecycle task reads remain bounded and keep their default order. Live cutover smokes and the root operator gate use `task_lifecycle_include_task_ids` to append named task rows to the bounded result when the check must prove a specific freshly written task on a populated site.

## Repository Publication Credentials

GitHub App installation authority is the preferred credential substrate for Cloudflare repository publication because the Worker mints short-lived installation tokens inside the executor boundary:

```powershell
pnpm --filter @narada2/cloudflare-carrier run repository-publication:github-app-secret-put:live -- --app-id <id> --installation-id <id> --private-key-file <path>
pnpm --filter @narada2/cloudflare-carrier run repository-publication:readiness-smoke:live
```

The legacy PAT substrate remains available through `repository-publication:secret-put:live`, but both paths are credentials only. They do not admit publication authority by themselves. The readiness smoke must report `ready` with `github_credential_mode = github_app_installation` or `github_token`, the requested repository and branch must be allowlisted, and only then may an operator run `repository-publication:cloudflare-github-smoke:live`. A `not_ready` result is a refusal boundary, not a fallback to Windows publication.

## Boundary

This command does not itself move mutation authority between embodiments. It can prove that the Cloudflare and local Windows embodiments recognize the same `site_id`, exchange read-model/evidence packets, and preserve stable packet ids. Durable mutations still route through the declared authority locus for the mutation class.

The first deliberate task lifecycle authority migrations are narrow and explicit. `task_create` may be cut over to Cloudflare D1 only when the request carries `cloudflare_task_create_cutover = true`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. `task_claim` may then be cut over only for an existing Cloudflare task row and only when the request carries `cloudflare_task_claim_cutover = true`, `task_id`, claimant identity, `assignment_authority_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. `task_report` may then be cut over only for a claimed Cloudflare task row and only when the request carries `cloudflare_task_report_cutover = true`, `task_id`, reporter identity, `summary`, `report_authority_ref`, `report_schema_ref`, `changed_file_evidence_boundary_ref`, `cutover_point_ref`, `governed_write_contract_ref`, and `confirmation_evidence_ref`. `changed_file_evidence` may then be cut over only for a matching Cloudflare report with file evidence authority, material source, repository or site-file authority, cutover, contract, and confirmation evidence. `task_finish` may then be cut over only for a closed reported Cloudflare task with finalizer identity, `finish_verdict = accepted`, finish authority/schema refs, cutover, contract, and confirmation evidence. `task_projection_write` may then be cut over only as a Cloudflare read-model/projection record for an existing Cloudflare task row and only when the request carries projection target, schema, authority, source evidence, cutover, contract, and confirmation refs. `task_source_state_write` may then be cut over only for an existing Cloudflare task row and only when the request carries source-state authority, schema, source evidence, cutover, contract, and confirmation refs. `task_assignment_write` may then be cut over only with assignee identity, assignment authority/schema/evidence refs, cutover, contract, and confirmation refs. `task_role_resolution_write` may then be cut over only with assigned principal identity, role-resolution authority, roster source, schema/evidence refs, cutover, contract, and confirmation refs. `task_roster_mutation_write` may then be cut over only with assigned principal identity, roster mutation authority, roster schema/evidence refs, membership role/status, cutover, contract, and confirmation refs. These cutovers must be reported as an authority partition, not as full task lifecycle ownership. Mailbox behavior, filesystem mutation, and repository publication remain outside Cloudflare authority until separate cutover evidence exists. `site_file_change_proposal.record` admits only proposal evidence; it explicitly keeps filesystem mutation and repository publication `not_admitted`.

The lower-level commands remain available for narrow checks. The root operator gate also runs the projection-write smoke because the product readiness question now includes fresh proof of the full Cloudflare task lifecycle projection record boundary:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token-file <path> --expect-tool-effect-posture configured
pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:shadow-smoke:live -- --url <worker-url> --token-file <path> --payload-file <path-to-windows-shadow-read.json>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:create-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:claim-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:report-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:changed-file-evidence-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:finish-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:projection-write-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:source-state-write-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:assignment-write-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:role-resolution-write-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:roster-mutation-write-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier site-file-change:proposal-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier repository-publication:readiness-smoke:live -- --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier repository-publication:cloudflare-github-smoke:live -- --url <worker-url> --token-file <path>
```

The task-lifecycle shadow smoke records Windows task lifecycle state as Cloudflare read-model evidence only. It must report `mutation_authority = windows_task_lifecycle_sqlite` and `cloudflare_write_admission = not_admitted`.

The task-lifecycle create smoke is intentionally mutating. It first proves an unevidenced create is refused, then admits one Cloudflare `task_create` with explicit cutover evidence, lists the created task, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_cloudflare_remaining_windows` with default Windows authority still visible for the remaining task lifecycle mutation classes.

The task-lifecycle claim smoke is also intentionally mutating. It creates one Cloudflare task through the governed create cutover, proves an unevidenced claim is refused, admits one `task_claim` with explicit assignment/cutover evidence, verifies a duplicate claim returns conflict evidence, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_and_claim_cloudflare_remaining_windows`.

The task-lifecycle report smoke is intentionally mutating as well. It creates and claims one Cloudflare task, proves an unevidenced report is refused, admits one `task_report` with explicit report/cutover evidence, keeps changed-file evidence at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_and_report_cloudflare_remaining_windows`.

The task-lifecycle changed-file evidence smoke is intentionally mutating. It creates, claims, and reports one Cloudflare task, proves an unevidenced changed-file evidence write is refused, admits one `changed_file_evidence` record with explicit evidence/cutover refs, keeps filesystem mutation, repository publication, and projection writes at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_and_changed_file_evidence_cloudflare_remaining_windows`.

The task-lifecycle finish smoke is intentionally mutating. It creates, claims, reports, records changed-file evidence for, and then finishes one Cloudflare task, proves an unevidenced finish is refused, admits one `task_finish` with explicit finish/cutover evidence and `finish_verdict = accepted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows`.

The task-lifecycle projection-write smoke is intentionally mutating. It creates, claims, reports, records changed-file evidence for, finishes, and then writes one Cloudflare task lifecycle projection record, proves an unevidenced projection write is refused, admits one `task_projection_write` with explicit projection/cutover evidence, keeps SQLite source mutation, filesystem mutation, and repository publication at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_changed_file_evidence_and_projection_write_cloudflare_remaining_windows`.

The task-lifecycle source-state write smoke is intentionally mutating. It creates a finished projected Cloudflare task lifecycle row, proves an unevidenced `task_source_state_write` is refused, admits one source-state write with explicit source-state/cutover evidence, records canonical Cloudflare D1 source-state authority for that Cloudflare row, keeps Windows SQLite source writes, mailbox mutation, filesystem mutation, repository publication, assignment authority, and role resolution at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects`.

The task-lifecycle assignment write smoke is intentionally mutating. It extends the same Cloudflare task lifecycle row to an assignment write, proves an unevidenced `task_assignment_write` is refused, admits one assignment write with explicit assignment/cutover evidence, records canonical Cloudflare D1 assignment authority for that Cloudflare row, keeps roster mutation, role resolution, mailbox mutation, filesystem mutation, and repository publication at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects`.

The task-lifecycle role-resolution write smoke is intentionally mutating. It extends the same Cloudflare task lifecycle row through assignment, proves an unevidenced `task_role_resolution_write` is refused, admits one role-resolution write with explicit role-resolution/cutover evidence, resolves the assignee through Cloudflare site membership, keeps roster mutation, mailbox mutation, filesystem mutation, and repository publication at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects`.

The task-lifecycle roster-mutation write smoke is intentionally mutating. It extends the same Cloudflare task lifecycle row through role resolution, proves an unevidenced `task_roster_mutation_write` is refused, admits one roster mutation write with explicit roster/cutover evidence, upserts the assigned principal's Cloudflare site membership row idempotently, keeps mailbox mutation, filesystem mutation, and repository publication at `not_admitted`, and verifies `operation.read` reports `task_lifecycle_authority_partition = task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects`.

Use the root operator command when the question is whether the live Cloudflare embodiment is ready for an operator to enter.
