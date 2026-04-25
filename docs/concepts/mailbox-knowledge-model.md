# Mailbox Knowledge Model

> Where knowledge lives, how it reaches the charter runtime, and what separates domain capability from pipeline proof.

---

## Placement Model

Mailbox support quality depends on three distinct layers. Keeping them separate prevents operational data from leaking into the product repository and prevents product code from assuming domain-specific content.

### Layer 1: Public Repo — Contracts and Types

The `narada` repository defines **how** knowledge is declared, passed, and consumed. It does not contain domain knowledge itself.

| What Lives Here | Examples |
|-----------------|----------|
| Knowledge source types | `KnowledgeSourceRef`, `KnowledgeItem` (`packages/domains/charters/src/types/knowledge.ts`) |
| Materializer contract | `MailboxContextMaterializer` loads `<rootDir>/knowledge/*.md` |
| Charter prompt templates | `SUPPORT_STEWARD_TEMPLATE` references knowledge sources abstractly |
| Proof fixtures | Minimal knowledge for pipeline verification only |

### Layer 2: Private Ops Repo — Domain Knowledge

Each operation's private repository holds the **actual content** that makes support good. This is deployment-specific, mutable, and operational.

| What Lives Here | Examples |
|-----------------|----------|
| Playbooks | `mailboxes/<mailbox>/knowledge/*.md` |
| Scenarios | `mailboxes/<mailbox>/scenarios/*.md` |
| Operator notes | `mailboxes/<mailbox>/notes/*.md` |
| Live config | `config/config.json` (binds charter to scope) |

**Currently implemented:** The `MailboxContextMaterializer` reads every `.md` file in `<rootDir>/knowledge/` and passes it into the charter invocation envelope as `knowledge_sources: Array<{name, content}>`. There is no assumption about file naming or internal structure; the charter prompt instructs the runtime to treat these as operational playbooks.

**Declared but not yet implemented:** The `packages/domains/charters/src/types/knowledge.ts` module defines richer source types (`url`, `sqlite`, `local_path`) and a normalized `KnowledgeItem` contract. These types exist for future binding but are not yet wired into the materializer, config schema, or foreman retrieval path.

### Layer 3: Charter Runtime — Consumption

The charter runtime receives knowledge opaquely through `context_materialization`. It does not fetch sources directly. The materializer owns retrieval; the charter owns interpretation.

**Current flow:**

```
ops-repo knowledge/*.md
        ↓
MailboxContextMaterializer.loadKnowledgeSources()
        ↓
CharterInvocationEnvelope.context_materialization.knowledge_sources
        ↓
System prompt (charter-specific template)
        ↓
Charter output (classifications, proposed actions)
```

**Future flow (types declared, not implemented):**

```
Config-bound knowledge sources (url / sqlite / local_path)
        ↓
Dedicated retrieval subsystem (not yet built)
        ↓
Normalized KnowledgeItem[]
        ↓
Materializer or foreman injects into envelope
        ↓
Charter runtime consumes
```

---

## Proof vs Knowledge

### Pipeline Proof

Pipeline proof answers: *"Can Narada run the mailbox vertical correctly?"*

- It needs **minimal** knowledge — just enough to verify the materializer passes content through the envelope.
- Fixture-backed tests use a one-line playbook (`"Login issues: ask for email."`).
- The proof is about wiring, not about support quality.

### Domain Knowledge

Domain knowledge answers: *"Does the support charter have the information it needs to give good answers?"*

- It is **deployment-specific** — login-reset procedures for SaaS A differ from ecommerce B.
- It improves over time as operators add playbooks, FAQs, and escalation criteria.
- It has **no effect** on whether Narada's pipeline stages execute correctly.

| Concern | Pipeline Proof | Domain Knowledge |
|---------|---------------|------------------|
| Lives in public repo | ✅ Minimal fixtures | ❌ Never |
| Lives in private ops repo | ❌ Not needed | ✅ Playbooks, scenarios |
| Required for tests to pass | ✅ | ❌ |
| Required for good support | ❌ | ✅ |
| Changes with product releases | ✅ | ❌ |
| Changes with operational experience | ❌ | ✅ |

