# Decision 20260420-282: Operation Realization Cavities

> **Authority**: Task 282 (Operation Realization chapter definition).

## Why This Chapter Exists

Narada is now relatively coherent in semantics, operator surface, and task governance. The main remaining gap is not another internal abstraction pass. It is that a first-time user still does not get from intent to a convincingly live operation with low ceremony and durable, inspectable behavior.

The next chapter should therefore target **Operation Realization**: the shortest coherent path from "I want Narada to do this operation" to a running operation that performs useful work under real constraints.

## Cavity 1: Intent → Runnable Operation Is Still Too Manual

**User-facing impact**: High. A new user still needs too much repo/config/process knowledge to get from intent to a running operation.

**Implementation area**: CLI bootstrap path, ops-repo initialization, repo docs/templates.

**Specific gaps**:
- No single canonical walkthrough from user intent to runnable operation
- Ops-repo bootstrap exists, but the path is not yet treated as the primary product flow
- "What files do I edit next?" remains too implicit
- First-run validation is spread across commands rather than framed as one bootstrap contract

**Chapter fit**: Yes.

**Deferred?**: No.

---

## Cavity 2: Real Executor Attachment Is Not Yet a Proven Default Path

**User-facing impact**: High. Narada can evaluate and govern, but the path from configured charter runtime to durable useful execution is still not proven as the default operational path.

**Implementation area**: charter runner wiring, runtime config, operation templates, docs.

**Specific gaps**:
- The intended executor path for real operations is not expressed as a single canonical flow
- Draft-first mailbox support exists, but the runtime attachment still feels assembled rather than native
- Failure/degraded behavior for missing executor config is not yet part of a clean first-run story

**Chapter fit**: Yes.

**Deferred?**: No.

---

## Cavity 3: The First Real Vertical Is Not Yet Treated As A Product Proof

**User-facing impact**: High. A support mailbox is the first real use case, but Narada does not yet present it as a coherent vertical proof with fixtures, runbook, and acceptance contract.

**Implementation area**: examples/ops repo relationship, mailbox vertical fixtures, live-operation docs.

**Specific gaps**:
- The first mailbox operation is not yet packaged as the canonical proof of usefulness
- Fixture-backed and live-backed operation paths are not explicitly paired
- Ops repo and public repo responsibilities are clearer than before, but not yet fully codified at the operation-proof level

**Chapter fit**: Yes.

**Deferred?**: No.

---

## Cavity 4: Operator Ergonomics For A Live Operation Are Still Thin

**User-facing impact**: Medium to high. Once an operation is running, the operator should have a short, obvious loop for "is it healthy, what happened, what needs approval, what draft was proposed".

**Implementation area**: CLI/UI run surfaces, runbook/docs, status/show/audit integration.

**Specific gaps**:
- Core live-operation commands exist, but the minimal operating loop is not packaged as one coherent surface
- Inspection surfaces are rich, but not yet shaped around the first-operation experience
- Approval/draft review loop is present, but not yet presented as the normal operational rhythm

**Chapter fit**: Yes.

**Deferred?**: No.

---

## Cavity 5: Real-World Degraded States Need Product-Level Treatment

**User-facing impact**: High. Missing credentials, stale auth, missing runtime, and partial operation failure are part of the actual user journey.

**Implementation area**: doctor/preflight/runbook/degraded-state behavior.

**Specific gaps**:
- Some degraded paths exist technically, but are not unified into an operation-realization contract
- "Not configured enough to run" vs "running in draft-safe mode" vs "broken and needs intervention" is not yet presented clearly
- Recovery from first-run and day-2 failures is still too distributed

**Chapter fit**: Yes.

**Deferred?**: Partial. Deep production hardening can defer; first-operation degraded-state contract should not.

---

## Proposed Chapter Shape

Minimal next task set:

| Task | Deliverable |
|------|-------------|
| 283 | Intent-to-operation bootstrap contract |
| 284 | Real executor attachment and degraded-state contract |
| 285 | First mailbox operation as end-to-end product proof |
| 286 | Operator live-loop ergonomics |
| 287 | Chapter closure |

## Out Of Chapter

These are related but should stay out unless directly required:

| Topic | Why Out |
|------|---------|
| Multi-operation orchestration | The next proof should be one convincing operation, not fleet management |
| Autonomous send defaulting | Draft-first remains the safer baseline for first real proof |
| Deep production deploy automation | Useful later, but not required to prove operation realization |
| Broad new verticals beyond mailbox | The point is to make the first vertical convincingly real |
