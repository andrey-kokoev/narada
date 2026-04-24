---
status: closed
closed: 2026-04-23
governed_by: task_close:a2
created: 2026-04-23
depends_on: [531]
---

# Task 532 - Gmail / Google Workspace Provider Contract

## Goal

Specify how Gmail / Google Workspace fits the canonical mail-connectivity boundary and what would be required to support it without Microsoft-specific leakage.

## Required Work

1. Map Gmail / Google Workspace capabilities onto the canonical mail boundary from Task 531.
2. Identify the provider-specific deltas:
   - auth posture,
   - sync/change model,
   - message/thread identity,
   - draft/send semantics,
   - confirmation/reconciliation.
3. State what is straightforward reuse vs what requires new adapter work.
4. Record bounded blockers and risks.
5. Write the provider contract to `.ai/decisions/`.

## Acceptance Criteria

- [x] Gmail provider contract exists.
- [x] Boundary fit against Task 531 is explicit.
- [x] Reuse vs new adapter work is explicit.
- [x] Bounded blockers are recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

1. **Gmail provider contract produced:** `.ai/decisions/20260423-532-gmail-google-workspace-provider-contract.md` documents:
   - Boundary fit summary: all 7 required components are implementable
   - Provider-specific deltas across 6 dimensions: auth, sync/change model, message/thread identity, draft/send semantics, labels vs folders, confirmation/reconciliation
   - Straightforward reuse (8 components) vs new adapter work (10 components, ~1,500–2,000 lines, 2–3 weeks)
   - 7 bounded blockers/risks with severity and mitigation
   - Capability parity matrix showing full parity except custom categories
   - 5 invariants

2. **Research conducted:** Gmail API History API, OAuth verification requirements, draft/send semantics, label model, message identity, and reconciliation approaches were researched via web search.

3. **No code changes required.** This is a documentation and contract task.

## Verification

- `pnpm verify` — all 5 steps pass (task file guard, typecheck, build, charters tests, ops-kit tests).
- `pnpm typecheck` — all packages pass.
- Decision 531 boundary contract reviewed and confirmed comprehensive enough to host Gmail.
- No Graph-specific code exists in kernel layers (`facts/`, `context/`, `work/`, `policy/`, `intent/`, `observability/`).

**governed_by: task_close:a2**


