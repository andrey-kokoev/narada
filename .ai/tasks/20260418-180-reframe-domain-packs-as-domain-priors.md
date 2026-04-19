# Task 180: Reframe Domain Packs as Domain Priors

## Context

`narada.usc` now has many domain-specific refinement modules under:

```text
packages/domain-packs/
```

The term “domain pack” is practical, but it is semantically loose. These modules are not generic content packs or templates. Their real function is sharper:

```text
domain prior = reusable prior work about where decision-relevant arbitrariness usually hides in a class of systems
```

They cache de-arbitrarization work by system domain:

- typical ambiguity loci
- common ontology boundaries
- high-leverage questions
- non-assumptions
- seed tasks
- policy hooks
- likely residual classes
- refinement examples

They must not cache:

- final user decisions
- app-specific requirements
- vendor choices
- concrete implementation architecture
- private/customer-specific facts

## Goal

Reframe the concept from “domain packs” to “domain priors” without making the CLI more theoretical than necessary.

Recommended semantic split:

```text
Public CLI flag: --domain
Public-friendly phrase: domain pack
Formal concept: domain prior
Implementation package name: preferably packages/domain-priors if rename is low-risk
```

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Deliverables

### 1. Update conceptual docs

Update docs to define:

```text
A domain pack is a packaged domain prior.
A domain prior is reusable knowledge about where arbitrariness usually hides in a class of systems.
```

Recommended files:

```text
docs/domain-packs.md
docs/system.md
README.md
```

The docs should emphasize:

- the modules are de-arbitrarization priors, not product templates
- they guide refinement rather than decide outcomes
- they encode non-assumptions and high-leverage questions
- they remain reusable only if they avoid app-specific facts

### 2. Consider folder rename

If low-risk, rename:

```text
packages/domain-packs/
```

to:

```text
packages/domain-priors/
```

Then update imports, docs, validation, and examples accordingly.

If rename is too disruptive, keep the folder name but clearly document:

```text
packages/domain-packs contains packaged domain priors.
```

Do not leave docs conceptually ambiguous.

### 3. Update code naming where practical

If folder is renamed, update:

- `packages/compiler/src/domain-packs.js` to `domain-priors.js`
- imports in `refine-intent.js`
- README/docs references
- any validation paths

If keeping file names, add comments or exports making the concept explicit:

```js
// Domain packs are packaged domain priors: de-arbitrarization caches by system domain.
```

### 4. Preserve CLI semantics

Do not change user-facing CLI flag:

```bash
usc refine --domain erp
```

Do not introduce `--prior` unless there is a strong reason.

The user is selecting a domain; the constructor uses the corresponding prior.

### 5. Add quality bar

Add a short quality bar section to docs:

```text
A domain prior is justified only if it contains non-obvious, domain-specific anti-assumptions, questions, policies, residuals, or seed tasks that improve refinement over the generic prior.
```

This prevents decorative taxonomy.

### 6. Verification

All current refinement commands must still work.

At minimum:

```bash
pnpm usc -- refine --intent "I want ERP system" --domain erp --format json
pnpm usc -- refine --intent "I want support helpdesk" --domain helpdesk --format json
pnpm usc -- refine --intent "I want marketplace" --domain marketplace --format json
pnpm validate
```

## Non-Goals

- Do not change CLI flag `--domain`.
- Do not delete domain prior modules.
- Do not add new domain priors.
- Do not rewrite all pack content unless required by naming.
- Do not connect to Narada runtime.
- Do not create derivative task status files.

## Acceptance Criteria

- Docs clearly define domain packs as packaged domain priors.
- Docs explain domain priors as de-arbitrarization caches by system domain.
- Quality bar exists to prevent decorative packs.
- CLI still uses `--domain`.
- All existing domain refinement examples validate.
- `pnpm validate` passes.
- Working tree is clean after commit.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm usc -- refine --intent "I want ERP system" --domain erp --format json
pnpm usc -- refine --intent "I want support helpdesk" --domain helpdesk --format json
pnpm usc -- refine --intent "I want marketplace" --domain marketplace --format json
pnpm validate
git status --short
```

## Output

Commit changes in `/home/andrey/src/narada.usc`.

Report:

- commit hash
- whether folder rename was performed
- docs/code references updated
- verification performed
- residual work, if any

Do not create `*-EXECUTED.md`, `*-RESULT.md`, `*-DONE.md`, or similar status files.
