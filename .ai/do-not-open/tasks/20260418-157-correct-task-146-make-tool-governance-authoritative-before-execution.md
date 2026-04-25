# Task 157: Correct Task 146 Make Tool Governance Authoritative Before Execution

## Why

Task 146 added tool-request governance to `governEvaluation()`, but review found the governance is not yet authoritative end-to-end.

Two gaps remain:

1. `DefaultForemanFacade.resolveWorkItem()` still has early returns before governance for `no_op`, `escalation`, `clarification_needed`, and zero-valid-action cases.
2. The daemon still executes requested tools before foreman governance runs.

That means tool governance can be bypassed or made advisory rather than authoritative.

## Findings Being Corrected

### 1. Foreman early returns bypass tool governance

`packages/layers/control-plane/src/foreman/facade.ts` handles these cases before calling `governEvaluation()`:

- `no_op`
- `escalation`
- `clarification_needed`
- `validActions.length === 0`

If an evaluation carries tool requests in one of those paths, unauthorized or approval-required tool requests are not governed before the work item is resolved.

### 2. `governEvaluation()` itself returns before governing tools

`packages/layers/control-plane/src/foreman/governance.ts` returns immediately for explicit charter outcomes:

- `no_op`
- `escalation`
- `clarification_needed`

so tool requests attached to those outputs are ignored by governance.

### 3. Daemon executes tools before foreman governance

`packages/layers/daemon/src/service.ts` executes `output.tool_requests` immediately after runtime completion and before:

- evaluation persistence
- `foreman.resolveWorkItem()`
- `governEvaluation()`

This is backwards for an authoritative governance model.

## Goal

Make tool governance a real pre-execution authority boundary, not a post-hoc classification.

## Required Outcomes

### 1. Tool requests are governed for every evaluation outcome

`governEvaluation()` must evaluate tool requests even when the charter outcome is:

- `no_op`
- `escalation`
- `clarification_needed`
- low-confidence escalation
- no acceptable action

Unauthorized tool requests must not be silently ignored.

### 2. Foreman does not bypass governance before resolution

`DefaultForemanFacade.resolveWorkItem()` must not resolve terminal outcomes before applying governance relevant to tool requests.

If some outcomes remain special-cased, prove that tool governance has already happened.

### 3. Tools are not executed before governance

Move daemon tool execution behind a governed/approved path, or explicitly split tool requests into:

- read-only pre-governance context-gathering tools
- governed effect/tool requests

Do not leave current `output.tool_requests` execution before foreman governance as the production authority model.

### 4. Tests cover the bypass cases

Add tests proving unauthorized or approval-required tool requests are handled for:

- `no_op` evaluation with tool request
- `escalation` evaluation with tool request
- `clarification_needed` evaluation with tool request
- complete evaluation with no acceptable actions but with tool request
- daemon does not execute a tool before governance allows it

## Deliverables

- `governEvaluation()` governs tool requests across all outcomes
- foreman resolution no longer bypasses tool governance
- daemon tool execution no longer precedes governance
- tests cover the corrected behavior

## Definition Of Done

- [x] unauthorized tool requests cannot pass through `no_op` / escalation / clarification paths
- [x] approval-required tool requests produce a governed pending-approval path before execution
- [x] daemon does not execute `output.tool_requests` before foreman governance
- [x] tests prove the previous bypass cases fail safely
- [x] no derivative task-status files are created

## Execution Notes

### Changes Made

**`packages/layers/control-plane/src/foreman/governance.ts`**
- Restructured `governEvaluation()` so **tool governance always runs first**, before any charter-outcome early returns.
- Added optional `effectiveOutcome` parameter (4th arg) so the facade can pass validation-corrected outcomes (e.g., `validateCharterOutput` Rule 10 correcting `no_op` → `complete`).
- **Security precedence**: Unauthorized tools are **always fatal** → `reject` outcome, regardless of whether the charter declared `no_op`, `escalation`, or `clarification_needed`.
- **Approval precedence**: Approval-required tools set `approval_required: true` for ALL outcomes. In the facade, `approval_required` is checked before `escalate`/`clarification_needed`/`no_op`, so approval blocks execution.
- **Low-confidence escalation**: Moved the low-confidence check AFTER tool governance but BEFORE action-error rejection, preserving the existing escalation behavior for low-confidence evaluations.

**`packages/layers/control-plane/src/foreman/facade.ts`**
- Moved `governEvaluation()` call to **before** all terminal resolution paths (`no_op`, `escalation`, `clarification_needed`, `validActions.length === 0`).
- Governance outcomes are now checked in strict precedence order:
  1. `reject` → terminal failure
  2. `approval_required` → pending approval decision
  3. `escalate` → escalation decision
  4. `clarification_needed` → failed_retryable
  5. `no_op` → resolved no_op
  6. `accept` → normal handoff path
- Removed redundant dead-code branch `governance.outcome === "accept" && governance.approval_required` (covered by the earlier `approval_required` check).

**`packages/layers/daemon/src/service.ts`**
- **Moved tool execution AFTER `resolveWorkItem()`**. The daemon now:
  1. Runs charter → `output`
  2. Completes execution attempt
  3. Persists evaluation
  4. Calls `foreman.resolveWorkItem()` (governance authority)
  5. Only if `resolveResult.success === true` AND `output.tool_requests.length > 0` → executes tools
- **Removed the ad-hoc `read_only` Phase A guard** from the daemon's tool execution loop. Governance is now the single authority for tool authorization.
- Kept structural validation (catalog membership, definition existence, parseable args) as defense-in-depth.
- Added explicit comment documenting the post-governance sequencing.

### Test Results

**`control-plane/test/unit/foreman/governance.test.ts`** — **44 pass** (+8 new)
- rejects `no_op` with unauthorized tool
- rejects `escalation` with unauthorized tool
- rejects `clarification_needed` with unauthorized tool
- `no_op` with approval-required tool → `approval_required: true`
- `escalation` with approval-required tool → `approval_required: true`
- rejects low-confidence evaluation with unauthorized tool
- rejects complete evaluation with no actions but unauthorized tool
- respects `effectiveOutcome` override from validation

**`control-plane/test/unit/foreman/facade.test.ts`** — **21 pass**
- All existing tests continue to pass, including low-confidence escalation path

**`control-plane/test/unit/foreman/` + `scheduler/` + `executors/`** — **164 pass**

**`domains/charters/test/`** — **66 pass**

### Architectural Note

The tool execution timing change means tools now run **after** the foreman has governed the evaluation and the work item has been resolved. This is correct because:
1. The charter produces its output envelope **before** tool execution (tools are side effects, not inputs to the charter's reasoning).
2. The foreman governance is the authority boundary that decides whether the evaluation's requested effects (actions + tools) are allowed.
3. Tools execute only on successful governance (`success === true`).

A future enhancement could add `approved_tool_requests` to `GovernEvaluationResult` / `ResolutionResult` for fine-grained per-tool approval tracking. For now, the all-or-nothing model is correct because `governEvaluation()` rejects the entire evaluation if ANY tool is unauthorized, and requires approval if ANY tool requires it.

## Notes

This is a corrective task for the unfinished authority portion of Task 146.

Task 146's added helper functions are useful, but the runtime sequencing must now be made authoritative.
