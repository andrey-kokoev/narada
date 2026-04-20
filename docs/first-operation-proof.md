# First Operation Product Proof

> The canonical end-to-end proof that Narada supports a real mailbox operation from stored facts through evaluation to draft proposal and operator review.

This document defines the first mailbox operation as Narada's canonical product proof. It specifies what is proven, how to run the proof, and what requires live exercise.

---

## Canonical Proof Case

**Operation:** Support mailbox (`help@global-maxima.com`)  
**Charter:** `support_steward`  
**Posture:** `draft-only` (safe default)  
**Fixture:** Alice Customer can't log in (`support-thread-login-issue`)

### Operation Shape

```json
{
  "scope_id": "help@global-maxima.com",
  "root_dir": "./data/help-at-global-maxima-com",
  "sources": [{ "type": "graph", "user_id": "help@global-maxima.com" }],
  "context_strategy": "mail",
  "scope": {
    "included_container_refs": ["inbox"],
    "included_item_kinds": ["message"]
  },
  "charter": { "runtime": "codex-api" },
  "policy": {
    "primary_charter": "support_steward",
    "allowed_actions": ["draft_reply", "mark_read", "set_categories", "no_action"],
    "require_human_approval": true
  }
}
```

### Charter Profile

The `support_steward` charter is a dedicated system prompt (not a generic fallback):

- **Role:** Support steward for the declared mailbox
- **Tone:** Professional but warm, concise, empathetic, clear
- **Boundaries:** Draft-only (never proposes `send_reply`), no promises the business cannot keep, escalate when needed
- **Draft instructions:** Acknowledge issue, ask clarifying questions, provide next steps, sign off with domain
- **Knowledge sources:** Uses playbooks from `<rootDir>/knowledge/` when relevant

### Expected Operator Loop

1. Customer sends email to support mailbox
2. Narada syncs the message, creates a fact, opens a work item
3. Charter evaluates the context and proposes a `draft_reply`
4. Foreman creates an outbound command (with `require_human_approval: true`, the decision is `pending_approval`)
5. Operator inspects the draft via CLI (`narada show --type decision`) or UI
6. Operator approves or rejects the draft
7. On approval, send-reply worker creates the Graph draft; on rejection, command is cancelled

---

## Fixture-Backed Proof

The fixture-backed proof runs entirely without live credentials. It uses a synthetic message fixture and mock charter runner to prove the full pipeline.

### What It Proves

| Pipeline Stage | Proven By |
|----------------|-----------|
| Sync → Normalize → Project | `sync-lifecycle.test.ts` (mock adapter, file-backed stores) |
| Source Record → Fact | `exchange-to-facts.test.ts` (deterministic fact identity) |
| Fact → Context Formation → Work Item | `fact-admission.test.ts`, `generalized-work.test.ts` |
| Scheduler Lease → Execution Attempt | `smoke-test.test.ts`, `dispatch.test.ts` |
| Charter Evaluation | `smoke-test.test.ts` (custom runner), `dispatch-real.test.ts` (mocked API) |
| Foreman Decision → Outbound Handoff | `smoke-test.test.ts`, `outbound-idempotency.test.ts` |
| Send-Reply Worker → Draft Creation | `smoke-test.test.ts` (mock Graph client) |

### How to Run

```bash
# Full fixture-backed smoke test (proves pipeline through draft creation)
pnpm test:control-plane -- test/integration/live-operation/smoke-test.test.ts

# Pipeline-focused proof (proves through outbound command creation)
pnpm test:control-plane -- test/integration/live-operation/draft-proposal-pipeline.test.ts

# Daemon-level dispatch proof (proves scheduler + execution + foreman resolution)
pnpm test:daemon -- test/integration/dispatch.test.ts
```

### Expected Outputs

The smoke test asserts every durable record in the pipeline:

- `context_records` — context created with primary charter
- `context_revisions` — revision ordinal advanced
- `work_items` — opened, then `leased`, then `executing`, then `resolved`
- `execution_attempts` — started and completed
- `evaluations` — charter output persisted
- `foreman_decisions` — decision recorded with `approved_action: "draft_reply"`
- `outbound_handoffs` + `outbound_versions` — command and version created
- `managed_drafts` — draft record linked to outbound version
- `outbound_transitions` — state transitions logged

Two modes are verified:
1. **Full pipeline** (`require_human_approval: false`): reaches `confirmed` status
2. **Safe posture** (`require_human_approval: true`): stops at `pending_approval`, no outbound command created

---

## Live-Backed Proof

The live-backed proof exercises the same pipeline against real Graph API and a real charter runtime. It requires:

### Prerequisites

- Microsoft Graph app registration (tenant, client, secret)
- Charter runtime API key (OpenAI or Kimi)
- Private ops repo initialized via `narada init-repo`

### What Requires Live Exercise

