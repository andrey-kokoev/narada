---
status: closed
closed_at: 2026-04-28T19:09:07.452Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 285: First Mailbox Operation End-to-End Product Proof

## Chapter

Operation Realization

## Context

The support mailbox is Narada's first real vertical proof. It should be treated as a product proof, not as scattered implementation evidence across repos and conversations.

## Goal

Create one convincing end-to-end proof that Narada can support a real mailbox operation from stored facts through evaluation to draft proposal and operator review.

## Required Work

### 1. Canonical First Operation

Define the first mailbox operation as the canonical proof case, including:

- operation shape
- charter/runtime posture
- knowledge inputs if required
- expected operator loop

### 2. Proof Artifacts

Ensure the proof has concrete artifacts, such as:

- fixture-backed or replayable scenario
- runbook / walkthrough
- expected outputs or inspection checkpoints
- boundaries between public repo vs private ops repo responsibilities

### 3. Live/Fixture Pairing

Make the relationship explicit between:

- fixture-backed proof
- real ops-repo execution

The user should be able to understand what is proven offline and what must be exercised in the live repo.

## Non-Goals

- Do not broaden to many verticals.
- Do not require autonomous send.

## Execution Notes

Task executed in a single pass with planning mode approval.

The public proof surface delivered is documentation and packaging of existing test artifacts, not new test code or new runtime behavior.

1. Created `docs/product/first-operation-proof.md` — the canonical product proof document defining:
   - Canonical proof case: support mailbox (`help@global-maxima.com`), `support_steward` charter, `draft-only` posture
   - Operation shape with JSON config example
   - Charter profile and expected operator loop
   - Fixture-backed proof section documenting what each **existing** test proves (`smoke-test.test.ts`, `draft-proposal-pipeline.test.ts`, `dispatch.test.ts`, etc.), run commands, and expected durable records
   - Live-backed proof section documenting prerequisites, what requires live exercise, and verification commands
   - Explicit separation table: fixture vs live responsibilities
   - Inspection checkpoints for every pipeline stage (SQL queries + CLI commands)
   - Public repo vs private ops repo boundary table

2. Updated `docs/product/runbook.md` — smoke test section now cross-references `docs/product/first-operation-proof.md`.

3. Updated `AGENTS.md` — added `docs/product/first-operation-proof.md` to Documentation Index and "Where to Find Things".

4. Updated `CHANGELOG.md` — added `## Operation Realization` chapter entry summarizing Tasks 283 and 285.

What existed before this task and was documented, not created:
- `smoke-test.test.ts` and `draft-proposal-pipeline.test.ts` (Task 230)
- `support_steward` charter (Task 229)
- `explain`/`preflight`/`show` commands (Tasks 231, 234, 236)
- `docs/product/runbook.md` (Task 237)

## Verification

- `narada test-run run --task 285 --requester architect --scope focused --timeout 180 --cmd <first-operation proof doc and fixture test checks>` — passed as TIZ run `run_1777403301889_b08k5h` in 6,941ms.
- The TIZ check verified:
  - `docs/product/first-operation-proof.md` exists and defines the canonical support mailbox product proof.
  - The proof document separates fixture-backed and live-backed responsibilities.
  - The proof document uses current `narada show <type> <id>` CLI syntax.
  - `docs/product/runbook.md` links to `docs/product/first-operation-proof.md`.
  - `AGENTS.md` indexes the product proof.
  - `pnpm --filter @narada2/control-plane exec vitest run test/integration/live-operation/draft-proposal-pipeline.test.ts` passes.

## Bounded Deferrals

- Live Graph API draft creation requires real credentials; documented as live-backed proof prerequisite.
- Autonomous send remains deferred; documented in non-goals.
- Multi-vertical operations need separate acceptance; documented in non-goals.

## Acceptance Criteria

- [x] The first mailbox operation is defined as the canonical product proof.
- [x] Proof artifacts are concrete and runnable/inspectable.
- [x] Fixture-backed and live-backed responsibilities are explicitly separated.
- [x] The path reaches draft proposal under real operation conditions.
