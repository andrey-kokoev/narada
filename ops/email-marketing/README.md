# Email Marketing Operation — Private Ops Repo

> **⚠️ COPY TO A PRIVATE REPOSITORY BEFORE CUSTOMIZING**
>
> This directory is a **template** checked into the public Narada repository.
> It contains no real credentials, no real brand data, and no customer information.
> Before running a live dry run, copy this entire directory to a private repo
> or local filesystem and fill in the placeholder values.

---

## What This Is

This is the operational repository for the Narada **email-marketing Operation**.
It turns inbound colleague/customer campaign requests into governed campaign
briefs (and follow-up emails for missing information), with **no autonomous
Klaviyo mutation** in v0.

For the full boundary contract, see:
- [`docs/deployment/email-marketing-operation-contract.md`](../../docs/deployment/email-marketing-operation-contract.md)
- [`docs/deployment/campaign-charter-knowledge-binding.md`](../../docs/deployment/campaign-charter-knowledge-binding.md)
- [`docs/bootstrap-contract.md`](../../docs/product/bootstrap-contract.md)

---

## Directory Structure

```
narada-ops-marketing/
├── config.json                 # Site config with scope, sources, policy
├── .env.example                # Credential template (copy to .env)
├── .gitignore                  # Prevents accidental commits of private data
├── knowledge/
│   ├── naming-conventions.md   # Campaign naming rules
│   ├── brand-voice.md          # Tone guidelines
│   ├── segment-definitions.md  # Audience segments (metadata only)
│   ├── timing-constraints.md   # Lead times, blackout dates, send windows
│   └── campaign-templates.md   # Example briefs for common campaign types
└── README.md                   # This file
```

The `site-root/` directory is created at runtime by `narada init-repo` or
`ensureSiteDir()`. It holds SQLite state, logs, and traces. It is **gitignored**
by default.

---

## Setup Procedure

### Step 1: Copy to a Private Location

```bash
# Option A: Private Git repository
git init narada-ops-marketing-private
cp -r narada/ops/email-marketing/* narada-ops-marketing-private/
cd narada-ops-marketing-private

# Option B: Local filesystem only (no git)
cp -r narada/ops/email-marketing ~/narada-ops-marketing
```

### Step 2: Configure Credentials

```bash
cp .env.example .env
# Edit .env with real values:
#   GRAPH_TENANT_ID
#   GRAPH_CLIENT_ID
#   GRAPH_CLIENT_SECRET
#   GRAPH_ACCESS_TOKEN
#   NARADA_MARKETING_CHARTER_API_KEY
```

**Credential resolution order** (highest to lowest precedence):
1. Environment variables
2. Secure storage references (`{ "$secure": "key" }` in config)
3. Config file values
4. `.env` file values

For Windows native Sites, the Windows Credential Manager is also checked
(for `NARADA_MARKETING_GRAPH_ACCESS_TOKEN`, etc.).

### Step 3: Customize Knowledge Sources

Edit each file in `knowledge/` and replace the placeholder content with real
brand rules:

| File | What to Customize |
|------|-------------------|
| `naming-conventions.md` | Your campaign naming prefixes, date formats, forbidden words |
| `brand-voice.md` | Your tone, approved phrases, prohibited phrases, disclaimers |
| `segment-definitions.md` | Your audience segments, sizes, criteria |
| `timing-constraints.md` | Your lead times, blackout dates, send windows |
| `campaign-templates.md` | Your example briefs, subject line patterns |

**Privacy rule:** `segment-definitions.md` must contain **only** segment
metadata (names, descriptions, approximate counts). Never include individual
customer emails, names, or list export data.

### Step 4: Configure `config.json`

Edit `config.json` and replace all `<...>` placeholders:

| Placeholder | What It Is |
|-------------|------------|
| `<your-tenant-id>` | Microsoft Entra ID (Azure AD) tenant ID |
| `<your-client-id>` | App registration client ID |
| `campaign-requests@example.com` | The mailbox that receives campaign requests |
| `colleague1@example.com` | Allowed sender email addresses |

**Key config fields:**

