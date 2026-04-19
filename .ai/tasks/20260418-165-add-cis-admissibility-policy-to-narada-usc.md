# Task 165: Add CIS Admissibility Policy to `narada.usc`

## Context

`narada.usc` currently represents USC construction state through fields such as:

- `decision_context`
- `closure`
- `review_predicates`
- `residuals`

This is enough to express Constructively Invariant Systems (CIS) constraints manually, but it does not give CIS an explicit mechanical place in the schema.

Conceptually:

```text
USC = constructor mechanism
CIS = admissibility policy for accepted construction/evolution
CICSC = one concrete compiler/runtime pattern satisfying CIS
```

If USC is expected to output systems of CIS type, CIS must be represented as an admissibility policy, not as a loose review note.

## Goal

Make CIS a first-class admissibility policy in `narada.usc`.

The result should let a construction state, task, review, and integration decision explicitly say:

```text
this work is governed by CIS
this task must preserve functional properties F(s)
this task must preserve transformation potential T(s)
this review checks the CIS obligations
failure to satisfy CIS becomes residual state
```

## Scope

Work in:

```text
/home/andrey/src/narada.usc
```

Do not modify Narada runtime code for this task.

## Required Deliverables

### 1. Add policy schema

Add:

```text
schemas/admissibility-policy.schema.json
```

It should support at least:

- `id`
- `name`
- `type`
- `mode`
- `applies_to`
- `requirements`
- `residual_on_failure`

Minimum allowed `type` values:

- `constructive_invariance`
- `custom`

Minimum allowed `mode` values:

- `required`
- `advisory`

Minimum allowed `applies_to` values:

- `de_arbitrarization`
- `task_formation`
- `execution`
- `review`
- `integration`
- `closure`

For `constructive_invariance`, support requirements for:

- `functional_properties`
- `transformation_potential`
- `compatibility_or_migration`
- `verification_evidence`
- `semantic_closure`

### 2. Wire policy refs into existing schemas

Update schemas so policies have a mechanical place:

- `construction-state.schema.json`
  - add top-level `admissibility_policies`
- `task.schema.json`
  - add `policy_refs`
  - add optional `policy_obligations`
- `review.schema.json`
  - add `policy_refs`
  - allow multiple predicates or policy checks if needed
- `closure-record.schema.json`
  - add optional `policy_refs`
- `residual.schema.json`
  - add optional `policy_ref`

Do not over-model future machinery. Keep this v0 schema practical.

### 3. Add CIS policy protocol

Add:

```text
protocols/cis-admissibility-policy.md
```

It should define CIS in USC terms:

```text
CIS is a USC admissibility policy family that restricts accepted construction states to those whose evolution preserves functional properties F(s) and transformation potential T(s).
```

Clarify:

- CIS constrains de-arbitrarization, task formation, review, integration, and closure.
- CIS is not just documentation.
- CIS failure becomes residual state.
- CICSC is one concrete realization pattern, not required by every USC state.

### 4. Add a reusable CIS policy example

Add:

```text
examples/policies/cis-required.json
```

It should show a required `constructive_invariance` policy with requirements for:

- functional properties
- transformation potential
- compatibility or migration
- verification evidence
- semantic closure

### 5. Update full-cycle example if present

If Task 164 has already produced `examples/full-cycle/`, update it to include CIS policy references.

If Task 164 has not yet run, update the existing minimal example instead and add a note that the full-cycle example must reference this policy when created.

### 6. Update docs

Update `README.md` or the relevant protocol index so readers can find:

- what admissibility policies are
- how CIS is represented
- where concrete policy examples live

## Non-Goals

- Do not implement a policy engine.
- Do not add CLI tooling.
- Do not add CI or GitHub Actions.
- Do not make Narada a dependency.
- Do not replace review predicates with policy objects; policies constrain review predicates.
- Do not create derivative task status files.

## Acceptance Criteria

- CIS has an explicit schema slot in construction states.
- Tasks and reviews can reference CIS mechanically.
- There is a documented CIS admissibility policy protocol.
- There is a JSON example of required CIS policy.
- Existing examples remain valid JSON.
- No private operational details are introduced.
- Changes are committed in `/home/andrey/src/narada.usc`.

## Verification

Run targeted checks only:

```bash
cd /home/andrey/src/narada.usc
find schemas examples templates -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
git status --short
```

Do not run broad unrelated test suites.

## Output

### Commit

- **Hash:** `9f4de1de2eb5513c5c59f2ee8dfc4232a26bb68c`
- **Message:** `Add CIS admissibility policy to narada.usc v0`

### Files Added/Changed

**New:**
- `schemas/admissibility-policy.schema.json` -- policy schema with id, name, type (constructive_invariance/custom), mode (required/advisory), applies_to, requirements, residual_on_failure
- `protocols/cis-admissibility-policy.md` -- CIS as USC admissibility policy family
- `examples/policies/cis-required.json` -- reusable required CIS policy example

**Modified:**
- `schemas/construction-state.schema.json` -- added `admissibility_policies` array
- `schemas/task.schema.json` -- added `policy_refs` and `policy_obligations`
- `schemas/review.schema.json` -- added `policy_refs`
- `schemas/closure-record.schema.json` -- added `policy_refs`
- `schemas/residual.schema.json` -- added `policy_ref`
- `examples/full-cycle/construction-state.json` -- added policy references to all tasks and residuals
- `README.md` -- updated quick start and contents to mention policies

### Verification

```bash
cd /home/andrey/src/narada.usc
find schemas examples -name '*.json' -print0 | xargs -0 -n1 node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))'
# Result: ALL_JSON_VALID

git status --short
# Result: clean
```

### Residual Work

None. All 6 deliverables completed.
