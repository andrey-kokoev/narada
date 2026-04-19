# Task 164: Populate `narada.usc` Public Substrate v0

## Context

`/home/andrey/src/narada.usc` has been created and published as a public repo:

```text
https://github.com/andrey-kokoev/narada.usc
```

It currently contains a coherent scaffold:

- repo boundary and purpose
- USC core concept
- construction-state protocol
- task-graph protocol
- review protocol
- initial JSON schemas
- PDA delegation prompt
- app-repo naming convention
- minimal example

This is not yet fully populated. It is an initial public substrate, not a usable v0 for serious USC practice.

## Goal

Turn `narada.usc` from scaffold into a usable public v0 substrate for Universal Systems Constructor work.

The repo should let a new reader understand and perform one complete USC-shaped construction cycle:

```text
principal intent
-> de-arbitrarized construction state
-> task graph
-> claimed task
-> execution evidence
-> review
-> integration or residual
-> closure update
```

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada product code for this task.

## Required Deliverables

### 1. Concrete artifact templates

Add practical templates for:

- construction session
- task
- review
- residual
- closure record
- decision surface

Suggested location:

```text
templates/
```

Each template should be usable directly as Markdown or JSON/YAML. Pick formats intentionally and document why.

### 2. Full worked example

Add one complete sanitized example that demonstrates the full USC cycle.

Suggested location:

```text
examples/full-cycle/
```

The example must include:

- initial principal intent
- ambiguity localization
- explicit decisions / closure
- task graph
- task claim
- execution evidence
- review result
- residual or closure outcome

The example should be domain-neutral enough for public use. Do not use private Narada, Sonar, mailbox, customer, credential, or operational details.

### 3. Residual taxonomy

Add a protocol document defining residual types.

Minimum residual classes:

- unresolved principal decision
- missing policy
- missing effector
- failed review
- blocked dependency
- reopened closure
- out-of-calculus target
- declared non-goal
- decision-inert distinction

Clarify which residuals block execution, which can be deferred, and which close the branch.

### 4. Authority-loci protocol

Add a protocol document for USC authority loci.

It must distinguish:

- principal authority
- semantic authority
- planning authority
- execution authority
- review authority
- integration authority
- durable truth authority

Clarify that one person/process may hold multiple loci, but the loci must remain explicit.

### 5. Integration protocol

Add a protocol document for accepting, rejecting, residualizing, or reopening construction work after review.

Clarify the difference between:

- review finding
- integration decision
- closure update
- residual creation

### 6. Schema strengthening

Strengthen existing schemas enough to validate the new worked example.

At minimum, add or update schemas for:

- task
- review
- residual
- closure record
- decision surface
- session

Avoid over-modeling. The schemas should represent the current public v0 grammar, not an imagined future product.

### 7. Public boundary documentation

Update `README.md` and `AGENTS.md` as needed so the repo boundary is precise:

- `narada.usc` is reusable substrate
- `narada.usc.<app-name>` is a concrete constructed system
- private operational traces do not belong in `narada.usc`
- polished generic concepts may be extracted to `thoughts`
- runtime/product code belongs in the appropriate product/runtime repo

### 8. Narada compatibility note

Add a short document explaining how `narada.usc` relates to Narada without making Narada mandatory.

Suggested location:

```text
protocols/narada-compatibility.md
```

It should say:

- USC can be practiced manually or with any durable task system
- Narada can host USC-like charters and operations
- `narada.usc` defines the construction grammar, not the runtime
- app repos may choose to use Narada as execution substrate

## Non-Goals

- Do not build CLI tooling yet.
- Do not create app-specific repos.
- Do not import private operational traces.
- Do not add CI or GitHub Actions.
- Do not make `narada.usc` depend on `narada`.
- Do not create derivative task status files.

## Acceptance Criteria

- [x] A reader can follow the full worked example without extra context.
- [x] Templates are concrete enough to use for a real USC session.
- [x] Schemas parse as valid JSON.
- [x] The worked example validates structurally against the schemas where applicable.
- [x] README clearly explains the repo's role and boundary.
- [x] No private data or internal operational traces are present.
- [x] Repo has a clean git status after committing changes.

## Verification

```bash
cd /home/andrey/src/narada.usc
# All JSON schemas and example files parse as valid JSON
find schemas examples -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
# Result: ALL_JSON_VALID

# Git status clean after commit
git status --short
# Result: clean (nothing to commit, working tree clean)
```

No new dependencies added.

## Output

Committed in `/home/andrey/src/narada.usc`.

- **Commit hash:** `1f57afb80fe0bb010365e6d55f3d1de90e2fbc8e`
- **Commit message:** Populate narada.usc public substrate v0

## Files Added/Changed

### New directories
- `templates/` -- 6 artifact templates
- `examples/full-cycle/` -- 9 files demonstrating complete USC cycle
- `protocols/authority-loci.md`
- `protocols/integration.md`
- `protocols/narada-compatibility.md`
- `protocols/residuals.md`
- `schemas/closure-record.schema.json`
- `schemas/decision-surface.schema.json`
- `schemas/residual.schema.json`
- `schemas/review.schema.json`
- `schemas/session.schema.json`
- `schemas/task.schema.json`

### Modified
- `README.md` -- clarified repo role, boundaries, quick start
- `AGENTS.md` -- added schema validation command, boundary rules
- `schemas/construction-state.schema.json` -- strengthened with typed fields, residuals
- `schemas/task-graph.schema.json` -- now references external task.schema.json

## Residual Work

None. All 8 deliverables completed. Future work (out of scope for this task):
- CLI tooling for template instantiation
- JSON Schema structural validation beyond parse-check
- Additional vertical-specific examples
