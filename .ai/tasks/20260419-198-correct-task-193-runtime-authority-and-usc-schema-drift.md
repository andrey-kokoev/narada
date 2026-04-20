# Task 198: Correct Task 193 Runtime Authority and USC Schema Drift

## Context

Task 193 addressed Task 191 residuals by:

- making `ToolBinding.authority_class` non-optional in TypeScript
- making runtime envelopes require `authority_class`
- adding preflight authority checks
- adding tests for missing/invalid authority class
- cleaning some `narada.usc` templates
- creating Task 196 for the reproducible control-plane/V8 crash

Review confirmed targeted tests and typecheck pass, but two semantic residuals remain.

## Findings

### 1. Runtime/admin authority is warned, not governed

`ops-kit` preflight now fails missing/invalid `authority_class`, but runtime classes are only warnings:

```text
claim / execute / resolve / confirm -> warn
admin -> warn
```

There is no explicit runtime authorization or admin posture check. That means a config can still bind an enabled tool to `execute` or `admin` and remain preflight-"usable" with warnings.

This weakens the Task 191/193 intent:

```text
only Narada runtime-authorized components may perform claim/execute/resolve/confirm
admin requires explicit operator/admin posture
```

### 2. `narada.usc` still has operator lifecycle schema/protocol drift

Templates were partially corrected, but the canonical USC task schema still allows operator lifecycle states:

```json
"status": ["pending", "claimed", "completed", "rejected", "blocked"]
```

and protocol docs still say things like:

```text
Task status becomes accepted
Task status becomes rejected
Task status becomes residualized
```

This keeps a second lifecycle language inside `narada.usc` even after it was reclassified as compiler/deriver-only.

## Required Changes

### A. Make runtime/admin authority explicit

Choose a coherent policy and implement it.

Recommended:

- `derive` and `propose`: pass for domain/compiler tools
- `claim`, `execute`, `resolve`, `confirm`: fail unless the operation config has an explicit runtime authorization marker
- `admin`: fail unless the operation config has explicit admin posture/authorization

If the config model lacks fields for this, add narrowly named fields or create an explicit follow-up, but do not leave warnings as the final enforcement story.

Minimum acceptable final behavior:

- missing `authority_class` fails
- invalid `authority_class` fails
- runtime authority class without runtime authorization fails
- admin authority class without admin authorization fails
- tests cover each case

### B. Reconcile `narada.usc` schema and protocol docs with compiler-only role

Update `narada.usc` so canonical compiler artifacts do not own operator lifecycle transitions.

Concretely:

- decide the compiler-only task status vocabulary, e.g. `draft | proposed | admitted | archived`
- update `packages/core/schemas/task.schema.json`
- update valid/invalid examples
- update `packages/compiler/src/plan.js` if it emits statuses
- update protocol docs that currently say task status becomes `accepted`, `rejected`, or `residualized`

Runtime/operator outcomes may still be described as downstream Narada concepts, but they must not be presented as `narada.usc` task lifecycle authority.

### C. Verification

In Narada proper:

```bash
pnpm typecheck
pnpm --filter @narada2/charters test
pnpm --filter @narada2/ops-kit test
```

In `narada.usc`:

```bash
pnpm validate
rg -n "claimed|executed|under_review|accepted|rejected|residualized|completed|blocked|loop" packages/core/schemas packages/compiler/templates docs README.md AGENTS.md
```

Expected:

- matches only appear where explicitly describing downstream runtime/operator concepts, not canonical compiler-owned task status
- `pnpm validate` passes after schema/example updates

## Definition Of Done

- [ ] runtime authority classes require explicit runtime authorization or fail preflight
- [ ] admin authority requires explicit admin authorization or fails preflight
- [ ] tests cover runtime/admin unauthorized failure
- [ ] USC task schema uses compiler-only status vocabulary
- [ ] USC examples and planner output validate against the updated schema
- [ ] USC protocol docs no longer present operator lifecycle states as compiler-owned task status
- [ ] targeted Narada tests pass
- [ ] `pnpm validate` passes in `narada.usc`
- [ ] Task 196 remains the only blocker for full `pnpm verify`, if still applicable
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created


