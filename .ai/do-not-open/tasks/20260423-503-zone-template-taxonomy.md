---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T15:42:00.000Z
closed_by: codex
governed_by: task_close:codex
depends_on: [500]
---

# Task 503 - Zone Template Taxonomy

## Context

Narada now has a first-class topology reading:

- zones as authority-homogeneous regions,
- crossings as edges,
- regimes as edge law.

But `zone` is still a raw local object. We do not yet know whether Narada's zones instantiate a smaller reusable family of `zone_template` kinds.

## Goal

Define a bounded `zone_template` taxonomy for Narada.

The taxonomy should reduce ambiguity, not merely rename zones.

## Read First

- `SEMANTICS.md` §2.0 and §2.15
- `AGENTS.md`
- `docs/concepts/system.md`
- `.ai/decisions/20260423-491-crossing-regime-semantic-crystallization.md`
- `.ai/do-not-open/tasks/20260423-500-crossing-regime-first-class-closure.md`

## Scope

This task owns zone-template doctrine only:

- whether reusable zone templates exist,
- what the smallest useful set is,
- and what counts as template vs local instance.

## Required Work

1. Pressure-test whether Narada's current zones cluster into a smaller template family.
   Candidate families may include ideas like:
   - admission zone
   - derivation zone
   - governance zone
   - effect boundary zone
   - execution/attempt zone
   - confirmation zone
   - observation zone

2. Define the smallest useful taxonomy.
   For each template, state:
   - what authority grammar is invariant there,
   - what artifacts are typical,
   - what it is not.

3. Explicitly distinguish:
   - zone instance,
   - zone template,
   - and local stage that should **not** become a template.

4. Record what remains ambiguous or disputed.

## Non-Goals

- Do not make the taxonomy a runtime enum unless absolutely necessary.
- Do not force every current Narada zone into a template if the fit is weak.
- Do not widen into regime kinds or runtime derivation.

## Acceptance Criteria

- [x] A bounded candidate `zone_template` taxonomy exists.
- [x] Each template states its invariant authority grammar in Narada terms.
- [x] The task distinguishes template from instance clearly.
- [x] Ambiguous or weakly fitting cases are recorded explicitly.
- [x] Focused verification or blocker evidence is recorded in this task.

## Execution Notes

### 1. Pressure-Test Results

Narada's 12 zones (Source, Fact, Context, Evaluation, Work, Decision, Intent, Execution, Confirmation, Observation, Operator, Task) were pressure-tested against candidate template families.

**Strong clusters (multiple instances, clear shared authority grammar):**
- `ingress`: Source, Operator — both receive external data into the governed topology
- `governance`: Work, Decision, Task — all decide lifecycle transitions under `resolve`/`claim`

**Moderate clusters:**
- `compilation`: Context, Evaluation — both transform upstream artifacts into downstream ones, but Context is organization while Evaluation is intelligence/proposal

**Single-instance patterns (clear reusable pattern, one current instance):**
- `canonicalization`: Fact — first durable boundary
- `effect_boundary`: Intent — bridge from governance to execution
- `performance`: Execution — external effect execution
- `verification`: Confirmation — truth-binding via observation
- `observation`: Observation — read-only derived views

### 2. Taxonomy Delivered

Eight templates defined in `packages/layers/control-plane/src/types/zone-template.ts`:

| Template | Instances | Fit | Key Invariant |
|----------|-----------|-----|---------------|
| `ingress` | Source, Operator | strong | External → internal; no governance |
| `canonicalization` | Fact | single-instance pattern | `derive`; content-addressed; idempotent |
| `compilation` | Context, Evaluation | moderate | `derive`/`propose`; upstream → downstream |
| `governance` | Work, Decision, Task | strong | `resolve`/`claim`; decides what proceeds |
| `effect_boundary` | Intent | single-instance pattern | `resolve` → `execute` handoff |
| `performance` | Execution | single-instance pattern | `execute`; mutates external state |
| `verification` | Confirmation | single-instance pattern | `confirm`; observation-driven |
| `observation` | Observation | single-instance pattern | No mutating authority; read-only |

### 3. Template vs Instance vs Local Stage

- **Zone instance**: concrete zone in topology (e.g., Source, Fact, Work) — §2.15.1
- **Zone template**: reusable pattern by invariant authority grammar (e.g., `ingress`, `governance`)
- **Local stage**: mechanical step within a zone, not promoted (e.g., `revision_tracking` in Context, `lease_management` in Work, `handoff_transaction` in Intent, `normalization` in Fact, `checkpoint_persistence` in Source)

### 4. Ambiguous/Disputed Cases

1. **Compilation template**: Context (organization) vs Evaluation (intelligence) differ in nature. Evaluation is governance-adjacent, making the boundary fuzzy.
2. **Work within Governance**: Includes scheduling mechanics (leases) that are mechanical, not purely governance.
3. **Task within Governance**: Includes human review, which has different authority grammar than automated foreman governance.
4. **Fact not fitting Ingress**: Canonicalization is distinct from ingress. Ingress is "external → internal"; canonicalization is "raw → canonical."
5. **Single-instance templates**: Five templates have only one instance. They are kept because the pattern is clear for future verticals.

### 5. Files Changed

- `packages/layers/control-plane/src/types/zone-template.ts` — new TypeScript types, inventory, and lookup helpers
- `SEMANTICS.md` — new §2.17 Zone Template Taxonomy
- `AGENTS.md` — updated documentation index, task lookup, and concept table

## Verification

```
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)
```

No runtime enum introduced. No existing code paths modified. Purely additive semantic and type documentation.
