# Task 166: Add Real Schema Validation to `narada.usc`

## Context

`narada.usc` now has public v0 substrate content and explicit CIS admissibility policy wiring.

Current verification only parses JSON:

```bash
find schemas examples templates -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
```

That proves JSON syntax only. It does not prove that examples validate against their schemas or that `$ref` wiring works.

Recent review found and manually checked schema/example mismatches. The remaining non-decorative hardening is real schema validation.

## Goal

Add a minimal, reliable validation path to `narada.usc` that validates example JSON documents against the JSON schemas in `schemas/`.

This should be small and practical. Do not build a framework.

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code.

## Required Deliverables

### 1. Add package metadata if missing

If `narada.usc` does not already have package metadata, add a minimal:

```text
package.json
```

Use `pnpm`.

Required script:

```json
{
  "scripts": {
    "validate": "node scripts/validate-json-schemas.mjs"
  }
}
```

### 2. Add schema validator

Add:

```text
scripts/validate-json-schemas.mjs
```

It must validate at least:

- `examples/minimal-construction-state.json` against `schemas/construction-state.schema.json`
- `examples/full-cycle/construction-state.json` against `schemas/construction-state.schema.json`
- `examples/full-cycle/04-task-graph.json` against `schemas/task-graph.schema.json`
- `examples/policies/cis-required.json` against `schemas/admissibility-policy.schema.json`

Use a standard JSON Schema validator, preferably `ajv`.

### 3. Dependency handling

If adding `ajv`, add it as a dev dependency.

Keep dependency surface minimal:

```bash
pnpm add -D ajv
```

Do not add unrelated tooling.

### 4. Resolve local `$ref` paths

The validator must correctly resolve local schema references such as:

```json
{ "$ref": "./task-graph.schema.json" }
{ "$ref": "./task.schema.json" }
{ "$ref": "./residual.schema.json" }
{ "$ref": "./admissibility-policy.schema.json" }
```

Preferred approach:

- load all schemas in `schemas/`
- register each schema by `$id`
- also register useful local aliases if needed

### 5. Update docs

Update `README.md` and/or `AGENTS.md` to replace syntax-only JSON parsing with:

```bash
pnpm validate
```

Clarify that `pnpm validate` checks examples against schemas.

### 6. Keep examples honest

If validation reveals mismatches, fix schemas or examples by preserving the intended USC semantics. Do not loosen schemas just to make invalid data pass unless the loosened shape is actually intended public grammar.

## Non-Goals

- Do not add CI or GitHub Actions.
- Do not add TypeScript.
- Do not build CLI tooling.
- Do not add schema generation.
- Do not modify Narada.
- Do not create derivative task status files.

## Acceptance Criteria

- `pnpm validate` passes in `/home/andrey/src/narada.usc`.
- Validator checks examples against schemas, not just JSON parse.
- Local schema refs resolve.
- Docs mention the validation command.
- Working tree is clean after commit.
- No private data is introduced.

## Verification

Run:

```bash
cd /home/andrey/src/narada.usc
pnpm validate
git status --short
```

Do not run broad unrelated test suites.

## Output

### Commit

- **Hash:** `3049033beb27799102f81b2f8b444050ae8226c9`
- **Message:** `Add real schema validation to narada.usc`

### Files Added/Changed

**New:**
- `package.json` -- minimal pnpm metadata with `validate` script
- `scripts/validate-json-schemas.mjs` -- AJV-based validator
- `pnpm-lock.yaml` and `node_modules/` from `pnpm add -D ajv ajv-formats`

**Modified:**
- `examples/minimal-construction-state.json` -- added required `id` and `rationale` to closure object
- `README.md` -- documented `pnpm validate`
- `AGENTS.md` -- documented `pnpm validate`

### Validation Output

```
PASS minimal-construction-state
PASS full-cycle/construction-state
PASS full-cycle/04-task-graph
PASS policies/cis-required

All validations passed.
```

### Residual Work

None. All 6 deliverables completed.
