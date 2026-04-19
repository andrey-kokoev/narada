# Task 177: Add Fifth Batch USC Domain Packs

## Context

Task 172 introduces the domain-pack architecture. Tasks 173-176 add earlier batches.

This task adds domain packs for field operations, healthcare-like scheduling/records, real-estate, project management, and notification systems.

Domain packs are reusable constructor knowledge. They are not concrete products.

## Goal

Add five domain packs:

```text
field-service
healthcare-ops
real-estate
project-management
notifications-messaging
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

### 1. `field-service`

Covers dispatch, work orders, technicians, site visits, and mobile field operations.

Must include ambiguity families:

- service types
- customers/sites/assets
- work order lifecycle
- dispatch/scheduling
- technician skills/availability
- mobile/offline needs
- parts/inventory
- photos/signatures/forms
- SLA and priority
- billing/invoicing
- routing/geography
- integrations with CRM/ERP/inventory

Must not assume real-time dispatch or mobile app requirement without explicit policy.

### 2. `healthcare-ops`

Covers healthcare-adjacent operations such as appointments, patient workflows, referrals, and records coordination.

Must include ambiguity families:

- patient/client identity
- appointments/referrals/care episodes
- provider/staff roles
- scheduling and reminders
- records/documents
- consent/privacy
- compliance framework
- billing/insurance if applicable
- clinical vs administrative boundary
- integrations with EHR/EMR/labs
- audit trail
- MVP workflow boundary

Must not assume clinical decision support or HIPAA unless specified.

### 3. `real-estate`

Covers property, leasing, listings, transactions, tenant/owner portals, and property operations.

Must include ambiguity families:

- property/listing/lease/tenant ontology
- residential vs commercial
- listing workflow
- applications/screening
- lease lifecycle
- payments/deposits
- maintenance requests
- document management
- broker/agent/owner roles
- compliance/jurisdiction
- integrations with MLS/accounting/payment
- MVP transaction/operations boundary

Must not assume sales vs rentals by default.

### 4. `project-management`

Covers task/project/portfolio systems and delivery coordination.

Must include ambiguity families:

- task/project/work item ontology
- hierarchy and dependencies
- statuses/workflows
- assignment/ownership
- planning cadence
- estimates/capacity
- permissions
- notifications
- reporting
- integrations with code/docs/chat
- review/approval gates
- MVP methodology boundary

Must not assume agile/scrum semantics by default.

### 5. `notifications-messaging`

Covers notification, messaging, broadcast, and user communication systems.

Must include ambiguity families:

- channels
- message types/templates
- audience/recipient model
- consent/preferences
- delivery guarantees
- retries/failures
- scheduling/throttling
- personalization
- audit/logging
- provider integrations
- compliance/opt-out rules
- analytics/deliverability

Must not assume email-only, SMS-only, or push-only by default.

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

Each pack should export:

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
usc refine --intent "I want field service system" --domain field-service
usc refine --intent "I want healthcare operations system" --domain healthcare-ops
usc refine --intent "I want real estate platform" --domain real-estate
usc refine --intent "I want project management system" --domain project-management
usc refine --intent "I want notifications messaging system" --domain notifications-messaging
```

Auto-detection should include these packs when confidence is high.

## Documentation

Update `docs/domain-packs.md` or equivalent to list this batch.

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
pnpm usc -- refine --intent "I want field service system" --domain field-service --format json
pnpm usc -- refine --intent "I want healthcare operations system" --domain healthcare-ops --format json
pnpm usc -- refine --intent "I want real estate platform" --domain real-estate --format json
pnpm usc -- refine --intent "I want project management system" --domain project-management --format json
pnpm usc -- refine --intent "I want notifications messaging system" --domain notifications-messaging --format json
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

Report commit hash, packs added, CLI integration status, verification performed, and residual work if any.

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
