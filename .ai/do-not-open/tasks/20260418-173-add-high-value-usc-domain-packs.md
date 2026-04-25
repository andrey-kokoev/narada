# Task 173: Add High-Value USC Domain Packs

## Context

Task 172 introduces the domain-pack architecture with initial packs:

- `erp`
- `helpdesk`

Additional domain packs will make `usc refine` useful for more first-time user intents without hardcoding app-specific decisions.

Domain packs are reusable constructor knowledge. They are not concrete products.

## Goal

Add the next high-value domain packs to `narada.usc`.

Priority packs:

```text
saas
workflow-automation
ai-agent-operation
data-pipeline
internal-tools
```

These cover a large share of “I want X system” requests while remaining general enough to be reusable.

## Dependency

This task depends on Task 172.

If Task 172 is not complete, do not implement this task yet. Instead, mark it blocked in normal task state. Do not create derivative status files.

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

### 1. `saas`

Covers multi-tenant SaaS systems.

Must include ambiguity families:

- target customer/user segments
- tenant model
- auth and identity
- billing/subscription model
- onboarding and activation
- admin roles and permissions
- data isolation
- observability/support
- compliance/security
- MVP boundary

Must not assume B2B vs B2C, freemium vs paid, or specific billing provider.

### 2. `workflow-automation`

Covers trigger/action/approval automation systems.

Must include ambiguity families:

- trigger sources
- action targets
- state/retry semantics
- approval requirements
- idempotency and deduplication
- auditability
- failure handling
- external integration constraints
- human override/escalation
- scheduling/time semantics

Must not assume autonomous execution by default.

### 3. `ai-agent-operation`

Covers agent-backed operational systems.

Must include ambiguity families:

- charter/role definition
- allowed tools
- authority boundaries
- memory/knowledge sources
- review posture
- escalation paths
- human approval requirements
- safety constraints
- audit/logging
- evaluation criteria

Must not assume agents can send/execute externally without approval.

### 4. `data-pipeline`

Covers data ingestion/transformation/reporting pipelines.

Must include ambiguity families:

- source systems
- ingestion mode
- schema/contracts
- validation rules
- transformation semantics
- lineage
- backfills/reprocessing
- freshness/SLA
- monitoring/alerting
- retention/privacy

Must not assume batch vs streaming.

### 5. `internal-tools`

Covers admin panels and internal business tools.

Must include ambiguity families:

- user roles
- CRUD surfaces
- approval flows
- imports/exports
- audit logs
- permissions/RBAC
- reporting needs
- source-of-truth boundaries
- operational risk
- MVP boundary

Must not assume low security just because the tool is internal.

## Required Structure Per Pack

Each pack should follow the shape introduced in Task 172:

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
usc refine --intent "I want SaaS app" --domain saas
usc refine --intent "I want workflow automation" --domain workflow-automation
usc refine --intent "I want AI agent operation" --domain ai-agent-operation
usc refine --intent "I want data pipeline" --domain data-pipeline
usc refine --intent "I want internal admin tool" --domain internal-tools
```

Auto-detection should include these packs when confidence is high.

If refinement CLI is not present yet, export packs and document pending CLI integration.

## Documentation

Update docs to list available domain packs and their purpose.

Recommended:

```text
docs/domain-packs.md
```

Also update `docs/system.md` if useful.

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
pnpm usc -- refine --intent "I want SaaS app" --domain saas --format json
pnpm usc -- refine --intent "I want workflow automation" --domain workflow-automation --format json
pnpm usc -- refine --intent "I want AI agent operation" --domain ai-agent-operation --format json
pnpm usc -- refine --intent "I want data pipeline" --domain data-pipeline --format json
pnpm usc -- refine --intent "I want internal admin tool" --domain internal-tools --format json
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

---

## Execution Notes

**Date:** 2026-04-13

Task completed in prior sessions (commits `33df2bc`, `2788158`, `65053b8`).

All five required high-value domain packs exist and are registered:
- `saas` — multi-tenant SaaS systems
- `workflow-automation` — trigger/action/approval automation
- `ai-agent-operation` — agent-backed operational systems
- `data-pipeline` — ingestion/transformation/reporting pipelines
- `internal-tools` — admin panels and internal business tools

Additional packs also registered: `erp`, `helpdesk`, `analytics-dashboard`, `billing-subscriptions`, `compliance-system`, `customer-portal`, `integration-hub`.

Each pack exports `{ id, name, detect, refine }` and includes:
- ambiguity families (10 per pack)
- authority-mapped questions
- assumptions with confidence/reversibility
- suggested closures
- seed tasks with evidence requirements
- residuals (blocking and non-blocking)
- context schema
- question-map template
- validated example refinement JSON

CLI integration: `usc refine --intent "..." --domain <pack> --format json` works for all packs.
Auto-detection tries domain packs before built-in fallback.

Verification performed:
- All 5 required packs refine successfully via CLI
- `pnpm validate` passes (18 domain-pack examples + canonical examples)
- `git status --short` shows clean working tree

Commit chain: `33df2bc` -> `2788158` -> `65053b8`