- `campaign_request_senders` — Only mail from these addresses is admitted as
campaign-request facts. Non-allowed senders are silently skipped.
- `campaign_request_lookback_days` — How far back to scan for new requests
(default: 7).
- `policy.primary_charter` — Must be `"campaign_producer"`.
- `policy.allowed_actions` — Must include `"campaign_brief"`, `"send_reply"`,
`"no_action"`.
- `knowledge_sources` — Paths to the 5 knowledge files (relative to this
repo's root).

### Step 5: Initialize the Site Root

```bash
# For Windows native
narada init-repo ./site-root
# Or manually create the site directory structure

# For WSL
mkdir -p site-root/{state,messages,tombstones,views,blobs,tmp,db,logs,traces}
```

### Step 6: Verify with Doctor

```bash
narada doctor --site marketing
```

Expected checks:
- ✅ Site directory exists
- ✅ `config.json` is valid JSON
- ✅ Graph API credentials are resolvable
- ✅ Charter API key is resolvable
- ✅ Knowledge source files exist and are readable
- ✅ Lock directory is writable

### Step 7: Run a Dry-Run Cycle

```bash
narada cycle --site marketing
```

This executes one bounded Cycle:
1. Acquire lock
2. Sync mailbox deltas (if steps 2–6 are wired)
3. Derive/admit campaign-request work
4. Evaluate charter
5. Create brief or follow-up decision
6. Reconcile submitted effects
7. Update health and trace
8. Release lock

**v0 expectation:** Steps 2–6 are fixture stubs unless Tasks 400–401 are
complete. The dry run (Task 403) validates the full pipeline.

---

## Credential Requirements by Phase

| Credential | Dry Run (v0) | v1 | Resolution |
|------------|--------------|----|------------|
| `GRAPH_TENANT_ID` | Required | Required | `.env` → config |
| `GRAPH_CLIENT_ID` | Required | Required | `.env` → config |
| `GRAPH_CLIENT_SECRET` | Required | Required | `.env` → config |
| `GRAPH_ACCESS_TOKEN` | Required | Required | `.env` → Credential Manager → config |
| `NARADA_MARKETING_CHARTER_API_KEY` | Required | Required | `.env` → config |
| `KLAVIYO_API_KEY` | Not used | Required | `.env` → config |

---

## Public / Private Boundary

| What | Location | Why |
|------|----------|-----|
| Kernel code, CLI, Site substrates | Public `narada` repo | Reusable runtime |
| Config schema, action type definitions | Public `narada` repo | Generic substrate |
| **This ops repo** (config, knowledge, credentials) | **Private repo** | Brand-specific, proprietary, secret |
| Site root (SQLite, logs, traces) | Local filesystem | Runtime state; never in git |

**Hard rule:** No private brand data, customer data, or credentials may be
committed to the public Narada repository.

---

## Troubleshooting

### `narada doctor` fails: "Cannot resolve site root"
- Ensure `NARADA_SITE_ROOT` is set or the default path exists.
- For native Windows: check `%LOCALAPPDATA%\Narada\marketing` exists.
- For WSL: check `/var/lib/narada/marketing` or `~/narada/marketing` exists.

### `narada doctor` fails: "Required secret not found"
- Ensure `.env` exists and contains all required variables.
- For native Windows: ensure `keytar` is installed if using Credential Manager.

### Charter evaluation fails: "Knowledge source not found"
- Verify `knowledge_sources` paths in `config.json` are relative to the repo root.
- Ensure all 5 knowledge files exist and are readable.

---

## References

- [`docs/deployment/email-marketing-operation-contract.md`](../../docs/deployment/email-marketing-operation-contract.md)
- [`docs/deployment/campaign-charter-knowledge-binding.md`](../../docs/deployment/campaign-charter-knowledge-binding.md)
- [`docs/deployment/windows-site-materialization.md`](../../docs/deployment/windows-site-materialization.md)
- [`docs/deployment/windows-credential-path-contract.md`](../../docs/deployment/windows-credential-path-contract.md)
- [`docs/product/bootstrap-contract.md`](../../docs/product/bootstrap-contract.md)
