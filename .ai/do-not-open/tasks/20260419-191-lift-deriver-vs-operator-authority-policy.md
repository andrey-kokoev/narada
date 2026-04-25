# Task 191: Lift Deriver vs Operator Authority Policy

## Context

While reviewing `narada.usc`, we identified a semantic boundary:

```text
compiler/tool = computes artifact
operator      = advances world state
```

`narada.usc` started as USC-specific schemas, policies, priors, and compilation tools. Tasks 184-190 added lifecycle commands (`next`, `execute`, `complete`, `reject`, `block`, `loop`) that make it look like an operator. That duplicates Narada proper's core authority model.

Narada should make this distinction explicit and policy-enforced.

## Objective

Add a Narada-level authority classification that distinguishes derivation/proposal tools from operator-class actions, then use it to define the correct boundary for USC.

## Definitions

### Deriver / Pure-ish Tool

A deriver computes declared outputs from declared inputs.

Examples:

- `refine(intent, domain_prior) -> refinement.json`
- `plan(refinement.json) -> task-graph.json`
- `validate(usc/) -> pass/fail report`
- `init(template, name, intent) -> repo skeleton`

Properties:

- no claiming
- no leases
- no retries
- no hidden long-running state
- no terminal lifecycle decisions
- no external world mutation except explicitly requested artifact writes
- safe to re-run or overwrite only through explicit `--force`

### Operator

An operator advances governed lifecycle state or external world state.

Examples:

- claim next task
- invoke Kimi/Codex/subprocess
- mutate product code
- mark work completed/rejected/blocked
- retry failed execution
- manage leases
- confirm external effects

Properties:

- changes lifecycle state
- needs concurrency control
- needs audit trail
- may spend money or use credentials
- may touch external systems
- requires crash/retry/idempotency handling
- cannot be safely duplicated by another process

## Required Change

Introduce authority classes in Narada proper:

```text
derive
propose
claim
execute
resolve
confirm
admin
```

Document each class and map it to allowed call sites.

Minimum policy:

- domain packages may define `derive` and `propose` capabilities
- only Narada runtime-authorized components may perform `claim`, `execute`, `resolve`, or `confirm`
- `admin` requires explicit operator/admin posture
- charter runtime envelopes must expose capability authority class
- preflight should reject operation configs that bind a charter/tool to an authority class it is not allowed to use

## USC Boundary Correction

Apply the policy to `narada.usc`:

Allowed as canonical `narada.usc` commands:

- `init` as `derive`
- `refine` as `derive`
- `plan` as `derive`
- `validate` as `derive`
- `cycle` only if it is a checkpoint/artifact derivation, not execution authority

Not canonical inside `narada.usc`:

- `next`
- `execute`
- `complete`
- `reject`
- `block`
- `loop`

These are operator-class actions. They should either:

- move into Narada proper, or
- be explicitly marked deprecated/non-canonical and removed in the same task sequence; do not leave long-lived deprecated code.

No deprecated code is allowed to remain as final state.

## Implementation Guidance

This task may be completed in two phases if needed, but the final state must be coherent:

1. Narada proper documents and types the authority classes.
2. `narada.usc` is corrected so it is a USC compiler/artifact package, not an operator.

Prefer adding the authority model to:

- `SEMANTICS.md`
- `TERMINOLOGY.md`
- config/tool binding types
- charter runtime capability envelope docs/types
- `AGENTS.md` invariants

Add lint/preflight checks if there is already a suitable location. If not, document the enforcement gap and create a follow-up task.

## Verification

In Narada proper:

```bash
pnpm verify
```

In `narada.usc`:

```bash
pnpm validate
rg -n "next|execute|complete|reject|block|loop" README.md AGENTS.md docs packages
```

Expected:

- no canonical docs advertise USC operator commands
- no active CLI surface exposes USC operator commands unless implemented as calls into Narada proper
- authority classes are documented and typed
- tool/capability declarations can classify authority class

## Definition Of Done

- [ ] Narada proper defines deriver/operator distinction.
- [ ] Authority classes are documented.
- [ ] Authority class appears in tool/capability declarations or an explicit follow-up task exists to wire it.
- [ ] Charter capability envelopes expose or can carry authority class.
- [ ] `narada.usc` canonical role is compiler/artifact package, not operator.
- [ ] USC operator commands are removed or moved behind Narada proper; no deprecated code remains.
- [ ] `pnpm verify` passes in Narada proper.
- [ ] `pnpm validate` passes in `narada.usc`.
- [ ] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
