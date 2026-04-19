# Task 171: Add USC Intent Refinement Engine

## Context

After Tasks 169 and 170, `narada.usc` should be treated as:

```text
the executable implementation of the Universal Systems Constructor
```

Current capability is still mostly structural:

```text
raw intent
-> initialized USC-governed repo/workspace
-> starter construction-state/task-graph artifacts
-> validation
```

For a user saying:

```text
I want ERP system
```

`narada.usc` can create a governed construction workspace, but it cannot yet perform the next essential constructor function:

```text
raw intent -> de-arbitrarized decision surface + initial task graph
```

That is the next real capability.

## Goal

Add a first intent-refinement engine to `narada.usc`.

The engine should transform raw principal intent into:

- ambiguity localization
- decision surface
- first explicit questions
- initial construction-state update
- optional seed task graph

This should be deterministic and non-LLM for v0 unless explicitly designed as a pluggable provider. The goal is not to “solve ERP.” The goal is to make hidden arbitrariness explicit and produce a usable refinement artifact.

## Command Semantics

Add command:

```bash
usc refine --intent "I want ERP system" [--target <repo>] [--domain <domain>] [--cis]
```

or, if Task 170 command model is already implemented:

```bash
pnpm usc -- refine --intent "I want ERP system" --target ./narada.usc.erp --cis
```

Meaning:

> refine raw principal intent into decision-relevant ambiguity, questions, and construction artifacts.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Deliverables

### 1. Add refinement model to core

Add a core model for refinement output.

Suggested files:

```text
packages/core/src/refinement.js
packages/core/schemas/refinement.schema.json
```

The refinement output should include:

- `intent`
- `detected_domain`
- `ambiguities`
- `questions`
- `assumptions`
- `suggested_closures`
- `seed_tasks`
- `residuals`

Minimum ambiguity layers:

- ontology
- dynamics
- normativity
- environment
- stopping

These correspond to Progressive De-Arbitrarization.

### 2. Add refinement engine to compiler

Add:

```text
packages/compiler/src/refine-intent.js
```

For v0, implement a deterministic rule-based refiner.

It should handle at least:

- generic software system intent
- ERP-like system intent
- helpdesk/support system intent
- unknown broad system intent

For broad system intent, it should not invent specifics. It should emit questions and residuals.

Example for “I want ERP system”:

- detected domain: `enterprise_resource_planning`
- ambiguities:
  - build vs configure existing ERP
  - modules required
  - organization/domain context
  - data migration scope
  - compliance/accounting requirements
  - hosting/security/auth
  - MVP boundary
- questions:
  - “Is this a greenfield build, replacement, or integration layer?”
  - “Which modules are in MVP?”
  - “Who are the users and what organization size?”
- seed tasks:
  - “Define ERP scope and module boundary”
  - “Decide build/configure/integrate strategy”
  - “Inventory existing systems and migration requirements”

### 3. Add CLI command

Add:

```bash
usc refine --intent <text> [--target <path>] [--domain <domain>] [--cis] [--format json|md]
```

Behavior:

- If `--target` is omitted, print refinement to stdout.
- If `--target` is present, write artifacts under the target repo’s `usc/` directory.
- If `--format json`, emit JSON.
- If `--format md`, emit Markdown.
- Default format may be human Markdown.

Generated target artifacts should include one or more of:

```text
usc/refinement.md
usc/refinement.json
usc/decision-surface.md
usc/task-graph.json
usc/construction-state.json
```

Do not overwrite existing meaningful artifacts without `--force`.

### 4. Add schema validation

Extend validation so `refinement.json` validates against `refinement.schema.json` where present.

### 5. Update docs

Update README:

```bash
usc init ./narada.usc.erp --name erp --intent "I want ERP system" --cis
usc refine --target ./narada.usc.erp --intent "I want ERP system"
usc validate --app ./narada.usc.erp
```

Explain that `refine` does not implement the system. It surfaces decision-relevant arbitrariness and produces first construction artifacts.

Update `docs/system.md` with `refine` in the CLI/constructor flow if relevant.

### 6. Add examples

Add example refinements:

```text
examples/refinements/erp.refinement.json
examples/refinements/helpdesk.refinement.json
```

Each should validate.

## Non-Goals

- Do not generate production application code.
- Do not call LLMs.
- Do not pretend broad intents are sufficiently specified.
- Do not choose ERP modules by default without marking them as assumptions or questions.
- Do not connect to Narada runtime.
- Do not create GitHub repositories.
- Do not add CI or GitHub Actions.
- Do not create derivative task status files.

## Acceptance Criteria

- `usc refine --intent "I want ERP system" --format json` emits valid refinement JSON.
- ERP refinement exposes major hidden arbitrariness instead of inventing a specific ERP design.
- `usc refine --intent "I want support helpdesk" --format json` emits valid refinement JSON.
- Unknown/broad system intent emits useful questions and residuals.
- Generated `refinement.json` validates.
- `pnpm validate` validates refinement examples.
- README documents `refine`.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm usc -- refine --intent "I want ERP system" --format json
pnpm usc -- refine --intent "I want support helpdesk" --format json
pnpm validate
rm -rf /tmp/narada.usc.erp
pnpm usc -- init /tmp/narada.usc.erp --name erp --principal "Test Principal" --intent "I want ERP system" --cis
pnpm usc -- refine --target /tmp/narada.usc.erp --intent "I want ERP system" --format json
pnpm usc -- validate --app /tmp/narada.usc.erp
rm -rf /tmp/narada.usc.erp
git status --short
```

Adjust command spelling if Task 170’s CLI shape differs, but preserve the semantics.

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- command implemented
- example outputs added
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
