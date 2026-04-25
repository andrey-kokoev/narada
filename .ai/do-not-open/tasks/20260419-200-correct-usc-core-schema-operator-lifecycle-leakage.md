# Task 200: Correct USC Core Schema Operator Lifecycle Leakage

## Context

Task 199 fixed the immediate USC summary drift:

```text
Tasks: 10, Proposed: 10, Admitted: 0
```

and cleaned the most visible protocol/example references to stale task statuses.

Review found one remaining semantic leak: `narada.usc` still allows operator lifecycle data inside core compiler schemas.

## Finding

`narada.usc` is now intended to be a compiler/deriver/proposer package. It may produce construction artifacts for Narada proper, but it must not own claiming, execution, review resolution, completion, rejection, or runtime loop authority.

However these files still encode operator lifecycle concepts as core USC schema fields:

```text
/home/andrey/src/narada.usc/packages/core/schemas/task.schema.json
/home/andrey/src/narada.usc/packages/core/schemas/session.schema.json
```

Examples:

```json
"claim": { "required": ["claimant", "claimed_at"] }
"review": { "outcome": ["accept", "reject", "residualize", "reopen"] }
"result": { "required": ["artifact_reference", "completed_at", "completed_by", "reviewed_by"] }
"block": { "required": ["reason"] }
```

and:

```json
"task_graph_changes": {
  "change": ["created", "claimed", "executed", "reviewed", "residualized", "accepted", "rejected"]
}
```

This leaves an implicit second lifecycle embedded in USC compiler artifacts. Even if optional, it blurs the boundary established by Tasks 189, 191, 198, and 199:

```text
narada.usc: derive/propose compiler artifacts
Narada proper: claim/execute/resolve/confirm/admin runtime authority
```

## Required Changes

### A. Remove operator lifecycle fields from USC task schema

In `/home/andrey/src/narada.usc/packages/core/schemas/task.schema.json`, remove or relocate fields that encode runtime/operator lifecycle state:

```text
claim
review
result
block
```

If downstream runtime annotations are still useful, they must not be part of the canonical USC task schema. Put them in a clearly named downstream schema instead, for example:

```text
packages/core/schemas/downstream-runtime-observation.schema.json
```

That schema must be explicitly documented as non-authoritative from USC's point of view.

### B. Rename or split session schema lifecycle changes

In `/home/andrey/src/narada.usc/packages/core/schemas/session.schema.json`, remove `task_graph_changes` values that imply USC owns runtime lifecycle transitions:

```text
claimed
executed
reviewed
residualized
accepted
rejected
```

Either:

- keep only compiler artifact changes, e.g. `created`, `proposed`, `admitted`, `archived`
- or split runtime events into a clearly downstream/non-authoritative observation schema

Do not leave runtime transitions in a generic core USC session schema without explicit downstream namespacing.

### C. Update examples and validation

Update examples and validators so canonical USC artifacts validate without operator lifecycle fields.

If full-cycle examples mention claiming/execution/review/integration, label them as downstream Narada proper runtime observation, not USC-owned lifecycle.

### D. Verification

Run in `/home/andrey/src/narada.usc`:

```bash
pnpm validate
rg -n '"claim"|"result"|"block"|"task_graph_changes"|claimed|executed|accepted|rejected|residualized' packages/core/schemas examples docs README.md AGENTS.md
```

Expected:

- no operator lifecycle fields remain in canonical compiler schemas
- any remaining lifecycle words are explicitly downstream runtime/operator observations or generic English
- `pnpm validate` passes

Run in `/home/andrey/src/narada` if Narada proper types or init output are touched:

```bash
pnpm typecheck
pnpm --filter @narada2/cli build
```

## Definition Of Done

- [x] USC task schema contains only compiler/proposal task fields.
- [x] USC session schema no longer owns runtime lifecycle transitions.
- [x] Any downstream runtime observation schema is explicitly named and documented as non-authoritative for USC.
- [x] Full-cycle examples distinguish USC compiler artifacts from Narada proper runtime observations.
- [x] `pnpm validate` passes in `narada.usc`.
- [x] Narada proper typecheck/build passes if touched.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, or similar derivative task files are created.
