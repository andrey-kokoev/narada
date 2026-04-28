---
status: closed
closed_at: 2026-04-28T19:11:28.382Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 286: Operator Live-Loop Ergonomics

## Chapter

Operation Realization

## Context

Even with a runnable operation, Narada still needs a short, obvious operating loop for day-to-day use. The system already has inspection and audit surfaces, but they are not yet shaped into one coherent live-operator rhythm.

## Goal

Make the minimal operator loop for a live operation obvious, short, and durable.

## Required Work

### 1. Define The Core Operator Loop

Express the minimal loop clearly:

- is it healthy?
- what happened?
- what needs attention?
- what draft/proposal exists?
- what should the operator do next?

### 2. Align Surfaces To The Loop

Shape CLI/UI/runbook surfaces so they support that loop directly rather than requiring the operator to assemble it from many commands.

### 3. Live-Operation Runbook

Document the normal operating rhythm and the minimal troubleshooting rhythm for a live operation.

## Non-Goals

- Do not redesign every UI surface.
- Do not build fleet dashboards.

## Execution Notes

Task executed in a single pass with planning mode approval.

1. Created `docs/product/operator-loop.md` — the canonical five-step operator loop document:
   - Step 1: Is it healthy? (`narada ops`, `narada doctor`)
   - Step 2: What happened? (`narada ops` recent activity, `narada show`)
   - Step 3: What needs attention? (`narada ops` attention queue, `narada status --verbose`)
   - Step 4: What draft exists? (`narada ops` drafts pending review, disposition commands)
   - Step 5: What do I do next? (`narada ops` suggested actions)
   - Normal operating rhythm: morning check (5 min), mid-day triage (2 min), evening check (3 min)
   - First troubleshooting steps: doctor → status --verbose → show → logs → health file → recover --dry-run
   - CLI/UI mapping table

2. Created `packages/layers/cli/src/commands/ops.ts` — new `narada ops` CLI command:
   - Composes existing observability queries into one read-only dashboard
   - Sections: Health, Recent Activity, Attention Queue, Drafts Pending Review, Suggested Next Actions
   - Supports `--format json|human` and `--limit <n>`
   - Multi-scope aware (iterates all scopes in config)
   - Read-only: uses `.all()` and `.get()` queries, no `.run()` or `.exec()`

3. Updated `packages/layers/cli/src/main.ts` — wired `narada ops` command.

4. Updated `packages/layers/cli/src/lib/formatter.ts` — added `getFormat()` method for conditional human output.

5. Updated `docs/product/runbook.md` — added "Operator Daily Loop" section referencing `narada ops` and `docs/product/operator-loop.md`.

6. Updated `AGENTS.md` — added operator loop to Documentation Index and "Where to Find Things".

## Verification

- `narada test-run run --task 286 --requester architect --scope focused --timeout 120 --cmd <operator-loop docs and ops command tests>` — passed as TIZ run `run_1777403449705_j70qqa` in 1,893ms.
- The TIZ check verified:
  - `docs/product/operator-loop.md` defines the five-step loop and troubleshooting rhythm.
  - `docs/product/runbook.md` links to the operator-loop document.
  - `AGENTS.md` indexes the operator-loop document.
  - `packages/layers/cli/test/commands/ops.test.ts` passes.

## Verification Evidence

- `pnpm verify` — 5/5 steps pass
- `pnpm --filter @narada2/cli test` — 175/175 passes
- Typecheck confirms `ops.ts` compiles cleanly
- Formatter `getFormat()` method used correctly in `ops.ts`

## Bounded Deferrals

- `narada ops` does not replace `narada doctor` or `narada status`; it composes them. Deep investigation still requires those commands.
- Fleet/multi-operation dashboard remains deferred (non-goal).
- Real-time UI updates for the operator loop remain deferred; CLI is the primary surface.

## Acceptance Criteria

- [x] A minimal live-operator loop is explicitly defined.
- [x] Existing CLI/UI surfaces are aligned around that loop.
- [x] A runbook exists for normal operation and first troubleshooting steps.
