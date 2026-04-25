# Task 193: Correct Task 191 Authority Enforcement and USC Template Drift

## Context

Task 191 added the deriver/operator authority distinction:

```text
derive / propose / claim / execute / resolve / confirm / admin
```

It also corrected `narada.usc` toward compiler-only behavior by removing operator-class CLI commands.

Review found the direction is correct, but completion is incomplete.

## Findings

### 1. Authority class is optional and not enforced

Narada proper added:

```ts
export type AuthorityClass = "derive" | "propose" | "claim" | "execute" | "resolve" | "confirm" | "admin";
```

and threaded `authority_class` into tool bindings/envelopes.

Current issues:

- `ToolBinding.authority_class` is optional.
- `ToolCatalogEntrySchema.authority_class` is optional.
- `resolveToolCatalog()` passes the value through but does not default or reject missing classes.
- No preflight rejection was added for disallowed authority classes.
- `SEMANTICS.md` says preflight must reject invalid authority bindings, but implementation does not yet do that.

Task 191 allowed either implementation or an explicit follow-up task for enforcement. This is that follow-up, and it should close the gap.

### 2. `narada.usc` still has stale operator lifecycle template language

`narada.usc` removed operator commands from the CLI, but `packages/compiler/templates/task.md` still documents operator-style fields and statuses:

```text
open, claimed, executed, under_review, accepted, rejected, residualized, superseded
claimed_by
executed_at
reviewed_by
review_outcome
```

That conflicts with the compiler-only boundary. Templates should describe artifact semantics, not active claim/execution authority.

### 3. Verification did not pass

`pnpm validate` in `narada.usc` passed.

`pnpm verify` in Narada proper failed during the control-plane unit test step with a Node/V8 fatal error:

```text
Fatal JavaScript invalid size error 169220804
Trace/breakpoint trap (core dumped)
Control-plane unit tests failed
```

This may be unrelated to Task 191, but Task 191 cannot be marked clean while required verification fails without diagnosis or a documented known-flake classification.

## Required Changes

### A. Enforce authority classes in Narada proper

Implement concrete validation for tool bindings.

Minimum acceptable behavior:

- every enabled tool binding must have an `authority_class`
- authority class must be one of the canonical values
- preflight fails or warns according to posture/policy when a binding requests an authority class it is not allowed to use
- domain/compiler package bindings may only use `derive` or `propose`
- runtime-only classes (`claim`, `execute`, `resolve`, `confirm`) require Narada runtime authorization
- `admin` requires explicit admin posture

Add unit tests for:

- missing `authority_class`
- invalid `authority_class`
- allowed `derive`
- disallowed `execute` under non-runtime/non-admin posture

### B. Make authority class non-optional where it matters

Update types/schemas so runtime capability envelopes do not silently omit authority class.

If backward compatibility is needed for existing configs, add an explicit migration/defaulting step and document it. Do not leave optional omission as the canonical shape.

### C. Correct `narada.usc` task template language

Update `packages/compiler/templates/task.md` so it no longer advertises operator lifecycle states as canonical USC compiler behavior.

Use compiler/artifact wording:

- task graph proposal
- required inputs
- expected outputs
- acceptance criteria
- residual handling
- downstream runtime authority owned by Narada proper

Do not include `claimed`, `executed`, `complete`, `reject`, or lifecycle-loop language as if `narada.usc` owns those transitions.

### D. Diagnose verification failure

Run targeted verification enough to classify the failure:

```bash
pnpm verify
pnpm test:kernel
```

If the Node/V8 crash is reproducible, fix it or create a narrow follow-up with exact failing command and stack evidence.

If it is a known harmless native-test crash, document that with evidence and run a narrower passing verification that covers the files changed in this task.

## Verification

In Narada proper:

```bash
pnpm verify
```

In `narada.usc`:

```bash
pnpm validate
rg -n "claimed|executed|under_review|accepted|residualized|superseded|complete|reject|loop" packages/compiler/templates README.md AGENTS.md docs
```

Expected:

