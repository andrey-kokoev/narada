# Narada Quickstart

Choose the route that matches your goal. A first-time Windows user who wants a personal assistant should start with the User Site path. The operation paths below are for declaring governed work.

For the full bootstrap contract (artifact expectations, validation gates, and path diagrams), see [`docs/product/bootstrap-contract.md`](docs/product/bootstrap-contract.md).

## Install

### Windows User Site (recommended first install)

Prerequisite: Node.js 22 or newer.

Install the published CLI, provision the User Site, then run the bounded bootstrap check:

```powershell
npm install --global @narada2/cli
narada install windows-user-site
narada doctor --bootstrap
```

The default `minimal` profile installs the User Site, one `resident` assistant, and the normal operator-surface path. Use
the `advanced` profile only when you intentionally need Cloudflare, extra roles, MCP development, or Site administration:

```powershell
narada install windows-user-site --profile advanced
```

The profile records the optional capability families in the installation manifest; it does not silently create extra roles,
publish a remote Site, or enable unattended execution.

Start the credential-free demonstration first, or start the resident assistant:

```powershell
narada onboarding start --platform windows --scope user-site --demo
narada onboarding start --platform windows --scope user-site
```

The install command places the package-owned launcher at
`%USERPROFILE%\Narada\Start-NaradaWorkspace.ps1` and the provider-secret helpers under
`%USERPROFILE%\Narada\tools\operator-secrets`.

For a live provider, use `codex login` for the Codex subscription path, or configure an API provider with the installed
PowerShell helper. The helper uses the Windows SecretManagement/SecretStore vault and never prints the secret:

```powershell
Pwsh -File "$env:USERPROFILE\Narada\tools\operator-secrets\Set-NaradaProviderSecret.ps1" -Provider kimi-code-api -InstallModules
```

`narada doctor --bootstrap --format json` reports one row per supported provider. `demo` is ready without credentials;
`codex-subscription` requires the local Codex auth home; API providers report SecretStore presence or the exact setup action.
The doctor never prints secret values and does not perform a live provider request.

Then launch through the User Site launcher or the interactive launcher UI:

```powershell
Pwsh -File "$env:USERPROFILE\Narada\Start-NaradaWorkspace.ps1" -InteractiveSelectionUI
```

If the installation is incomplete, `narada doctor --bootstrap` reports one repair command:

```powershell
narada install windows-user-site --repair
```

### Advanced: source checkout (contributors)

The source checkout path is for Narada development, not required for ordinary User Site use:

```bash
git clone https://github.com/andrey-kokoev/narada.git
cd narada
pnpm install
pnpm build
```

## Personal User Site — first-time Windows path

This is the recommended starting point when you do not yet have a project, mailbox operation, or separate Site to configure.

From PowerShell:

```powershell
Pwsh -File "$env:USERPROFILE\Narada\Start-NaradaWorkspace.ps1" -Onboarding
```

Or, from an installed CLI:

```powershell
narada onboarding start --platform windows --scope user-site --interactive
```

The path locates or creates the User Site, starts one `resident` General assistant, and opens the available operator surface. Send one human request, then verify the first-use proof:

```powershell
narada onboarding status --scope user-site
```

The status should show a healthy resident session, successful identity hydration, admitted operator input, and a useful or explicit no-work response. Role expansion is optional and requires explicit approval. Use `narada demo` instead when you want to explore without credentials or live setup.