| Capability | Fixture Coverage | Live Required? | Why |
|------------|------------------|----------------|-----|
| Message normalization | Mock adapter | **Yes** | Real Graph API message shapes vary |
| Sync pagination | Mock cursor | **Yes** | Real delta tokens and pagination |
| Attachment handling | Mock payloads | **Yes** | Real attachment download / storage |
| Charter output quality | Hardcoded runner | **Yes** | LLM output is non-deterministic |
| Graph draft creation | Mock client | **Yes** | Real `createDraft` API call |
| Draft content verification | Mock getDraft | **Yes** | Real draft content hashing |
| Inbound reconciliation | N/A | **Yes** | Observing sent draft as new message |
| Health / readiness probes | Simulated | **Yes** | Real process and filesystem state |

### Live Verification Commands

```bash
# 1. Check readiness (blocking vs non-blocking)
narada preflight help@global-maxima.com

# 2. Inspect posture and consequences
narada explain help@global-maxima.com

# 3. Run a single sync (dry-run first)
narada sync --mailbox help@global-maxima.com --dry-run
narada sync --mailbox help@global-maxima.com

# 4. Inspect evaluations, decisions, executions
narada show evaluation <evaluation-id> --operation help@global-maxima.com
narada show decision <decision-id> --operation help@global-maxima.com
narada show execution <execution-id> --operation help@global-maxima.com

# 5. Review draft proposals
narada status
```

---

## Fixture vs Live: Explicit Separation

| Responsibility | Fixture-Backed | Live-Backed |
|----------------|---------------|-------------|
| **Pipeline correctness** | ✅ Proven by integration tests | ✅ Exercised by live sync |
| **Idempotency & replay** | ✅ Proven by crash-replay tests | ✅ Observed in production |
| **Charter governance** | ✅ Proven (mock runner) | ✅ Verified (real LLM) |
| **Draft creation** | ✅ Proven (mock Graph client) | ✅ Requires real Graph API |
| **Message normalization** | ✅ Proven (mock shapes) | ✅ Required for real data |
| **LLM output quality** | ❌ Hardcoded | ✅ Real charter runtime |
| **Attachment download** | ❌ Not tested | ✅ Real Graph API |
| **Pagination / delta tokens** | ❌ Mock cursor | ✅ Real delta protocol |
| **Inbound reconciliation** | ❌ Not tested | ✅ Observes sent draft as new message |
| **Operator review loop** | ✅ Proven (approval gate) | ✅ Real UI / CLI disposition |

**Rule:** The fixture-backed proof demonstrates that the pipeline is mechanically correct. The live-backed proof demonstrates that the pipeline works with real data and real APIs. Neither substitutes for the other.

---

## Inspection Checkpoints

At each stage of the pipeline, you can inspect state:

### After Sync

```bash
# Message persisted?
ls <rootDir>/messages/<message-id>/record.json

# Cursor advanced?
cat <rootDir>/cursor.json

# Health file updated?
cat <rootDir>/.health.json
```

### After Fact Admission

```bash
# Facts in coordinator DB
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT fact_type, context_id, payload_json FROM facts;"

# Work items opened?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT work_item_id, context_id, status FROM work_items;"
```

### After Charter Evaluation

```bash
# Evaluation persisted?
narada show --type evaluation --id <evaluation-id>

# Or query directly
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT evaluation_id, outcome, summary FROM evaluations;"
```

### After Foreman Decision

```bash
# Decision recorded?
narada show --type decision --id <decision-id>

# Outbound command created?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT command_id, action_type, status FROM outbound_handoffs;"
```

### After Draft Creation

```bash
# Managed draft exists?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT draft_id, outbound_id, graph_draft_id FROM managed_drafts;"

# Outbound transitions logged?
sqlite3 <rootDir>/.narada/coordinator.db \
  "SELECT command_id, from_status, to_status, occurred_at FROM outbound_transitions;"
```

---

## Public Repo vs Private Ops Repo

| Concern | Public Repo (`narada`) | Private Ops Repo |
|---------|------------------------|------------------|
| **Source code** | ✅ All packages, tests, fixtures | ❌ Never |
| **Proof execution** | ✅ Run fixture-backed tests | ❌ Not needed |
| **Live config** | ❌ Never | ✅ `config/config.json` |
| **Credentials** | ❌ Never | ✅ `.env` |
| **Operational data** | ❌ Never | ✅ `mailboxes/`, `logs/` |
| **Knowledge sources** | ❌ Generic templates only | ✅ Domain-specific playbooks |
| **Charter runtime** | ❌ Mock / test runners | ✅ Real `codex-api` or `kimi-api` |

The fixture-backed proof lives in the public repo and can be run by anyone. The live-backed proof lives in a private ops repo and requires real credentials.

---

## Non-Goals of This Proof

- This proof does not claim autonomous send is safe. Default posture is `draft-only` with human approval required.
- This proof does not cover multi-vertical operations (timer, webhook, filesystem). Mailbox is the first proven vertical.
- This proof does not cover production UI polish, real-time updates, or analytics.
- This proof does not cover generalized knowledge-base RAG. Knowledge source injection exists; full RAG is deferred.
