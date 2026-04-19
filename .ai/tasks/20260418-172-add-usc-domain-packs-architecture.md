# Task 172: Add USC Domain Packs Architecture

## Context

Task 171 adds the first intent refinement engine:

```text
raw intent -> ambiguity localization + questions + seed tasks
```

For broad intents such as:

```text
I want ERP system
```

generic refinement is not enough. USC needs reusable domain knowledge that helps identify typical ambiguities, module boundaries, policies, and planning patterns without hardcoding app-specific decisions.

This should live in `narada.usc`, because it is constructor knowledge, not product/runtime code.

## Goal

Add a domain-pack architecture to `narada.usc`.

Domain packs are reusable construction grammar for problem families.

They help `usc refine` and future `usc plan` produce better decision surfaces and seed task graphs while still avoiding invented specifics.

## Target Location

Use:

```text
packages/domain-packs/
  erp/
  helpdesk/
```

Each pack may become independently publishable later, but v0 can be workspace-local.

## Domain Pack Definition

A domain pack should answer:

- What ambiguities usually matter?
- What ontology/module boundaries are common?
- What questions collapse the most arbitrariness?
- What policies usually apply?
- What seed tasks are sane?
- What planning/architecture patterns are available?

A domain pack must not contain:

- private customer decisions
- app-specific requirements
- product code for a concrete system
- secrets or deployment config

## Required Deliverables

### 1. Create domain-pack package structure

Add:

```text
packages/domain-packs/erp/
  package.json
  src/index.js
  src/refinement.js
  schemas/erp-context.schema.json
  templates/module-map.md
  examples/small-business-erp.refinement.json

packages/domain-packs/helpdesk/
  package.json
  src/index.js
  src/refinement.js
  schemas/helpdesk-context.schema.json
  templates/question-map.md
  examples/support-helpdesk.refinement.json
```

If Task 171 has not yet landed, make these packages ready to plug into it without breaking current commands.

### 2. Define common domain pack interface

Add or update core/compiler exports so a domain pack has a clear shape:

```js
{
  id: "erp",
  name: "Enterprise Resource Planning",
  detects(intent, context): boolean | score,
  refine(intent, context): Refinement
}
```

If there is already a refinement type from Task 171, reuse it.

If not, define the interface in docs and implement lightweight JS objects only.

### 3. ERP domain pack

ERP pack must cover at least these ambiguity families:

- build vs configure existing ERP vs integration layer
- organization/domain context
- user roles and operating units
- modules in MVP
- accounting/finance requirements
- inventory/procurement/sales requirements
- HR/manufacturing/reporting optionality
- data migration
- integrations
- security/auth
- compliance/audit requirements
- hosting and deployment
- success criteria and stopping boundary

It must not choose a module set by default. It may suggest common modules as options.

Seed tasks should include:

- define ERP scope and module boundary
- decide build/configure/integrate strategy
- inventory existing systems and data migration needs
- define finance/accounting compliance constraints
- define user roles and permission model

### 4. Helpdesk domain pack

Helpdesk pack must cover at least:

- support channels
- inbox/mailbox ownership
- SLA and priority rules
- assignment/routing
- draft vs autonomous response posture
- knowledge base sources
- escalation paths
- audit/logging requirements
- integration with CRM/project management
- reporting/metrics

Seed tasks should include:

- define support channels and ownership
- define SLA/priority policy
- define response posture and approval rules
- define knowledge source bindings
- define escalation and handoff rules

### 5. CLI integration

If Task 171 is already implemented:

Support:

```bash
usc refine --intent "I want ERP system" --domain erp
usc refine --intent "I want support helpdesk" --domain helpdesk
```

If `--domain` is omitted, auto-detect best pack when confidence is high; otherwise use generic refinement and list candidate packs.

If Task 171 is not implemented yet, add this as a TODO in code/docs and ensure no current commands break.

### 6. Validation

Domain pack examples should validate against the refinement schema from Task 171.

If Task 171 has not landed, examples should at least parse as JSON and be documented as pending schema validation.

### 7. Documentation

Update README and/or docs:

- define domain packs
- explain where they live
- explain that they are reusable constructor knowledge
- explain difference between a domain pack and a concrete app repo

Add to `docs/system.md` if helpful:

```text
domain pack -> refine -> decision surface / seed tasks
```

## Non-Goals

- Do not build an ERP product.
- Do not generate application code.
- Do not make private/customer-specific decisions.
- Do not connect to Narada runtime.
- Do not add LLM calls.
- Do not create GitHub repositories.
- Do not add CI or GitHub Actions.
- Do not create derivative task status files.

## Acceptance Criteria

- `packages/domain-packs/erp` exists and exports a usable domain pack object.
- `packages/domain-packs/helpdesk` exists and exports a usable domain pack object.
- ERP refinement does not invent module choices as settled facts.
- Helpdesk refinement does not assume autonomous sending by default.
- CLI can use `--domain erp` and `--domain helpdesk` if Task 171 is present.
- Examples parse as JSON and validate if refinement schema exists.
- README/docs explain domain-pack role.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

If Task 171 is present:

```bash
cd /home/andrey/src/narada.usc
pnpm usc -- refine --intent "I want ERP system" --domain erp --format json
pnpm usc -- refine --intent "I want support helpdesk" --domain helpdesk --format json
pnpm validate
git status --short
```

If Task 171 is not present:

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
- domain packs added
- CLI/refinement integration status
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
