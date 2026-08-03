---
number: 2231
governed_by: task_close:narada.architect
status: closed
tags: deployment, marketing, website
creation_payload_ref: mcp_payload:narada-mkt-site-2026-07-31-domain-deploy@v1
creation_payload_sha256: 36b5139f82439daae4842cbf75b6ce830e9cd89f563c608355965bc3f79bb609
idempotency_key: chapter-narada-marketing-site-2026-07-31-domain-deploy
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"manual","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"chapter-narada-marketing-site-2026-07-31-domain-deploy"}
criteria_proved_by: andrey-user.resident
criteria_proved_at: 2026-07-31T22:49:10.816Z
closed_at: 2026-07-31T23:15:05.041Z
closed_by: narada.architect
closure_mode: agent_finish
---

# Marketing site: domain and deployment

## Goal

Choose, register or point a public domain (e.g. narada.dev if obtainable) and deploy the landing page.

## Context

narada.dev currently does not resolve; it is used only as a schema URI namespace in repo artifacts. Cloudflare is the established Site substrate in this ecosystem.

## Required Work

1. Confirm domain choice with operator (check narada.dev availability or pick alternative).
2. Set up hosting/deploy pipeline (Cloudflare preferred).
3. Deploy landing page and verify public HTTPS access.

## Non-Goals

Schema URI migration if narada.dev turns out unavailable (record as follow-up instead).

## Execution Notes


## Domain

narada.systems chosen by operator (2026-07-31 background question). RDAP/DNS check confirmed it was already registered and delegated to Cloudflare nameservers (mira/titan.ns.cloudflare.com) in the operator's account (andrei.kokoev@gmail.com, account aa93aee1fd6a15f4efc9832219ceea2c) — no purchase needed. narada.dev remains only a schema URI namespace; no migration performed (per non-goals).

## Deployment

Target: Cloudflare Workers with static assets (worker narada-systems), from D:\code\narada-systems.
1. npx wrangler deploy — uploads assets + worker; initial 404 root cause: @astrojs/cloudflare v14 emits dist/client + dist/server, assets.directory must be ./dist/client.
2. Custom domains: wrangler deploy silently used the adapter-redirected dist/client/wrangler.json, which drops user routes. Fixed with npx wrangler triggers deploy -c wrangler.jsonc attaching narada.systems and www.narada.systems as Workers custom domains (auto DNS + cert). workers_dev re-enabled explicitly after triggers deploy warned it would disable it.
Live URLs: https://narada.systems/ (apex), https://www.narada.systems/ (www), https://narada-systems.andrei-kokoev.workers.dev/ (fallback).
Adapter auto-provisioned SESSION KV and IMAGES bindings (adapter defaults; unused by the static page, left in place to avoid config drift).

## Redeploy procedure (documented)

cd D:/code/narada-systems && npm run build && npx wrangler deploy && npx wrangler triggers deploy -c wrangler.jsonc

## Verification


1. HTTP checks: apex https://narada.systems/ 200, www 200, workers.dev 200.
2. Content greps on apex response all OK: 'actually govern', 'Intelligence-Authority Separation', '@narada2/cli' — the real page, not a placeholder.
Acceptance criteria: (a) landing page publicly reachable over HTTPS at the chosen domain — verified; (b) deployment process documented — see Redeploy procedure above.
no_files_changed declared: all deliverable files live under D:\code\narada-systems (outside the narada site root per the #2232 location decision).

## Acceptance Criteria

- [x] Landing page publicly reachable over HTTPS at the chosen domain
- [x] Deployment process documented in the task
