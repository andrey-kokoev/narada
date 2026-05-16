# Site Telemetry Cloudflare Binding Replacement Blocker

Generated: 2026-05-16

Task: `1425`

## Verdict

Do not patch Wrangler config yet.

No live config file exists at
`packages/site-registry-cloudflare/wrangler.jsonc`, and
`packages/site-registry-cloudflare/wrangler.example.jsonc` still contains
placeholder storage coordinates:

- `NARADA_SITE_REGISTRY_KV` id: `<kv_namespace_id>`;
- `NARADA_SITE_REGISTRY_D1` database id: `<d1_database_id>`.

Per
[`site-telemetry-cloudflare-coordinate-secret-posture.v0.md`](../../docs/product/site-telemetry-cloudflare-coordinate-secret-posture.v0.md),
Cloudflare resource ids may be repo-visible deployment coordinates only after
the operator provides or confirms them for this project. They have not been
provided in this session.

## Preflight Evidence

Command:

```powershell
pnpm --filter @narada2/site-registry-cloudflare deploy:preflight
```

Observed result:

- schema: `narada.site_telemetry.deploy_preflight.v0`;
- status: `blocked`;
- deploy mutation planned: `false`;
- live deploy gated: `true`;
- failing check: `wrangler_auth_reference_present`;
- failing detail: `missing_wrangler_auth_reference`;
- failing check: `storage_binding_ids_non_placeholder`;
- failing detail: `NARADA_SITE_REGISTRY_KV,NARADA_SITE_REGISTRY_D1`;
- placeholder bindings: `NARADA_SITE_REGISTRY_KV`,
  `NARADA_SITE_REGISTRY_D1`;
- raw secret values recorded: `false`.

## Required Unblock Evidence

Provide or create, through a governed task, the non-secret Cloudflare deployment
coordinates for this first live slice:

- Cloudflare account id, if required by the intended Wrangler config;
- Cloudflare zone id, if a route/custom domain is configured;
- Worker script name;
- route/custom domain;
- D1 database name;
- D1 database id;
- KV namespace name;
- KV namespace id;
- confirmation that these coordinates are for
  `narada-proper-site-telemetry-publication-v0`;
- confirmation that these coordinates may be recorded in repo-visible config.

Also provide deploy capability posture without revealing raw secrets:

- Wrangler/Cloudflare auth reference is present for the acting operator/session;
- Worker secret names are confirmed;
- Worker secret raw values are configured out of band or explicitly still
  missing;
- no raw token values are recorded in repo files, task reports, terminal output
  admitted as evidence, or smoke artifacts.

## Safe Resume

After the unblock evidence exists:

```powershell
narada task unblock 1425 --agent narada.architect --reason "Cloudflare coordinates and auth reference are available as governed evidence"
```

Then run:

```powershell
pnpm --filter @narada2/site-registry-cloudflare deploy:preflight
```

Do not run live deploy from task `1425`; live deploy remains task `1427` and
requires explicit operator grant plus the package deploy gate.
