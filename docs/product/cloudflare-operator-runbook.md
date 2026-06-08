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
| Task lifecycle shadow surface | `operation.read` exposes task lifecycle shadow-read count and preserves Windows mutation authority with Cloudflare write admission refused. |
| Task lifecycle write admission surface | `task_lifecycle.write_admission.classify` records a refused Cloudflare task lifecycle write decision, and `operation.read` exposes the decision count/posture without mutating task lifecycle state. |
| Resident dispatch surface | `resident_dispatch.primary_with_fallback.start` starts a Cloudflare primary carrier session, records the dispatch decision, and keeps Windows fallback authority visible in `operation.read`. |
| Continuity loop | Windows and Cloudflare exchange site-continuity packets through the productized loop. |
| Idempotence | The continuity loop runs twice and the local packet ledger remains at one packet for the Cloudflare-to-Windows direction. |

The final JSON report includes `service_principal_ready`, `human_operator_login_ready`, `human_operator_membership_ready`, `sites.overview`, `sites.route`, `operation`, `operation.persistence_posture`, `operation.recovery_posture`, `operation.task_lifecycle_shadow_read_count`, `operation.task_lifecycle_write_admission_count`, `operation.task_lifecycle_write_admission_posture`, `operation.resident_dispatch_decision_count`, `operation_posture`, `console_url`, and `microsoft_login_url`. The service fields prove automation and substrate readiness. The human fields prove operator entry only when the cookie-backed session check is supplied.

## Boundary

This command does not move mutation authority between embodiments. It can prove that the Cloudflare and local Windows embodiments recognize the same `site_id`, exchange read-model/evidence packets, and preserve stable packet ids. Durable mutations still route through the declared authority locus for the mutation class.

The lower-level commands remain available for narrow checks:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token-file <path> --expect-tool-effect-posture configured
pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <path>
pnpm --filter @narada2/cloudflare-carrier task-lifecycle:shadow-smoke:live -- --url <worker-url> --token-file <path> --payload-file <path-to-windows-shadow-read.json>
```

The task-lifecycle shadow smoke records Windows task lifecycle state as Cloudflare read-model evidence only. It must report `mutation_authority = windows_task_lifecycle_sqlite` and `cloudflare_write_admission = not_admitted`.

Use the root operator command when the question is whether the live Cloudflare embodiment is ready for an operator to enter.