---

## Compact Support Playbook Examples

The following examples show the shape and signal density of effective knowledge artifacts. They are templates, not universal truths. Replace them with domain-specific content.

### Example 1: Login and Access Issues

```markdown
# Playbook: Login and Access Issues

## Diagnostic Flow

1. Confirm the email address the customer is using.
2. Ask whether they see an error message or a blank screen.
3. Suggest password reset via the standard flow.
4. If reset fails, check for account lockout (escalate to engineering).
5. If 2FA is enabled, verify they have access to their authenticator.

## Escalation Criteria

- Multiple users reporting the same issue → possible outage.
- Account shows suspicious activity → security escalation.
- VIP customer → fast-track to engineering (SLA: 15 min).

## What Not To Say

- Do not promise a specific resolution time.
- Do not share internal system architecture details.
- Do not ask for passwords or credentials.
```

### Example 2: Billing Questions

```markdown
# Playbook: Billing Questions

## Scope

We can help with:
- Invoice requests and clarifications
- Payment method updates
- Refund eligibility (first 14 days, no usage)

We cannot help with:
- Tax advice
- Custom pricing negotiations (escalate to sales)
- Chargeback disputes (escalate to finance)

## Refund Checklist

1. Verify purchase date is within 14 days.
2. Verify no significant usage occurred.
3. If eligible, draft a polite confirmation and timeline.
4. If ineligible, explain policy kindly and offer alternatives.

## Tone

- Billing is sensitive; be extra clear and courteous.
- Use line items from the invoice when referencing charges.
```

### Example 3: Escalation-Worthy Complaints

```markdown
# Playbook: Escalation-Worthy Complaints

## Immediate Escalation

- Legal threat or mention of lawyer/regulator
- Data breach or privacy concern
- Customer explicitly requests manager/supervisor

## Urgent Escalation (within 1 hour)

- Repeated failures with no resolution path
- High-value account expressing churn risk
- Security-related issue (unauthorized access, phishing)

## Draft Guidelines

- Acknowledge severity immediately.
- Do not minimize the customer's concern.
- State clearly that the issue is being escalated to the appropriate team.
- Provide a realistic expectation for follow-up (not a guarantee).
```

---

## Knowledge Lifecycle

Knowledge is not static. It evolves with the operation. The lifecycle has four phases:

### Seed

Created at operation bootstrap (`init-repo` → `want-mailbox`). The initial `knowledge/` directory contains a minimal playbook so the charter can produce a coherent first evaluation. Seed knowledge is intentionally thin — just enough to avoid nonsense output, not enough to handle edge cases.

### Accumulate

Over days and weeks, operators add playbooks, FAQs, and scenario notes based on real conversations. This is the primary mechanism by which support quality improves. Accumulation is additive: new files are picked up automatically on the next Cycle because the materializer reads the filesystem at invocation time.

**Durability guarantee:** Knowledge files live on the operator's filesystem (or in the private ops repo), not in SQLite, the coordinator DB, or Durable Object state. Restarts, crashes, `narada recover`, and DO migrations do not affect them. The only loss vector is filesystem-level data loss, which is outside Narada's scope.

### Expire

Knowledge becomes stale: products change, procedures are retired, escalation contacts move. There is currently no automatic expiration mechanism. Operators must manually review and remove or update stale files. A reasonable hygiene practice is to prefix files with a date or version and review quarterly.

### Archive

Old knowledge should be moved out of `knowledge/` (e.g., to `knowledge/archive/`) rather than deleted, so the materializer stops loading it but the content remains available for reference. The materializer only scans `knowledge/*.md`; subdirectories are ignored unless explicitly configured otherwise.

---

### Per-Context Scoping

