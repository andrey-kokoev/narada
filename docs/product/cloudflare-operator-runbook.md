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
```

The token value stays in the token file and in the deployed Worker secret. The runbook command reports the credential source, not token material.

The service token proves service authority and live substrate readiness. It does not prove that a human operator is logged in. To hard-check the current Microsoft operator session, provide a local cookie file containing either the full `Cookie:` header, the `narada_operator_session=...` pair, or just the raw cookie value:

```powershell
pnpm cloudflare:operator:check -- --operator-cookie-file D:\tmp\narada-cloudflare-operator-cookie.txt --require-operator-session
```

Without `--operator-cookie-file`, the command still verifies that the Microsoft login surface is reachable and reports `human_operator_login_ready` as `surface_only`.

The repeatable capture path is:

```powershell
pnpm cloudflare:operator:login
pnpm cloudflare:operator:check -- --require-operator-session
```

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
| Live carrier runtime | `smoke:live` starts a session, admits input, dispatches Workers AI, and records terminal carrier evidence. |
| Tool effect boundary | Cloudflare task create/update tools are admitted through the configured Cloudflare effect boundary. |
| Site product read | `site.read` returns site/product state and membership visibility. |
| Continuity loop | Windows and Cloudflare exchange site-continuity packets through the productized loop. |
| Idempotence | The continuity loop runs twice and the local packet ledger remains at one packet for the Cloudflare-to-Windows direction. |

The final JSON report includes `service_principal_ready`, `human_operator_login_ready`, `human_operator_membership_ready`, `console_url`, and `microsoft_login_url`. The service fields prove automation and substrate readiness. The human fields prove operator entry only when the cookie-backed session check is supplied.

## Boundary

This command does not move mutation authority between embodiments. It can prove that the Cloudflare and local Windows embodiments recognize the same `site_id`, exchange read-model/evidence packets, and preserve stable packet ids. Durable mutations still route through the declared authority locus for the mutation class.

The lower-level commands remain available for narrow checks:

```powershell
pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url <worker-url> --token-file <path> --expect-tool-effect-posture configured
pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <path>
```

Use the root operator command when the question is whether the live Cloudflare embodiment is ready for an operator to enter.
