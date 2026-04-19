# Task 174: Add Second Batch USC Domain Packs

## Context

Task 172 introduces the domain-pack architecture.

Task 173 adds the first high-value batch:

- `saas`
- `workflow-automation`
- `ai-agent-operation`
- `data-pipeline`
- `internal-tools`

This task adds a second batch of broadly useful domain packs.

Domain packs are reusable constructor knowledge. They are not concrete products.

## Goal

Add the next five high-value domain packs to `narada.usc`:

```text
marketplace
crm
inventory
booking
knowledge-base
```

These cover common user intents while staying general enough for reusable refinement and planning.

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

### 1. `marketplace`

Covers buyer/seller marketplace systems.

Must include ambiguity families:

- marketplace type: goods, services, rentals, labor, digital products
- buyer/seller roles
- listing model
- search/discovery
- payments and escrow
- commissions/fees
- trust and safety
- disputes/refunds
- onboarding/KYC if needed
- moderation
- fulfillment or service delivery
- geographic/legal constraints
- MVP liquidity strategy

Must not assume two-sided payments, escrow, or a specific payment provider by default.

### 2. `crm`

Covers customer relationship management systems.

Must include ambiguity families:

- contacts/accounts/leads/opportunities ontology
- pipeline stages
- sales process
- activity tracking
- ownership and assignment
- permissions
- imports/migration
- email/calendar integrations
- reporting and forecasting
- automation rules
- data quality/deduplication
- MVP boundary

Must not assume sales-led CRM only; support service/account-management variants.

### 3. `inventory`

Covers inventory and stock-control systems.

Must include ambiguity families:

- SKU/item model
- warehouses/locations
- stock movements
- purchasing/receiving
- adjustments and cycle counts
- lots/serial numbers/expiration
- reservations/allocation
- reorder rules
- audit trail
- integrations with sales/procurement/accounting
- valuation/costing requirements
- MVP location/SKU boundary

Must not assume FIFO/LIFO/weighted-average costing without explicit policy.

### 4. `booking`

Covers booking, scheduling, appointment, and reservation systems.

Must include ambiguity families:

- bookable resource type
- availability model
- calendar/time zone rules
- booking lifecycle
- cancellation/reschedule policy
- payments/deposits
- reminders/notifications
- capacity/overbooking
- staff/resource assignment
- customer self-service vs operator booking
- integrations with calendar/payment/CRM
- MVP resource/service boundary

Must not assume payments are required or that customers self-book.

### 5. `knowledge-base`

Covers knowledge-base, documentation, and retrieval systems.

Must include ambiguity families:

- source types
- authority/source-of-truth hierarchy
- ingestion/update cadence
- content model
- chunking/indexing strategy
- search/retrieval requirements
- citations/provenance
- permissions/access control
- freshness/staleness policy
- editorial workflow
- feedback/correction loop
- integration with agents/support/workflows

Must not assume RAG/LLM use; plain search/documentation is valid.

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
usc refine --intent "I want marketplace" --domain marketplace
usc refine --intent "I want CRM" --domain crm
usc refine --intent "I want inventory system" --domain inventory
usc refine --intent "I want booking system" --domain booking
usc refine --intent "I want knowledge base" --domain knowledge-base
```

Auto-detection should include these packs when confidence is high.

If refinement CLI is not present yet, export packs and document pending CLI integration.

## Documentation

Update domain-pack docs to list this second batch and explain their role.

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
pnpm usc -- refine --intent "I want marketplace" --domain marketplace --format json
pnpm usc -- refine --intent "I want CRM" --domain crm --format json
pnpm usc -- refine --intent "I want inventory system" --domain inventory --format json
pnpm usc -- refine --intent "I want booking system" --domain booking --format json
pnpm usc -- refine --intent "I want knowledge base" --domain knowledge-base --format json
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