**Current behavior:** All `.md` files in `knowledge/` are loaded into every `CharterInvocationEnvelope` for the operation. There is no filtering by `context_id`, mailbox, or vertical. This is simple and correct for single-mailbox operations.

**Future scoping:** When multi-mailbox or multi-vertical operations become common, knowledge will need per-context binding. The type contracts in `packages/domains/charters/src/types/knowledge.ts` (`KnowledgeSourceRef` with `scope`, `vertical`, `context_filter` fields) are declared for this purpose but not yet wired into the materializer. Until then, operators with multiple contexts should either:
- Use separate ops repos (recommended), or
- Prefix knowledge files with context identifiers and accept that all knowledge is loaded for all contexts (wastes tokens but is safe).

---

## Knowledge in the Durable State

Knowledge is not limited to playbook files. The control plane itself accumulates durable knowledge about every context through the Cycle pipeline. These structures are authoritative, replay-stable, and survive restarts.

### Core Knowledge-Carrying Entities

| Entity | Table / Store | What It Knows | Durability |
|--------|---------------|---------------|------------|
| **`context_record`** | `context_records` (coordinator) | `context_id`, `scope_id`, primary charter binding, current status, `last_activity_at`, `last_evaluated_at` | Survives restarts, recoveries, and `narada recover` |
| **`context_revision`** | `context_revisions` (coordinator) | Deterministic snapshot of a context at a point in time: fact summary, participant hashes, message count, revision ordinal | Append-only; historical revisions are retained for audit |
| **`evaluation`** | `evaluations` (coordinator) | Charter output: proposed actions, rationale, confidence, tool requests, outcome classification | Durable trace of intelligence output per execution attempt |
| **`decision`** | `foreman_decisions` (coordinator) | Governance outcome: accept / reject / escalate / no-op, approved payload, foreman rationale | Append-only authority record; binds evaluation to intent |
| **`fact`** | Fact store (SQLite / filesystem) | Normalized, content-addressed record of every observed change (`mail.message.discovered`, `mail.message.updated`, etc.) | First canonical durable boundary; all replay determinism derives from fact identity |

### How Knowledge Is Retrieved

**Static knowledge** (playbooks, scenarios) is retrieved by the `MailboxContextMaterializer` at charter invocation time:

1. Materializer reads `knowledge/*.md` from the ops repo filesystem.
2. Content is injected into `CharterInvocationEnvelope.context_materialization.knowledge_sources`.
3. The charter runtime interprets this opaquely — it does not fetch sources directly.

**Dynamic knowledge** (conversation history, prior evaluations, decisions) is retrieved from durable stores:

1. The `ContextFormationStrategy` selects relevant facts for a `context_id` from the fact store.
2. Foreman admission loads `context_record` and the latest `context_revision` to build the `PolicyContext`.
3. The scheduler passes `context_id` and `scope_id` to the charter runner.
4. The charter envelope may include recent message summaries, prior evaluation rationales, and decision outcomes — all sourced from the durable observation layer.

**Key invariant:** The charter runtime is a read-only sandbox. It may read the envelope but never writes to the coordinator, outbound, or fact stores directly.

---

## Knowledge Updates During a Cycle

Each step of the Nine-Layer Pipeline may read, accumulate, or transform knowledge. The following table maps every step to its knowledge role for the mailbox vertical.

