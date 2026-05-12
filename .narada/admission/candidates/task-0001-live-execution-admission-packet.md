# Task-0001 Live Execution Admission Packet

Packet id: `narada-proper.live-execution-admission.task-0001.v0`
Status: `candidate_pending_admission`
Prepared: 2026-05-10
Source request: `OSM:osm_20260510_135938_545_04b201e1`
Prior report: `OSM:osm_20260510_135815_964_179155b0`

## Purpose

Admit, defer, or reject the external live executions required before Narada proper can claim a receiving Narada Site with live admitted task-lifecycle functionality from `@narada2/site-task-lifecycle`.

This packet does not perform live setup. It names the execution surfaces, authority owners, preconditions, evidence, refusal conditions, rollback posture, and terminal criteria.

## Global Boundaries

- `@narada2/site-task-lifecycle` remains adapter-interface-only.
- The package owns no SQLite dependency.
- The package executes no SQLite mutation.
- The package performs no live MCP registration.
- Do not import narada-andrey runtime DBs, task state, inbox state, roster/checkpoint/operator-surface/PC state, secrets, identity-specific data, or source history.
- External narada-andrey material remains evidence, not Narada proper truth.

## Execution Admissions

### 1. Initializer Execution

Admission id: `narada-proper.exec.task-0001.initializer.v0`
Authority owner: receiving Site authority under Narada proper admission.
Expected surface: admitted task execution surface invoking `initializeSiteTaskLifecycle(options)` from `@narada2/site-task-lifecycle`.
Expected command/tool: no raw command is admitted by this packet; a later admitted carrier may run a package-local Node/tsx harness or equivalent Narada proper task execution tool with the approved options.

Preconditions:

- Receiving Site root is explicitly admitted for writes.
- Initializer options come from `ReceivingSiteSetupPlan.initializerOptions`.
- Roster identities are neutral.
- Source import refs are empty or refusal-checked.

Required evidence:

- Approved setup plan.
- Before/after file list under receiving Site root.
- Created `.ai/` task lifecycle directories and local admission manifest.
- Confirmation no source Site DB/history/state was copied.

Refusal conditions:

- Target root is not admitted for writes.
- Initializer options include source Site DB/history/state.
- Local identities are non-neutral or identity-specific to narada-andrey.
- Execution would mutate `D:\code\narada` outside the admitted receiving Site scope.

Rollback posture:

- Remove only initializer-created directories/manifests if no later admitted DB mutation depends on them.
- Preserve packet, audit, and OSM evidence.

Terminal criterion:

- Receiving Site has local task lifecycle paths and local admission manifest created under admitted authority.

### 2. Concrete Adapter Admission

Admission id: `narada-proper.exec.task-0001.concrete-adapter.v0`
Authority owner: receiving Site storage authority.
Expected surface: separate Narada proper storage adapter admission surface implementing `TaskDbAdapter`.
Expected command/tool: no concrete adapter command is admitted by this packet; a later packet must name the adapter package/runtime and its driver/dependency decision.

Preconditions:

- Adapter implementation is outside `@narada2/site-task-lifecycle`.
- Adapter has conformance evidence matching `TaskDbAdapterConformanceContract`.
- Driver/dependency ownership is declared by receiving Site storage authority.

Required evidence:

- Adapter id and owning package/runtime.
- Conformance result.
- Dependency/driver decision.
- Rollback and closeout plan for real DB writes.
- No source Site DB/history/state import proof.

Refusal conditions:

- Adapter imports narada-andrey DBs or history.
- Adapter makes `@narada2/site-task-lifecycle` own a SQLite dependency.
- Adapter has no rollback/closeout evidence path.
- Adapter bypasses receiving Site authority.

Rollback posture:

- Remove or disable only the admitted concrete adapter binding.
- Preserve package descriptor evidence and conformance records.

Terminal criterion:

- Concrete adapter is admitted outside the package and proves required schema/write/event capabilities.

### 3. DB Mutation Execution

Admission id: `narada-proper.exec.task-0001.db-mutation.v0`
Authority owner: receiving Site task DB authority.
Expected surface: admitted concrete adapter execution of `TaskDbAdapterExecutionRequest` and `TaskAdmissionWriteRequest`.
Expected command/tool: no DB mutation command is admitted by this packet; a later execution task must name the concrete adapter invocation.

Preconditions:

- Initializer execution completed.
- Concrete adapter admission completed.
- Task DB path is under the admitted receiving Site root.
- Write request evidence refs are refusal-checked.

Required evidence:

- Schema execution result.
- Task admission write execution result.
- Post-write readback or equivalent confirmation.
- Idempotency behavior or duplicate-write prevention evidence.
- Rollback evidence for the admitted write batch.

Refusal conditions:

- Mutation targets source Site DB.
- Mutation imports source task or inbox history.
- Mutation lacks idempotency/rollback evidence.
- Mutation is attempted through package code rather than admitted adapter authority.

Rollback posture:

- Use adapter-owned rollback for only the admitted write batch.
- Preserve external evidence and package source.

Terminal criterion:

- Receiving Site task DB contains admitted schema and at least one locally admitted task record.

### 4. Live MCP Registration

Admission id: `narada-proper.exec.task-0001.mcp-registration.v0`
Authority owner: Narada proper MCP/runtime authority.
Expected surface: Narada proper live MCP registration/admission surface for the descriptor produced by `buildMcpRuntimeBindingRequest`.
Expected command/tool: no live MCP registration command is admitted by this packet; a later Narada proper MCP task surface must name the concrete registration tool/transport.

Preconditions:

- Runtime binding request is approved.
- Concrete adapter admission and DB mutation admission are complete or tool exposure is constrained to non-mutating descriptor calls.
- Tool permissions cannot mutate without adapter authority.

Required evidence:

- Approved MCP runtime binding request.
- Transport registration evidence.
- Tool list/readiness proof.
- Smoke test constrained by adapter authority.
- Unregistration/rollback route.

Refusal conditions:

- Registration bypasses Narada proper authority.
- Tools can mutate without admitted adapter authority.
- Registration imports source Site state, PC state, secrets, or identity-specific narada-andrey data.
- Runtime binding implies package-owned SQLite mutation.

Rollback posture:

- Unregister only the admitted MCP binding.
- Preserve setup, admission, and OSM evidence.

Terminal criterion:

- Narada proper can invoke task lifecycle tools through live MCP without bypassing adapter authority.

## Terminal State Criteria

Terminal live Site setup is claimable only after all four execution admissions are admitted, executed, and verified:

- Initializer execution completed under admitted receiving Site authority.
- Concrete adapter admitted outside `@narada2/site-task-lifecycle`.
- DB mutation executed and confirmed through admitted adapter authority.
- Live MCP registration admitted, executed, and smoke-tested under Narada proper runtime authority.
- No narada-andrey DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets/identity state or source history imported.

## Current Decision

This packet is enough to support a Narada proper admission decision for live execution planning.

It is not enough by itself to execute live setup because no concrete adapter command/tool, DB mutation carrier, or live MCP registration surface has been admitted in this packet.
