# Cloudflare Site Manifest

> Config schema that describes a Cloudflare-backed Narada Site.
>
> Uses the crystallized vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md): **Aim / Site / Cycle / Act / Trace**.

---

## Schema Overview

A Site manifest declares:

- What **Aim** this Site pursues
- What **substrate** it runs on
- What **Cloudflare resources** it binds to
- What **policy** governs runtime behavior
- What **sources** feed facts into the Site

---

## Fields

### `site_id` (required)

Unique identifier for the Site. Must be URL-safe: alphanumeric, hyphens, and underscores only.

```json
"site_id": "help-global-maxima"
```

### `substrate` (required)

Capability class constant. For the Cloudflare prototype, this must be exactly:

```json
"substrate": "cloudflare-workers-do-sandbox"
```

This class requires: event-driven compute (Worker), scheduled invocation (Cron), durable coordination (Durable Object), bounded execution (Sandbox), object storage (R2), and secret binding (Worker Secrets).

### `aim` (required)

The pursued telos or user-level objective.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable Aim name |
| `description` | `string` | What this Aim accomplishes |
| `vertical` | `"mailbox" \| "timer" \| "webhook" \| "filesystem"` | Source vertical (default: `"mailbox"`) |

```json
"aim": {
  "name": "Support response automation",
  "description": "Draft replies to customer support emails with human approval",
  "vertical": "mailbox"
}
```

### `cloudflare` (required)

Cloudflare-specific resource bindings.

| Field | Type | Description |
|-------|------|-------------|
| `worker_name` | `string` | Worker script name |
| `do_namespace` | `string` | Durable Object namespace binding |
| `r2_bucket` | `string` | R2 bucket name for Trace/evidence storage |
| `cron_schedule` | `string` | 5-field Cron expression for Cycle scheduling |
| `secret_prefix` | `string` | Prefix for Worker Secrets (per-Site scoping) |

```json
"cloudflare": {
  "worker_name": "narada-help-global-maxima",
  "do_namespace": "NARADA_SITE_HELP_GLOBAL_MAXIMA",
  "r2_bucket": "narada-traces-help-global-maxima",
  "cron_schedule": "*/5 * * * *",
  "secret_prefix": "NARADA_HELP_"
}
```

**Cron validation:** `cron_schedule` must be a valid 5-field Cron expression (`minute hour day month weekday`). Examples:
- `"0 * * * *"` — every hour
- `"*/5 * * * *"` — every 5 minutes
- `"0 9 * * 1-5"` — weekdays at 9 AM

### `policy` (required)

Runtime governance policy.

| Field | Type | Description |
|-------|------|-------------|
| `primary_charter` | `string` | Default: `"support_steward"` |
| `secondary_charters` | `string[]` | Optional backup charters |
| `allowed_actions` | `AllowedAction[]` | Actions this Site may propose or execute |
| `allowed_tools` | `string[]` | Optional tool catalog binding |
| `require_human_approval` | `boolean` | Default: `true` |

```json
"policy": {
  "primary_charter": "support_steward",
  "allowed_actions": ["draft_reply", "mark_read", "set_categories", "no_action"],
  "require_human_approval": true
}
```

**Validation:** `allowed_actions` must be a subset of the known `AllowedAction` universe:
`draft_reply`, `send_reply`, `send_new_message`, `mark_read`, `move_message`, `set_categories`, `extract_obligations`, `create_followup`, `tool_request`, `no_action`.

### `sources` (required)

Source bindings that feed facts into the Site. At least one source is required.

```json
"sources": [
  {
    "type": "graph",
    "user_id": "help@global-maxima.com",
    "prefer_immutable_ids": true
  }
]
```

---

## Complete Example

```json
{
  "site_id": "help-global-maxima",
  "substrate": "cloudflare-workers-do-sandbox",
  "aim": {
    "name": "Support response automation",
    "description": "Draft replies to customer support emails with human approval",
    "vertical": "mailbox"
  },
  "cloudflare": {
    "worker_name": "narada-help-global-maxima",
    "do_namespace": "NARADA_SITE_HELP_GLOBAL_MAXIMA",
    "r2_bucket": "narada-traces-help-global-maxima",
    "cron_schedule": "*/5 * * * *",
    "secret_prefix": "NARADA_HELP_"
  },
  "policy": {
    "primary_charter": "support_steward",
    "secondary_charters": [],
    "allowed_actions": ["draft_reply", "mark_read", "set_categories", "no_action"],
    "allowed_tools": [],
    "require_human_approval": true
  },
  "sources": [
    {
      "type": "graph",
      "user_id": "help@global-maxima.com",
      "prefer_immutable_ids": true
    }
  ]
}
```

---

## Validation API

```typescript
import { validateSiteManifest, validateSiteManifestOrThrow } from "@narada2/control-plane";

// Safe validation
const result = validateSiteManifest(raw);
if (result.success) {
  console.log("Valid manifest:", result.data.site_id);
} else {
  console.error("Validation errors:", result.errors);
}

// Throw on failure
const manifest = validateSiteManifestOrThrow(raw);
```

### Validation Rules

| Rule | Error message |
|------|---------------|
| `site_id` URL-safe | `site_id must be URL-safe (...)` |
| `substrate` exact match | `Invalid literal value, expected "cloudflare-workers-do-sandbox"` |
| `cron_schedule` valid | `cron_schedule must be a valid 5-field Cron expression` |
| `allowed_actions` subset | Zod enum error with valid options |
| At least one source | `sources: At least one source is required` |

---

## Non-Goals

- This manifest does not describe Wrangler configuration (`wrangler.toml`).
- It does not declare Worker Secrets values (those bind at deploy time).
- It is not a generic deployment schema for AWS, GCP, etc.
- It does not include Worker, DO, Sandbox, or R2 implementation code.

---

## Related Documents

- [`docs/deployment/cloudflare-site-materialization.md`](cloudflare-site-materialization.md) — Design for the Cloudflare Site materialization
- [`SEMANTICS.md §2.14`](../../SEMANTICS.md) — Definitions of Aim, Site, Cycle, Act, Trace