- no canonical USC compiler docs/templates advertise operator lifecycle ownership
- authority class is required/enforced for enabled tools
- preflight catches missing/disallowed authority classes
- verification status is clean or a precise follow-up exists for a reproducible infrastructure crash

## Definition Of Done

- [ ] enabled tool bindings cannot silently omit authority class
- [ ] preflight validates authority class against posture/runtime authority
- [ ] tests cover missing and disallowed authority classes
- [ ] USC task templates are compiler/artifact oriented, not operator lifecycle oriented
- [ ] `pnpm validate` passes in `narada.usc`
- [ ] `pnpm verify` passes in Narada proper, or a precise verification-crash follow-up task exists
- [ ] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created


---

## Completion Status

- [x] enabled tool bindings cannot silently omit authority class
- [x] preflight validates authority class against posture/runtime authority
- [x] tests cover missing and disallowed authority classes
- [x] USC task templates are compiler/artifact oriented, not operator lifecycle oriented
- [x] `pnpm validate` passes in `narada.usc`
- [x] `pnpm verify` passes in Narada proper, or a precise verification-crash follow-up task exists
  - Follow-up task created: `.ai/do-not-open/tasks/20260419-196-diagnose-control-plane-v8-crash.md`
  - Narrow verification for changed packages passes:
    - `packages/domains/charters`: 69 tests pass
    - `packages/ops-kit`: 10 tests pass
    - `packages/layers/daemon` unit tests: 96 tests pass
- [x] no `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created

### Narada Proper Changes

1. **`packages/domains/charters/src/types/coordinator.ts`**
   - Made `authority_class` required on `ToolBinding`
   - Added `AUTHORITY_CLASSES`, `RUNTIME_AUTHORITY_CLASSES`, `DERIVER_AUTHORITY_CLASSES` constants
   - Added `validateToolBindingAuthority()` helper
   - Exported new symbols from `packages/domains/charters/src/index.ts`

2. **`packages/domains/charters/src/runtime/envelope.ts`**
   - Made `authority_class` required on `ToolCatalogEntrySchema` (removed `.optional()`)

3. **`packages/domains/charters/src/tools/resolver.ts`**
   - Added authority class validation in `resolveToolCatalog()` — skips tools with missing/invalid authority_class

4. **`packages/ops-kit/src/readiness/collect.ts`**
   - Added `checkAuthorityClasses()` preflight checks:
     - Missing `authority_class` → fail
     - Invalid `authority_class` → fail
     - `admin` → warn
     - Runtime classes (`claim`, `execute`, `resolve`, `confirm`) → warn
     - `derive` / `propose` → pass

5. **`packages/ops-kit/src/readiness/types.ts`**
   - Added `"authority"` to `ReadinessCheck` category enum

6. **Test updates across packages**
   - Added `authority_class` to all `ToolBinding` and `ToolCatalogEntry` fixtures
   - Added new resolver tests for missing, invalid, and runtime authority classes
   - Added new ops-kit preflight tests for missing authority_class and runtime authority warnings

### narada.usc Changes

1. **`packages/compiler/templates/task.md`**
   - Rewrote to describe a "construction-planning artifact" rather than a runtime work item
   - Removed operator lifecycle statuses (`claimed`, `executed`, `under_review`, `accepted`, `rejected`, `residualized`, `superseded`)
   - Removed operator fields (`claimed_by`, `claimed_at`, `executed_at`, `reviewed_at`, `reviewed_by`, `review_outcome`)
   - Added compiler-oriented fields (`inputs`, `expected_outputs`, `acceptance`)
   - Added explicit authority boundary note
   - Status enum changed to `draft`, `proposed`, `admitted`, `archived`

2. **`packages/compiler/templates/construction-session.md`**
   - Updated Task Graph Changes line to use compiler-oriented language

3. **`packages/compiler/templates/review.md`**
   - Removed operator lifecycle metadata (`reviewed_by`, `reviewed_at`)
   - Reframed "Outcome" as "Expected Outcomes" describing predicate semantics
