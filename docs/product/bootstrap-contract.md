# Bootstrap Contract: Intent to Operation

> The canonical path from user intent to a runnable Narada operation.

Narada offers two bootstrap paths: **demo/trial** (no credentials, mock data) and **live** (real mailbox, real charter runtime). Both follow the same five-step contract. This document is the single source of truth for what must happen, what artifacts must exist, and what validation gates must pass.

---

## The Five-Step Contract

### Step 1: Express Intent

Decide what you want Narada to do and choose a path.

When the intent is more than a simple built-in vertical, write an **operation specification**: the sources, charters, posture, knowledge, review rules, and allowed effects for the operation. Do not describe this as creating a "Narada instance"; the operation is the configured work objective, while the daemon or Site is the runtime machinery.

| Path | When to use | Credentials |
|------|-------------|-------------|
| **Demo** | First contact, evaluate Narada | None |
| **Trial** | Safe local exploration, no external systems | None |
| **Live** | Production or persistent operation | Graph API + charter runtime |

**Artifact:** A decision. No files yet.

**Optional artifact:** An operation specification for richer operations, such as "mail-backed Klaviyo campaign production from designated colleague requests."

---

### Step 2: Initialize Operation Repo

Create a private operational repository that holds config, data, and operational material.

**Commands:**
- Demo/trial: `narada init-repo --demo <path>`
- Live: `narada init-repo <path>`

**Required artifacts after this step:**

| Artifact | Purpose |
|----------|---------|
| `package.json` | Dependencies (`@narada2/*`) and scripts (`sync`, `daemon`, `status`) |
| `config/config.json` | Live config (demo: pre-populated with mock scope; live: empty scopes array) |
| `config/config.example.json` | Documented template for adding scopes |
| `.env.example` | Credential template |
| `.gitignore` | Excludes `node_modules/`, `.env`, `logs/`, local configs |
| `mailboxes/`, `workflows/`, `logs/`, `knowledge/` | Operational directories |
| `README.md` | Path-specific first-run guide |

**Validation gate:** `package.json` exists and contains `@narada2/cli` dependency.

---

### Step 3: Select Vertical and Posture

Declare what Narada should operate on and how cautiously it should act.

**Commands:**
- Live mailbox: `narada want-mailbox <mailbox-id> [--posture draft-only]`
- Live workflow: `narada want-workflow <workflow-id>`
- Demo/trial: scope is pre-declared by `init-repo --demo`

For client-service mailbox onboarding, use the structured `want-mailbox` authoring path rather than direct config edits. A CPY-like setup can express mailbox user, correspondence scope, participant-domain admission across `from`/`sender`/`to`/`cc`/`bcc`, attachment/body/header policy, draft/send posture, and Site-local material note posture in one command:

```bash
narada want-mailbox support@client.example \
  --client-service \
  --scope-id client-correspondence \
  --mailbox-user-id support@client.example \
  --participant-domain client.example \
  --attachment-policy metadata_only \
  --body-policy text_only \
  --draft-send-posture draft-only \
  --material-notes-posture site_local_kb
```

Minimal mailbox operations remain valid: `narada want-mailbox help@example.com --posture draft-only` keeps the safe defaults and does not create client-service onboarding metadata.

**Required artifacts after this step:**

| Artifact | Purpose |
|----------|---------|
| `config/config.json` entry for the scope | Sources, context strategy, runtime, policy, charter config |
| `mailboxes/<id>/` or `workflows/<id>/` | Scope-owned operational directories |
| `mailboxes/<id>/README.md` | Scope metadata (charter, posture, folders) |

**Default posture (safe for first run):**
- `draft-only` — Narada drafts replies but never sends
- `support_steward` primary charter
- Human approval required
- `inbox` folder only

**Validation gate:** Scope entry exists in config and `scope_id` is unique.

### Step 3a: Bind Credential References

Credential onboarding is a capability crossing, not config editing. Record the credential reference and reuse provenance through a sanctioned command:

```bash
narada capability bind-credential \
  --site <site-id> \
  --principal <principal> \
  --kind graph.client_credentials \
  --credential-ref env:GRAPH_CLIENT_SECRET \
  --allow graph.token.request \
  --local-env GRAPH_CLIENT_SECRET \
  --by <principal>
```

The command records the reference, provenance, and local-material status without printing or storing the raw secret. Direct `.env` copying is manual recovery only; it is not the normal onboarding route.

