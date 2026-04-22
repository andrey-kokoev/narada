---
status: closed
depends_on: [406]
---

# Task 409 — Implicit State Machine Inventory

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Dependency assumptions
- Focused verification scope

This is an inventory and prioritization task. Do not implement new state machines.

## Assignment

Inventory the Narada concepts that currently behave like implicit state machines and decide which ones should become explicit, in what order, and why.

## Context

Narada already has explicit state machines for work items, outbound commands, execution attempts, health/Cycles, and construction task governance.

Recent design work has exposed additional concepts that may need explicit lifecycle/state modeling:
- `PrincipalRuntime`
- `SiteAttachment`
- learning artifacts
- credential/capability readiness
- knowledge source readiness
- operation readiness
- chapter lifecycle
- review finding lifecycle
- external observation/reconciliation lifecycle

Not every implicit lifecycle should become a durable state machine. Some should remain advisory, derived, or documented-only.

## Required Reading

- `SEMANTICS.md`
- `.ai/decisions/20260422-397-session-attachment-semantics.md`
- `.ai/tasks/20260422-406-principal-runtime-state-machine-design.md`
- `.ai/decisions/20260422-396-narada-learning-loop-design.md`
- `docs/product/bootstrap-contract.md`
- `docs/product/operator-loop.md`
- `docs/deployment/windows-credential-path-contract.md`
- `packages/layers/control-plane/src/outbound/types.ts`
- `packages/layers/control-plane/src/coordinator/types.ts`
- `packages/layers/control-plane/src/health.ts`
- `packages/layers/cli/src/lib/task-governance.ts`

## Required Work

1. Produce an inventory artifact.

   Create:
   - `.ai/decisions/20260422-409-implicit-state-machine-inventory.md`

2. Classify each candidate.

   For each candidate, include:
   - current implicit states;
   - current storage or evidence source;
   - whether it is authoritative, advisory, or derived;
   - consequences of leaving it implicit;
   - consequences of making it explicit;
   - recommended decision: explicit now, explicit later, derived only, advisory only, or no state machine.

3. Include at least these candidates.

   - `PrincipalRuntime`
   - `SiteAttachment`
   - `LearningArtifact`
   - `CredentialReadiness`
   - `KnowledgeSourceReadiness`
   - `OperationReadiness`
   - `ChapterLifecycle`
   - `ReviewFindingLifecycle`
   - `ExternalObservationLifecycle`

4. Prioritize.

   Produce a ranked list of at most five state machines that should be made explicit first.

   Rank by:
   - reduction in manual choreography;
   - authority-boundary clarity;
   - live-operation usefulness;
   - implementation risk;
   - risk of premature abstraction.

5. Define extraction criteria.

   State the rule for when a lifecycle deserves a durable state machine.

   The rule must protect against performative complexity. A lifecycle should become explicit only if doing so preserves invariants, removes recurring ambiguity, or enables bounded automation.

6. Propose follow-up tasks only if needed.

   If follow-up tasks are needed, propose titles and dependency order. Do not create them unless explicitly instructed.

## Non-Goals

- Do not implement schema changes.
- Do not create runtime state machine code.
- Do not rename existing states.
- Do not add new CLI commands.
- Do not create a generic state-machine framework.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Inventory artifact exists at `.ai/decisions/20260422-409-implicit-state-machine-inventory.md`.
- [x] Each candidate is classified as authoritative, advisory, derived, or no-state-machine.
- [x] Top priority list is ranked and justified.
- [x] Extraction criteria are explicit and guard against performative complexity.
- [x] Follow-up tasks are proposed only if needed.
- [x] No implementation code is added.
- [x] No derivative task-status files are created.

## Execution Notes

Task completed prior to Task 474 closure invariant. Decision artifact `.ai/decisions/20260422-409-implicit-state-machine-inventory.md` created. All nine candidates classified (PrincipalRuntime, SiteAttachment, LearningArtifact, CredentialReadiness, KnowledgeSourceReadiness, OperationReadiness, ChapterLifecycle, ReviewFindingLifecycle, ExternalObservationLifecycle). Top-5 priority list ranked with justification. Extraction criteria explicitly guard against performative complexity. No implementation code added.

## Verification

Verified by inspecting `.ai/decisions/20260422-409-implicit-state-machine-inventory.md`.
