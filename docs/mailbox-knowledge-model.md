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

## Authority and Secrecy Boundaries

1. **Knowledge is non-authoritative.** Removing all knowledge sources must leave Narada's durable boundaries intact. The pipeline must still sync, evaluate, and create drafts; they may just be lower-quality drafts.

2. **Knowledge must not become a hidden authority path.** Charters consume knowledge through the envelope; they do not write to stores, mutate commands, or bypass the foreman based on knowledge content.

3. **Private data stays out of the public repo.** No customer names, internal URLs, credentials, or operational procedures belong in the `narada` repository. The repo may contain generic templates and the type contracts that describe how knowledge is bound.

4. **Future rich sources preserve the same boundary.** The type contracts for `url`, `sqlite`, and `local_path` sources are declared in `packages/domains/charters/src/types/knowledge.ts` but not yet implemented. When they are wired into retrieval, the same boundary must hold: retrieval happens in the materializer or a dedicated foreman layer, not inside charter prompts or runtime logic.

---

## Related Documents

- [`docs/first-operation-proof.md`](first-operation-proof.md) — Canonical product proof; see "Proof vs Knowledge" section
- [`docs/bootstrap-contract.md`](bootstrap-contract.md) — `init-repo` and `want-mailbox` create the `knowledge/` directory
- [`.ai/tasks/20260413-008-mailbox-charter-knowledge-sources.md`](../.ai/tasks/20260413-008-mailbox-charter-knowledge-sources.md) — Original knowledge source type spec