Detailed contract: [`docs/product/first-time-operator-success-path.md`](docs/product/first-time-operator-success-path.md#user-first-windows-onboarding-ux).

## Operation Paths

These paths are for shaping and running a governed operation. They are not prerequisites for the personal User Site path. Each maps to the five-step bootstrap contract.

### 1. Show me — zero setup

```bash
narada demo
```

See synthetic mailbox data and what Narada does with it. No credentials, no config, no files created.

**Contract mapping:** Step 1 only (express intent). No artifacts.

### 2. Try safely — near-real trial

```bash
narada init-repo --demo ~/src/my-tryout
cd ~/src/my-tryout
pnpm install
narada setup
narada preflight demo
narada explain demo
narada activate demo
narada demo
```

This creates a **non-live trial repo** with a mock-backed operation. You can explore the full shaping workflow — inspect, explain, activate — without touching any external system. The trial operation uses a non-live source and does not require Graph API credentials.

**Contract mapping:**
- Step 2: `init-repo --demo`
- Step 3: scope pre-declared (mock source, draft-only posture)
- Step 4: `setup`, `preflight demo`, `explain demo`
- Step 5: `activate demo`, `demo`

**Artifacts created:**
- `package.json`, `config/config.json`, `config/config.example.json`
- `.env.example`, `.gitignore`
- `mailboxes/`, `workflows/`, `logs/`, `knowledge/`
- `README.md` with trial-specific guidance

When you're ready to go live, declare a real mailbox and fill credentials (see step 3).

### 3. Go live — real mailbox operation

Prerequisites for the live path:

- A Microsoft Graph app registration (for mailbox access)
- A charter runtime API key (OpenAI-compatible or Kimi)

#### Step 2: Initialize repo

```bash
narada init-repo ~/src/my-helpdesk
cd ~/src/my-helpdesk
pnpm install
```

This creates:

- `package.json` — dependencies and scripts
- `config/config.json` — your live config (empty scopes)
- `config/config.example.json` — documented example
- `.env.example` — credential template
- `mailboxes/`, `workflows/`, `logs/`, `knowledge/` — operational directories
- `README.md` — first-run guide

#### Step 3: Declare your first mailbox operation

```bash
narada want-mailbox help@company.com
```

Defaults (safe for first run):

- **Posture**: `draft-only` — Narada drafts replies but never sends
- **Primary charter**: `support_steward`
- **Human approval**: required before any gated action
- **Folders**: `inbox` only

**Artifacts created:**
- Config entry for the scope
- `mailboxes/help@company.com/` with `scenarios/`, `knowledge/`, `notes/`

#### Step 4: Validate prerequisites

Scaffold directories:

```bash
narada setup
```

Add credentials:

```bash
cp .env.example .env
# edit .env
```

Required:

- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `KIMI_API_KEY` (or `OPENAI_API_KEY`)

Verify readiness:

```bash
narada preflight help@company.com
```

Output shows `pass` / `warn` / `fail` per check with actionable next steps. All **fail** items must be resolved before activation.

Understand what Narada will do:

```bash
narada explain help@company.com
```

Shows:

- Which charters are active
- The operation posture (`observe-only`, `draft-only`, `review-required`, or `autonomous`)
- Whether approval is required
- What the likely operational behavior is
- Why Narada is still blocked, if blocked

#### Step 5: Reach runnable state

Activate:

```bash
narada activate help@company.com
```

Activation marks the operation as live. It does **not** start the daemon or send mail. When the daemon runs, Narada will process activated operations.

Run:

```bash
pnpm daemon
```

Narada will:

1. Sync mailbox state
2. Admit new messages into the work queue
3. Run the primary charter against each context
4. Create durable draft proposals
5. Log activity to `logs/`

---

### 4. Site bootstrap — local runtime locus (optional)

If you prefer a Site-based model (one bounded Cycle per scheduled invocation) instead of a long-running daemon:

```bash
# After operation bootstrap (steps 1–3 above)
narada sites init local-help --substrate linux-user --operation help@company.com

# Set credentials
export NARADA_LOCAL_HELP_GRAPH_ACCESS_TOKEN="..."

# Validate
narada doctor --site local-help

# First Cycle
narada cycle --site local-help

# Enable supervisor (systemd, launchd, or Task Scheduler)
narada sites enable local-help

# Inspect
narada status --site local-help
narada ops --site local-help
```

See [`docs/product/site-bootstrap-contract.md`](docs/product/site-bootstrap-contract.md) for the full Site bootstrap contract.

## What's Next

- Read [`docs/product/bootstrap-contract.md`](docs/product/bootstrap-contract.md) for the canonical artifact and validation reference
- Read the [kernel lawbook](packages/layers/control-plane/docs/00-kernel.md) to understand the generalized architecture
- Browse [AGENTS.md](AGENTS.md) for contributor navigation
- Explore `.ai/do-not-open/tasks/` for design specs and future work
