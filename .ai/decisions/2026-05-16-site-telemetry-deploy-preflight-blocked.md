# Site Telemetry Deploy Preflight Blocked

Generated: 2026-05-16

Task: `1426`

## Verdict

Deploy preflight is not green.

The hosted Site Telemetry surface remains deploy-blocked. No live deploy
approval was set and no Cloudflare mutation was performed.

## Command

```powershell
pnpm --filter @narada2/site-registry-cloudflare deploy:preflight
```

## Result

- schema: `narada.site_telemetry.deploy_preflight.v0`;
- status: `blocked`;
- build command: `pnpm --filter @narada2/site-registry-cloudflare build`;
- deploy command reported by preflight:
  `wrangler deploy --config packages/site-registry-cloudflare/wrangler.jsonc`;
- live deploy gated: `true`;
- deploy mutation planned: `false`;
- raw secret values recorded: `false`.

Passing checks:

- `storage_bindings_declared`;
- `build_command_declared`;
- `live_deploy_requires_explicit_gate`;
- `secret_refs_withheld_from_config`.

Failing checks:

- `wrangler_auth_reference_present`: `missing_wrangler_auth_reference`;
- `storage_binding_ids_non_placeholder`:
  `NARADA_SITE_REGISTRY_KV,NARADA_SITE_REGISTRY_D1`.

Placeholder bindings:

- `NARADA_SITE_REGISTRY_KV`;
- `NARADA_SITE_REGISTRY_D1`.

Live deploy requirements reported by the preflight remain:

- `operator_capability_grant`;
- `NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1`;
- `non_placeholder_wrangler_config`;
- `post_deploy_smoke_evidence`.

## Unblock Condition

Task `1426` can resume only after task `1425` is unblocked or otherwise
superseded by governed evidence that provides:

- Wrangler/Cloudflare auth reference for the acting operator/session;
- non-placeholder D1 database id/name;
- non-placeholder KV namespace id/name;
- route/domain and account/zone coordinates if required by the intended config;
- confirmation that coordinates are admitted as repo-visible deployment
  coordinates;
- no raw secret values in config, reports, or evidence.

After unblocking, rerun:

```powershell
pnpm --filter @narada2/site-registry-cloudflare deploy:preflight
```

The task may close only when preflight reports `status=ready`, or remain
deferred with exact blockers.
