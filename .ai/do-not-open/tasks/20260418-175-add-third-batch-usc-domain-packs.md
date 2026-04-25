# Task 175: Add Third Batch USC Domain Packs

## Context

Task 172 introduces the domain-pack architecture.

Task 173 adds:

- `saas`
- `workflow-automation`
- `ai-agent-operation`
- `data-pipeline`
- `internal-tools`

Task 174 adds:

- `marketplace`
- `crm`
- `inventory`
- `booking`
- `knowledge-base`

This task adds a third batch for operational, compliance, billing, analytics, and customer-facing systems.

Domain packs are reusable constructor knowledge. They are not concrete products.

## Goal

Add the next five domain packs to `narada.usc`:

```text
billing-subscriptions
analytics-dashboard
compliance-system
customer-portal
integration-hub
```

## Dependency

This task depends on Task 172.

If Task 172 is not complete, do not implement this task yet. Mark it blocked in normal task state. Do not create derivative status files.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Expected location:

```text
packages/domain-packs/<pack-name>/
```

Do not modify Narada runtime code.

## Required Domain Packs

### 1. `billing-subscriptions`

Covers billing, plans, subscriptions, usage, invoicing, and payment lifecycle systems.

Must include ambiguity families:

- pricing model
- plan/package structure
- subscription lifecycle
- trials/promotions/discounts
- usage metering
- invoices/receipts
- tax/VAT/GST
- payment methods and failures
- dunning/retry policy
- refunds/credits
- revenue recognition constraints
- integrations with accounting/CRM/product

Must not assume Stripe, usage-based pricing, or subscriptions by default.

### 2. `analytics-dashboard`

Covers metrics, dashboards, reporting, and decision-support systems.

Must include ambiguity families:

- metric definitions
- data sources
- dimensions/filters
- refresh cadence
- access control
- export/share requirements
- alerting
- historical backfill
- data quality
- ownership of metric semantics
- dashboard vs embedded analytics
- MVP dashboard/report set

Must not assume real-time analytics by default.

### 3. `compliance-system`

Covers compliance evidence, controls, audits, policy mapping, and retention systems.

Must include ambiguity families:

- compliance frameworks
- controls and evidence model
- evidence collection sources
- review/approval workflows
- retention policy
- audit trails
- access controls
- exceptions/risk acceptance
- reporting/export requirements
- ownership and attestation
- monitoring cadence
- scope boundary

Must not assume SOC 2, HIPAA, GDPR, or any framework unless specified.

### 4. `customer-portal`

Covers customer-facing self-service portals.

Must include ambiguity families:

- customer identity/auth
- account/profile management
- documents/files
- support requests
- billing visibility
- notifications
- permissions/delegated users
- integration with internal systems
- branding/localization
- auditability
- data privacy
- MVP self-service boundary

Must not assume customers can mutate account/billing data without approval.

### 5. `integration-hub`

Covers systems that connect APIs, sync data, transform payloads, and reconcile external systems.

Must include ambiguity families:

- source/target systems
- sync direction
- identity mapping
- schema transformation
- conflict resolution
- retry/idempotency
- rate limits
- reconciliation
- observability
- credentials/secrets
- backfills/replays
- failure semantics

Must not assume bidirectional sync or eventual consistency without explicit policy.

## Required Structure Per Pack

Follow the structure established by Task 172:

```text
packages/domain-packs/<pack>/
  package.json
  src/index.js
  src/refinement.js
  schemas/<pack>-context.schema.json
  templates/question-map.md
  examples/<pack>.refinement.json
```

If Task 172 establishes a different exact structure, follow it.

## Interface

Each pack should export a usable domain pack object:

```js
{
  id,
  name,
  detects(intent, context),
  refine(intent, context)
}
```

Refinement output must align with Task 171’s refinement schema if present.

## CLI Integration

If Task 171 and Task 172 are present, support:

```bash
usc refine --intent "I want billing subscriptions" --domain billing-subscriptions
usc refine --intent "I want analytics dashboard" --domain analytics-dashboard
usc refine --intent "I want compliance system" --domain compliance-system
usc refine --intent "I want customer portal" --domain customer-portal
usc refine --intent "I want integration hub" --domain integration-hub
```

Auto-detection should include these packs when confidence is high.

If refinement CLI is not present yet, export packs and document pending CLI integration.

## Documentation

Update domain-pack docs to list this third batch and explain their role.

Recommended:

```text
docs/domain-packs.md
```

## Non-Goals

- Do not generate product code.
- Do not make private/customer-specific decisions.
- Do not hardcode vendor choices.
- Do not call LLMs.
- Do not connect to Narada runtime.
- Do not create GitHub repositories.
- Do not add CI or GitHub Actions.
- Do not create derivative task status files.

## Acceptance Criteria

- All five packs exist.
- Each pack exports a domain pack object.
- Each pack includes ambiguity families, questions, seed tasks, and non-assumption discipline.
- Examples parse as JSON and validate if refinement schema exists.
- CLI can use `--domain <pack>` if refinement CLI is present.
- Docs list available packs.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

If refinement CLI is present:

```bash
cd /home/andrey/src/narada.usc
pnpm usc -- refine --intent "I want billing subscriptions" --domain billing-subscriptions --format json
pnpm usc -- refine --intent "I want analytics dashboard" --domain analytics-dashboard --format json
pnpm usc -- refine --intent "I want compliance system" --domain compliance-system --format json
pnpm usc -- refine --intent "I want customer portal" --domain customer-portal --format json
pnpm usc -- refine --intent "I want integration hub" --domain integration-hub --format json
pnpm validate
git status --short
```

If refinement CLI is not present:

```bash
cd /home/andrey/src/narada.usc
find packages/domain-packs -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
pnpm validate
git status --short
```

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- packs added
- CLI integration status
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
