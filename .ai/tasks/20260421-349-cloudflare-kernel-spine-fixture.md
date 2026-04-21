---
status: closed
depends_on: [346, 347, 348]
closed: 2026-04-21
---

# Task 349 — Cloudflare Kernel Spine Fixture

## Context

Tasks 345–348 replace placeholder Cloudflare Cycle steps with typed, fixture-backed kernel-spine behavior.

This task proves the whole path end-to-end.

## Goal

Create a focused fixture proving:

```text
fixture delta
-> durable fact
-> context/work
-> evaluation evidence
-> decision
-> intent/handoff
-> separate observation
-> confirmation
-> trace/health
```

## Required Work

### 1. Build end-to-end fixture

Use no live credentials and no network.

The fixture must run through `runCycle()` or the real Worker `/cycle` handler, not isolated helper calls only.

### 2. Assert boundaries

The fixture must assert:

- facts are distinct from context/work
- evaluation is distinct from decision
- decision is distinct from intent/handoff
- confirmation requires separate observation
- trace/health are observation/evidence, not authority

### 3. Update docs if needed

Update `docs/deployment/cloudflare-site-materialization.md` §8 if the implementation changes the v0/v1 reality notes.

### 4. Verification

Focused tests should pass without broad suite reliance.

## Non-Goals

- Do not add live Graph access.
- Do not add real send/draft mutation.
- Do not claim production readiness.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] End-to-end fixture proves the kernel spine through `runCycle()` or `/cycle`.
- [x] Boundary assertions cover IAS anti-collapse chain.
- [x] Documentation reflects actual implementation state.
- [x] Focused verification passes.
- [x] No derivative task-status files are created.

## Execution Notes

**Implementation:**

1. `packages/sites/cloudflare/test/unit/kernel-spine-fixture.test.ts` — 6 end-to-end fixture tests:
   - Full kernel spine through `runCycle()` with real SQLite-backed coordinator
   - Two-cycle pattern: first cycle creates pipeline, second cycle reconciles with actual observation
   - IAS boundary: facts distinct from context/work
   - IAS boundary: evaluation distinct from decision
   - IAS boundary: decision distinct from intent/handoff
   - IAS boundary: confirmation requires separate observation
   - Trace/health are advisory, not authority

2. `docs/deployment/cloudflare-site-materialization.md` — Updated §8 "Cycle Runner v0 Reality" to reflect that steps 2–6 are now fixture-backed kernel-spine handlers (not placeholder no-ops), while noting that live source sync, charter runtime, and effect execution remain deferred to v1.

**Verification:**
- `npx vitest run test/unit/kernel-spine-fixture.test.ts` — 6/6 pass
- Full Cloudflare suite — 133/133 pass across 17 test files
- `pnpm verify` — 5/5 pass

## Suggested Verification

```bash
pnpm --filter @narada2/cloudflare-site exec vitest run <kernel spine fixture test>
pnpm verify
```

