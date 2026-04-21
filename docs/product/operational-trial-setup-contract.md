# Operational Trial Setup Contract

> Exact setup contract for running the `help@global-maxima.com` mailbox trial from the private operational repo against local Narada source packages.

---

## Operation Identity

| Field | Value |
|-------|-------|
| **Scope ID** | `help-global-maxima` |
| **Mailbox ID** | `help@global-maxima.com` |
| **Data root** | `/home/andrey/mailboxes/help-global-maxima` |
| **Config path** | `/home/andrey/src/narada.sonar/config/config.json` |
| **Primary charter** | `support_steward` |
| **Secondary charter** | `obligation_keeper` |
| **Charter runtime** | `kimi-api` (Moonshot AI) |
| **Outbound posture** | Draft-only — `allowed_actions` does not include `send_reply` |
| **Human approval** | `require_human_approval: false` (irrelevant because send is not allowed) |

---

## Repo Layout

### Public Source Repo

```
~/src/narada/
├── packages/
│   ├── domains/charters/
│   ├── layers/cli/
│   ├── layers/control-plane/
│   ├── layers/daemon/
│   ├── verticals/search/
│   └── ops-kit/
├── docs/
├── AGENTS.md
└── pnpm-workspace.yaml
```

### Private Operational Repo

```
~/src/narada.sonar/
├── config/
│   ├── config.json              # Live config (private)
│   └── config.example.json      # Template (private)
├── mailboxes/
│   └── help@global-maxima.com/
│       ├── knowledge/           # Mailbox-specific playbooks (empty; populate before trial)
│       ├── notes/               # Operator notes
│       └── scenarios/           # Canonical test scenarios
├── logs/                        # Command output logs
├── .env                         # Credentials (private, gitignored)
├── .env.example                 # Credential template
├── package.json                 # Narada package dependencies
└── pnpm-workspace.yaml          # Links narada packages into workspace
```

---

## Narada Consumption Model

Narada is consumed as **local source packages** via pnpm workspace links, not from the npm registry.

In `~/src/narada.sonar/package.json`:

```json
{
  "dependencies": {
    "@narada2/charters": "file:../narada/packages/domains/charters",
    "@narada2/cli": "file:../narada/packages/layers/cli",
    "@narada2/control-plane": "file:../narada/packages/layers/control-plane",
    "@narada2/daemon": "file:../narada/packages/layers/daemon",
    "@narada2/search": "file:../narada/packages/verticals/search"
  }
}
```

In `~/src/narada.sonar/pnpm-workspace.yaml`:

```yaml
packages:
  - "."
  - "../narada/packages/layers/*"
  - "../narada/packages/domains/*"
  - "../narada/packages/verticals/*"
  - "../narada/packages/ops-kit"
```

**Implication:** After any Narada source package is rebuilt (`pnpm build` in `~/src/narada`), the private repo may need `pnpm install` to sync file-link artifacts into its `node_modules`. If CLI commands fail with `ERR_MODULE_NOT_FOUND` for files that exist in `~/src/narada/packages/*/dist/`, run `pnpm install` in `~/src/narada.sonar`.

---

## Prerequisite Checklist

- [ ] `~/src/narada` packages are built (`pnpm build` in `~/src/narada`)
- [ ] `~/src/narada.sonar` dependencies are installed (`pnpm install` in `~/src/narada.sonar`)
- [ ] `~/src/narada.sonar/.env` is populated from `.env.example` with:
  - `GRAPH_TENANT_ID`
  - `GRAPH_CLIENT_ID`
  - `GRAPH_CLIENT_SECRET`
  - `NARADA_KIMI_API_KEY` (for live charter evaluation; omit for mock/offline)
- [ ] `~/src/narada.sonar/config/config.json` validates against schema
- [ ] Data directory `/home/andrey/mailboxes/help-global-maxima` exists (created by first sync if absent)
- [ ] Evidence directory exists (see below)

---

## Commands

All commands run from `~/src/narada.sonar`.

| Command | Purpose |
|---------|---------|
| `pnpm install` | Sync file links after Narada source rebuilds |
| `pnpm run:once` | One full cycle: sync → work admission → charter evaluation → intent handoff → draft creation → health update |
| `pnpm sync` | Sync only (no evaluation or draft creation) |
| `pnpm sync:dry` | Dry-run sync |
| `pnpm status` | Show operation status |
| `pnpm daemon` | Continuous loop (same as `run:once` but repeats) |

---

## Evidence Directory Convention

Trial evidence is captured in the private repo only. The public repo never contains trial artifacts, message bodies, or Graph identifiers.

**Path shape:**

```
~/src/narada.sonar/
└── evidence/
    └── <task-number>-<short-description>/
        ├── README.md              # What was tested, when, by whom
        ├── commands.log           # Copy of commands run
        ├── config-snapshot.json   # Redacted config (no secrets)
        ├── screenshots/           # UI or CLI screenshots
        ├── sql-dumps/             # Select query outputs from coordinator.db
        └── decisions/             # Exported decision records
```

**For this trial (Tasks 297–302):**

```
~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/
```

Create this directory in `narada.sonar` before starting the trial. The `README.md` inside it is the canonical trial log.

---

## Public / Private Boundary

| What | Public Repo (`narada`) | Private Repo (`narada.sonar`) |
|------|------------------------|-------------------------------|
| Source code | ✅ All packages | ❌ Never |
| Setup contract | ✅ This document | ❌ Never |
| Live config | ❌ Never | ✅ `config/config.json` |
| Credentials | ❌ Never | ✅ `.env` |
| Mailbox data | ❌ Never | ✅ `~/mailboxes/...` |
| Trial evidence | ❌ Never | ✅ `evidence/...` |
| Knowledge playbooks | ❌ Generic templates only | ✅ `mailboxes/.../knowledge/` |
| Scenarios | ❌ Generic fixtures only | ✅ `mailboxes/.../scenarios/` |

---

## Next Commands (for Tasks 298–302)

After this setup contract is satisfied, the next task can run:

```bash
cd ~/src/narada.sonar
pnpm run:once
```

This performs one full operational cycle. Evidence from that run belongs in `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/`.