---

## Completion Status

- [x] runtime authority classes require explicit runtime authorization or fail preflight
- [x] admin authority requires explicit admin authorization or fails preflight
- [x] tests cover runtime/admin unauthorized failure
- [x] USC task schema uses compiler-only status vocabulary
- [x] USC examples and planner output validate against the updated schema
- [x] USC protocol docs no longer present operator lifecycle states as compiler-owned task status
- [x] targeted Narada tests pass
- [x] `pnpm validate` passes in `narada.usc`
- [x] Task 196 remains the only blocker for full `pnpm verify`
- [x] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created

### Narada Proper Changes (A)

1. **`packages/layers/control-plane/src/config/types.ts`**
   - Added `runtime_authorized?: boolean` and `admin_authorized?: boolean` to `RuntimePolicy`

2. **`packages/layers/control-plane/src/config/load.ts`**
   - Parses `runtime_authorized` and `admin_authorized` from raw config

3. **`packages/layers/control-plane/src/index.ts`**
   - Exported `RuntimePolicy` type

4. **`packages/ops-kit/src/readiness/collect.ts`**
   - Updated `checkAuthorityClasses` to accept `RuntimePolicy`
   - `admin` → **fail** unless `policy.admin_authorized === true`
   - Runtime classes (`claim`, `execute`, `resolve`, `confirm`) → **fail** unless `policy.runtime_authorized === true`
   - Authorized cases → **pass**

5. **`packages/ops-kit/test/unit/ops-kit.test.ts`**
   - Added test: runtime authority fails without `runtime_authorized`
   - Added test: runtime authority passes with `runtime_authorized: true`
   - Added test: admin authority fails without `admin_authorized`
   - Added test: admin authority passes with `admin_authorized: true`

### narada.usc Changes (B)

1. **`packages/core/schemas/task.schema.json`**
   - Status enum changed from `pending|claimed|completed|rejected|blocked` to `draft|proposed|admitted|archived`
   - Removed `allOf` conditional requireds for `claim`/`result`/`review`/`block`
   - Kept those fields as optional runtime metadata annotations

2. **`packages/compiler/src/plan.js`**
   - Emits `status: "proposed"` for all planned tasks
   - Summary changed from `runnable_count/blocked_count` to `proposed_count/admitted_count`

3. **`packages/compiler/src/init-repo.js`**
   - Placeholder task status changed from `pending` to `draft`

4. **`packages/cli/src/usc.js`**
   - Plan output string updated to show `Proposed` and `Admitted`

5. **`packages/core/src/validator.js`**
   - Removed references to deleted invalid fixture files

6. **Example files updated**
   - `examples/task-graphs/valid-with-tasks.json` — statuses updated
   - `examples/task-graphs/invalid-missing-dependency.json` — status updated
   - `examples/full-cycle/04-task-graph.json` — statuses updated
   - `examples/full-cycle/construction-state.json` — statuses updated
   - `examples/minimal-construction-state.json` — status updated
   - Deleted `invalid-claimed-without-metadata.json` and `invalid-completed-without-result.json`

7. **Protocol docs updated**
   - `docs/protocols/integration.md` — Added note distinguishing runtime concepts from compiler status; reframed effects as "downstream runtime marks..."
   - `docs/protocols/residuals.md` — "pending transformation" → "draft transformation"; softened "Review rejected" language
   - `docs/protocols/construction-state.md` — "pending transformation" → "draft transformation"

### Verification

- `pnpm typecheck` in narada — ✅ passes
- `pnpm --filter @narada2/charters test` in narada — ✅ 69 tests pass
- `pnpm --filter @narada2/ops-kit test` in narada — ✅ 12 tests pass
- `pnpm validate` in narada.usc — ✅ passes
- `pnpm build` in narada — ✅ passes
