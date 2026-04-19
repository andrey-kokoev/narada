# Task 176: Add Fourth Batch USC Domain Packs

## Context

Task 172 introduces the domain-pack architecture. Tasks 173-175 add the first three batches.

This task adds domain packs for content, education, community, procurement, and asset-heavy systems.

Domain packs are reusable constructor knowledge. They are not concrete products.

## Goal

Add five domain packs:

```text
cms-publishing
learning-management
community-platform
procurement
asset-management
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

### 1. `cms-publishing`

Covers content management, publishing, editorial workflow, and documentation systems.

Must include ambiguity families:

- content types and taxonomy
- editorial roles
- draft/review/publish workflow
- versioning/history
- media/assets
- scheduling
- localization
- permissions
- search/discovery
- SEO/distribution
- import/export
- MVP content model

Must not assume headless CMS, static site, or WYSIWYG editing by default.

### 2. `learning-management`

Covers LMS, training, courses, assessment, and learning operations.

Must include ambiguity families:

- learners/instructors/admin roles
- course/content model
- enrollment and cohorts
- progress tracking
- assessments/quizzes
- certificates/completion
- payments or internal training
- content authoring
- notifications
- reporting
- compliance/training records
- integrations with identity/HR

Must not assume academic vs corporate training by default.

### 3. `community-platform`

Covers forums, member communities, groups, events, and moderation systems.

Must include ambiguity families:

- member identity
- groups/spaces/topics
- posting/content model
- moderation and trust/safety
- notifications
- roles/permissions
- events or live interactions
- reputation/badges if any
- privacy/publicness
- reporting/analytics
- integration with CRM/billing/support
- MVP community boundary

Must not assume public social network semantics.

### 4. `procurement`

Covers purchasing, vendors, approvals, purchase orders, receiving, and spend control.

Must include ambiguity families:

- vendor model
- requisition workflow
- approvals/authority limits
- purchase orders
- receiving and matching
- budgets/cost centers
- contracts
- vendor onboarding/compliance
- integrations with inventory/accounting/ERP
- audit trail
- exceptions and emergency purchasing
- MVP process boundary

Must not assume three-way matching or formal PO flow without explicit policy.

### 5. `asset-management`

Covers physical/digital asset tracking, assignment, maintenance, and lifecycle systems.

Must include ambiguity families:

- asset types
- identity/tagging
- locations/custody
- assignment/check-in/check-out
- maintenance schedules
- depreciation/lifecycle
- inspections
- inventory audits
- integrations with procurement/accounting/ITSM
- permissions
- reporting
- MVP asset class boundary

Must not assume physical assets only.

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
usc refine --intent "I want CMS publishing system" --domain cms-publishing
usc refine --intent "I want learning management system" --domain learning-management
usc refine --intent "I want community platform" --domain community-platform
usc refine --intent "I want procurement system" --domain procurement
usc refine --intent "I want asset management system" --domain asset-management
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
pnpm usc -- refine --intent "I want CMS publishing system" --domain cms-publishing --format json
pnpm usc -- refine --intent "I want learning management system" --domain learning-management --format json
pnpm usc -- refine --intent "I want community platform" --domain community-platform --format json
pnpm usc -- refine --intent "I want procurement system" --domain procurement --format json
pnpm usc -- refine --intent "I want asset management system" --domain asset-management --format json
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
