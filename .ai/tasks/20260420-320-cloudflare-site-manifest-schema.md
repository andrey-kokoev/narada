---
status: closed
depends_on: [309]
---

# Task 320 — Site Manifest/Config Schema for Cloudflare Materialization

## Context

Task 308 designed Cloudflare as Narada's first concrete `Site materialization`. Before any Worker or Durable Object code is written, the Site needs a manifest that describes what it is, what substrate it uses, and how it binds to Cloudflare resources.

## Goal

Create a config schema that describes a Cloudflare-backed Site. The schema must be validation-ready and use the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md).

## Required Work

### 1. Define Site manifest fields

A Cloudflare Site manifest must declare at minimum:

| Field | Type | Description |
|-------|------|-------------|
| `site_id` | `string` | Unique identifier for the Site |
| `substrate` | `"cloudflare-workers-do-sandbox"` | Capability class constant |
| `aim` | `object` | The Aim this Site pursues (name, description, vertical) |
| `cloudflare` | `object` | Cloudflare-specific bindings |
| `cloudflare.worker_name` | `string` | Worker script name |
| `cloudflare.do_namespace` | `string` | Durable Object namespace binding |
| `cloudflare.r2_bucket` | `string` | R2 bucket name for Trace/evidence |
| `cloudflare.cron_schedule` | `string` | Cron expression for Cycle scheduling |
| `cloudflare.secret_prefix` | `string` | Prefix for Worker Secrets (per-Site scoping) |
| `policy` | `object` | Runtime policy: primary_charter, allowed_actions, require_human_approval |
| `sources` | `array` | Source bindings (e.g., Graph API user_id for mailbox) |

### 2. Add validation

- `site_id` must be unique and URL-safe.
- `substrate` must be exactly `"cloudflare-workers-do-sandbox"` for this task.
- `cloudflare.cron_schedule` must be a valid Cron expression.
- `policy.allowed_actions` must be a subset of the known `AllowedAction` universe.

### 3. Document the schema

Add a markdown file under `docs/` or inline in the schema source that explains each field and gives an example manifest.

## Non-Goals

- Do not implement the Worker, DO, or R2 adapter.
- Do not create Wrangler config.
- Do not invent a generic deployment schema that works for AWS, GCP, etc.
- Do not rename existing `operation`/`scope` config fields.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Site manifest TypeScript type / Zod schema exists.
- [x] Validation rejects invalid manifests with clear errors.
- [x] Example manifest is documented.
- [x] Schema uses `Aim`, `Site`, `substrate` correctly; no `operation` smear.
- [x] No implementation code for Worker, DO, or R2 is added.

## Execution Notes

- Created `packages/layers/control-plane/src/config/site-manifest.ts` with:
  - TypeScript interfaces: `SiteManifest`, `Aim`, `CloudflareBindings`, `SitePolicy`
  - Zod schemas: `SiteManifestSchema`, `AimSchema`, `CloudflareBindingsSchema`, `SitePolicySchema`
  - Validation functions: `validateSiteManifest`, `validateSiteManifestOrThrow`, `isValidSiteManifest`
  - Cron expression validation via regex
  - URL-safe `site_id` validation
  - `allowed_actions` enforced as subset of `AllowedActionSchema` from `@narada2/charters`
- Exported from `packages/layers/control-plane/src/index.ts`
- Created `docs/deployment/cloudflare-site-manifest.md` with complete example and validation API docs
- Added 12 focused unit tests in `test/unit/config/site-manifest.test.ts`
- `pnpm --filter @narada2/control-plane typecheck` passes
- `vitest run test/unit/config/site-manifest.test.ts` — 12/12 tests pass
- Root `pnpm verify` fails only on pre-existing `packages/sites/cloudflare` typecheck errors (unrelated)

## Suggested Verification

```bash
pnpm verify
```

If only types/docs are touched, manual inspection plus `pnpm typecheck` is sufficient.
## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
