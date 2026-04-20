# Narada Quickstart

Three paths from zero to a running operation: show me, try safely, go live.

For the full bootstrap contract (artifact expectations, validation gates, and path diagrams), see [`docs/bootstrap-contract.md`](docs/bootstrap-contract.md).

## Install

```bash
pnpm add -g @narada2/cli
```

Or, if working from source:

```bash
git clone https://github.com/andrey-kokoev/narada.git
cd narada
pnpm install
pnpm build
```

## First-Run Paths

Narada offers three entry paths, ordered from safest to live. Each maps to the five-step bootstrap contract.

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
- `NARADA_KIMI_API_KEY` (or `NARADA_OPENAI_API_KEY`)

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

## What's Next

- Read [`docs/bootstrap-contract.md`](docs/bootstrap-contract.md) for the canonical artifact and validation reference
- Read the [kernel lawbook](packages/layers/control-plane/docs/00-kernel.md) to understand the generalized architecture
- Browse [AGENTS.md](AGENTS.md) for contributor navigation
- Explore `.ai/tasks/` for design specs and future work