### Step 3b: Bind System-Owned Tools (Optional)

If the operation needs to inspect or diagnose another system, bind to tools owned by that system repo. Do not copy those tools into the ops repo.

Example:

```text
~/src/sonar.cloud/.narada/tool-catalog.json   # system-owned tool implementations
~/src/narada.sonar/config/config.json         # operation-owned permission binding
```

See [`tool-catalog-binding.md`](tool-catalog-binding.md) for the binding contract.

**Validation gate:** tool catalogs resolve, requested tool IDs exist, and every bound tool declares an allowed authority class.

---

### Step 4: Validate Prerequisites

Verify the operation can run before attempting live execution.

**Commands:**
- `narada setup` — scaffold any missing directories
- `narada preflight <operation>` — readiness verification
- `narada explain <operation>` — inspect posture and consequences

**Validation gates (blocking vs non-blocking):**

| Check | Severity | Remediation |
|-------|----------|-------------|
| Config file exists | **Fail** | Re-run `init-repo` or create manually |
| Operation data root exists | **Fail** | Run `narada setup` |
| Graph API credentials present | **Fail** (live only) | Run `narada capability bind-credential` and provide referenced local secret material |
| Charter runtime credentials present | **Fail** (live only) | Run `narada capability bind-credential` and provide referenced local secret material |
| `.activated` marker exists | **Warn** | Run `narada activate <operation>` |
| `.env` file exists | **Warn** | Manual recovery only; canonical onboarding records credential references with `narada capability bind-credential` |
| Authority classes valid | **Fail** | Fix config policy bindings |

**Artifact:** `ReadinessReport` with `pass`/`warn`/`fail` per check.

---

### Step 5: Reach Runnable State

Activate the operation and start the daemon when ready.

**Commands:**
- `narada activate <operation>` — mark as live
- `pnpm daemon` — start the long-running daemon
- `narada runtime windows-startup install --site <site-root> --operation <operation-id> --mode separate-client-runtime --defer` — record desired Windows auto-start posture without hand-rolled Task Scheduler mutation

**Required artifacts after this step:**

| Artifact | Purpose |
|----------|---------|
| `<root_dir>/.activated` | Activation marker with timestamp |
| Running daemon process | Processes sync, work items, charters, outbound |

For a CPY-like client Site that should run as a separate Windows startup runtime, first use dry-run:

```bash
narada runtime windows-startup install \
  --site <client-site-root> \
  --operation <operation-id> \
  --mode separate-client-runtime \
  --credential-ref env:GRAPH_CLIENT_SECRET \
  --format json
```

The dry-run plan declares the authority locus, Windows Task Scheduler substrate, task name, command line, credential posture, log/PID/health paths, read-back checks, and uninstall/disable commands. If the Operator wants the posture but is not at the Windows runtime locus, record it as deferred:

```bash
narada runtime windows-startup install \
  --site <client-site-root> \
  --operation <operation-id> \
  --mode separate-client-runtime \
  --defer \
  --by <principal>
```

Inspect later with:

```bash
narada runtime windows-startup status --site <client-site-root> --operation <operation-id> --format json
```

**Validation gate:** `preflight` passes all blocking checks before activation.

---

## Path Diagrams

### Demo/Trial Path

```
express intent ──► init-repo --demo ──► (scope pre-declared) ──► setup ──► preflight ──► explain ──► activate ──► demo
```

### Live Path

```
express intent ──► init-repo ──► want-mailbox ──► setup ──► preflight ──► explain ──► activate ──► daemon
```

---

## Artifact Inspection

At any point after Step 2, you can inspect what the bootstrap has produced:

```bash
# List created artifacts
ls config/ mailboxes/ workflows/ logs/ knowledge/

# Inspect config validity
narada preflight <operation>

# Inspect posture and consequences
narada explain <operation>

# Inspect activation state
cat <root_dir>/.activated
```

---

## USC Construction Path (Separate)

The `narada init usc <path>` command initializes a USC-governed construction repo. This is a **separate path** for building charters, domain packs, and construction artifacts. It does not produce a runnable operation and is not part of this bootstrap contract.

If you need both an operation and a USC construction repo, run each path independently.

---

## Non-Goals of This Contract

- This contract does not cover fleet or multi-operation orchestration.
- This contract does not cover the full mailbox vertical proof (Task 285).
- This contract does not replace the kernel lawbook or semantics documents.
