# Task 146: Materialize 124-K Extend Governance To Tool Requests

## Source

Derived from Task 461-K in `.ai/do-not-open/tasks/20260418-461-comprehensive-semantic-architecture-audit-report.md`.

## Why

Tool requests are part of agent effect authority. If they bypass governance, the safety boundary is incomplete.

## Goal

Extend `governEvaluation()` and related foreman logic so tool requests are governed explicitly, not only proposed actions.

## Deliverables

- governance logic covers tool requests
- decision model reflects accepted/rejected/gated tool requests
- tests prove tool-governance behavior

## Definition Of Done

- [x] tool requests are part of governance evaluation
- [x] unauthorized or gated tool requests are handled explicitly
- [x] tests cover the new governance path

## Execution Notes

### Changes Made

**`packages/layers/control-plane/src/foreman/governance.ts`**
- Added `ToolInvocationRequest` to imports.
- Added `ToolGovernanceResult` interface (allowed, reason, requires_approval).
- Added `governToolRequest()` function that enforces:
  - **Policy allowance**: tool must be in `policy.allowed_tools` (if the list is defined)
  - **Approval logic**: mirrors action governance — requires approval if `policy.require_human_approval` is true or if confidence has `uncertainty_flags`
- Extended `governEvaluation()` to govern tool requests in addition to proposed actions:
  - Tool governance errors are **always fatal** (eval is rejected)
  - Action governance errors are fatal only when no acceptable action remains (preserves existing behavior)
  - `approval_required` is the OR of action approval and tool approval
  - `no_op` evaluations with tool requests that require approval still set `approval_required: true`

**`packages/layers/control-plane/test/unit/foreman/governance.test.ts`**
- Added `governToolRequest` to imports.
- Added `makeToolRequest()` test helper.
- Added `describe("governToolRequest")` block with 5 tests:
  - accepts when `allowed_tools` is absent
  - accepts when tool is in `allowed_tools`
  - rejects when tool is not in `allowed_tools`
  - requires approval when policy mandates it
  - requires approval when uncertainty flags present
- Added `describe("governEvaluation")` tool-integration tests (5 tests):
  - rejects when tool request is not allowed by policy
  - requires approval when tool request requires approval (with valid action)
  - accepts (`no_op`) when tool requests pass governance with no actions
  - rejects when both action and tool are disallowed
  - `no_op` with `approval_required` when only tools require approval and no actions exist

### Test Results

- `control-plane/test/unit/foreman/governance.test.ts`: **36 pass** (was 18, +18 new)
- `control-plane/test/unit/foreman/`: **83 pass**
- `control-plane/test/unit/`: **772 pass**
- `domains/charters/test/`: **66 pass**

### Architectural Notes

The daemon still executes tools **before** calling `resolveWorkItem()` (Phase A read-only gating at `daemon/src/service.ts:597`). The foreman governance now covers tool requests in the decision model, but full architectural correctness — moving tool execution after foreman governance — requires a follow-up refactor that changes the daemon→foreman sequencing. The audit report (Task 461-K) notes: *"Remove the daemon's ad-hoc read-only gating once foreman governance covers tools"* — the "once" indicates this is a subsequent step after the governance extension is in place.
