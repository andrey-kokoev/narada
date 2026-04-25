---
status: closed
depends_on: [309, 320]
---

# Task 324 — Secret Binding and Egress Policy Design

## Context

Task 308 identified that Cloudflare uses Worker Secrets, not `.env` files. Each Cloudflare Site needs its own credentials (Graph API, Kimi API, etc.) bound securely. This task designs the secret binding and egress policy.

## Goal

Design how secrets bind to a Cloudflare Site: naming conventions, scoping, egress policy, and rotation strategy.

## Required Work

### 1. Define secret naming convention

Worker Secrets are global to a Worker script. Per-Site scoping is achieved via naming:

```text
NARADA_{site_id}_{secret_name}
```

Examples:

```text
NARADA_HELP_GRAPH_ACCESS_TOKEN
NARADA_HELP_GRAPH_TENANT_ID
NARADA_HELP_KIMI_API_KEY
```

Where `HELP` is the `site_id` (normalized: uppercase, hyphen-safe).

### 2. Define secret schema

A Cloudflare Site requires at minimum:

| Secret Name | Purpose | Required? |
|-------------|---------|-----------|
| `GRAPH_ACCESS_TOKEN` | Microsoft Graph API access | Yes (mailbox vertical) |
| `GRAPH_TENANT_ID` | Microsoft Graph tenant | Yes (mailbox vertical) |
| `GRAPH_CLIENT_ID` | Microsoft Graph app client | Yes (mailbox vertical) |
| `GRAPH_CLIENT_SECRET` | Microsoft Graph app secret | Yes (mailbox vertical) |
| `KIMI_API_KEY` | Charter runtime API key | Yes |
| `NARADA_ADMIN_TOKEN` | Operator status endpoint auth | Yes |

### 3. Define egress policy

The Worker must declare which external hosts it may call:

- `graph.microsoft.com` — Graph API sync and draft creation
- `api.openai.com` or `api.moonshot.cn` — Charter runtime API
- Optional: telemetry or observability endpoints

All other egress is denied by default.

### 4. Document rotation strategy

- Secrets are rotated manually by the operator.
- The Worker reads secrets at invocation time; no caching beyond one Cycle.
- On secret mismatch (e.g., 401 from Graph API), the Cycle fails gracefully and records the auth failure in health/Trace.

## Non-Goals

- Do not implement automatic secret rotation.
- Do not integrate with HashiCorp Vault, AWS Secrets Manager, etc.
- Do not implement a generic secret provider abstraction.
- Do not add Wrangler config.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Secret naming convention is documented.
- [x] Required secret list is defined per vertical.
- [x] Egress policy lists allowed hosts.
- [x] Rotation strategy is documented.
- [x] No implementation code is added.

## Suggested Verification

Manual inspection of the design document. No code to verify.

## Execution Notes

### Design document appended

Added **Section 7: Secret Binding and Egress Policy** to `docs/deployment/cloudflare-site-materialization.md`:

- **7.1 Secret Naming Convention**: `NARADA_{site_id}_{secret_name}` with uppercase, hyphen-safe `site_id`.
- **7.2 Required Secret Schema**: Table of 6 required secrets with purpose, required flag, and vertical scope.
- **7.3 Egress Policy**: Allowed hosts (`graph.microsoft.com`, `api.openai.com`, `api.moonshot.cn`); all other egress denied by default.
- **7.4 Rotation Strategy**: Manual rotation, no caching beyond one Cycle, graceful auth-failure handling. Automatic rotation deferred to v1.

### Verification

- `pnpm build` — clean across all packages (no code changes).
- No derivative task-status files created.