| Pipeline Step | Knowledge Read | Knowledge Written | Notes |
|---------------|----------------|-------------------|-------|
| **Source** (Graph API pull) | Delta token (cursor) | New raw records | No domain knowledge yet; only opaque checkpoint advancement |
| **Fact** (normalize + ingest) | Raw Graph records | `fact` rows (content-addressed) | Deterministic normalization produces identical `fact_id` for identical input |
| **Context** (formation) | `fact` rows for `context_id` | `context_revision` (new ordinal if material change detected) | Revision captures the "shape" of the context at this moment |
| **Work** (foreman admission) | `context_record`, latest `context_revision` | `work_item` (opened or superseded) | Work item carries `opened_for_revision_id`, linking it to a specific context snapshot |
| **Policy** (charter evaluation) | `CharterInvocationEnvelope` (includes static knowledge + dynamic context summary) | `evaluation` (charter output) | Intelligence-Authority Separation: evaluation is evidence, not authority |
| **Policy** (foreman resolve) | `evaluation`, runtime policy, `context_record` | `decision` (governance outcome) | Decision is the authority boundary; no intent without a decision |
| **Intent** (handoff) | `decision` | `intent` + `outbound_handoff` | Universal durable effect boundary; idempotency enforced at `idempotency_key` |
| **Execution** (outbound worker) | `outbound_command` payload | `outbound_version` transitions, Graph draft mutations | Worker owns mechanical effect; does not interpret knowledge |
| **Confirmation** (reconciler) | Graph API query (observed remote state) | `submitted` → `confirmed` (or `failed`) | Binds external effect back to durable state |
| **Observation** (UI / CLI) | All durable stores | None (read-only projection) | `narada ops`, `narada show`, and daemon GET routes derive from this layer |

### Durability Across Cycles

- **Static knowledge** (playbooks) lives on the filesystem. Restarts, crashes, and `narada recover` do not affect it.
- **Dynamic knowledge** (facts, contexts, evaluations, decisions) lives in durable stores (SQLite coordinator, fact store, outbound store). These are committed before any cursor advancement or lease release.
- **Transient state** (active leases, in-flight execution attempts, in-memory cursor caches) is *not* durable. A restart clears these. The scheduler reclaims expired leases; the runner restarts execution attempts.
- **Observation** (UI read models, traces) is non-authoritative. It may be rebuilt via `narada rebuild-projections` without affecting correctness.

### Per-Context Scoping

**Current behavior:** All `.md` files in `knowledge/` are loaded into every `CharterInvocationEnvelope` for the operation. There is no filtering by `context_id`, mailbox, or vertical. This is simple and correct for single-mailbox operations.

**Future scoping:** When multi-mailbox or multi-vertical operations become common, knowledge will need per-context binding. The type contracts in `packages/domains/charters/src/types/knowledge.ts` (`KnowledgeSourceRef` with `scope`, `vertical`, `context_filter` fields) are declared for this purpose but not yet wired into the materializer. Until then, operators with multiple contexts should either:
- Use separate ops repos (recommended), or
- Prefix knowledge files with context identifiers and accept that all knowledge is loaded for all contexts (wastes tokens but is safe).

---

## Authority and Secrecy Boundaries

1. **Knowledge is non-authoritative.** Removing all knowledge sources must leave Narada's durable boundaries intact. The pipeline must still sync, evaluate, and create drafts; they may just be lower-quality drafts.

2. **Knowledge must not become a hidden authority path.** Charters consume knowledge through the envelope; they do not write to stores, mutate commands, or bypass the foreman based on knowledge content.

3. **Private data stays out of the public repo.** No customer names, internal URLs, credentials, or operational procedures belong in the `narada` repository. The repo may contain generic templates and the type contracts that describe how knowledge is bound.

4. **Future rich sources preserve the same boundary.** The type contracts for `url`, `sqlite`, and `local_path` sources are declared in `packages/domains/charters/src/types/knowledge.ts` but not yet implemented. When they are wired into retrieval, the same boundary must hold: retrieval happens in the materializer or a dedicated foreman layer, not inside charter prompts or runtime logic.

---

## Related Documents

- [`docs/product/first-operation-proof.md`](../product/first-operation-proof.md) — Canonical product proof; see "Proof vs Knowledge" section
- [`docs/product/bootstrap-contract.md`](../product/bootstrap-contract.md) — `init-repo` and `want-mailbox` create the `knowledge/` directory
- [`.ai/do-not-open/tasks/20260413-008-mailbox-charter-knowledge-sources.md`](../../.ai/do-not-open/tasks/20260413-008-mailbox-charter-knowledge-sources.md) — Original knowledge source type spec
