---
status: closed
closed: 2026-04-21
depends_on: [208, 209, 210]
---

# Task 311 — Correct Operator-Family Doc Drift After Mailbox Send Path

## Context

Tasks 208, 209, and 210 established the Selection, Promotion, and Inspection operator families.

Review found one substantive residual drift in the Promotion family after the later mailbox send path hardened around explicit draft approval:

```text
draft_ready -> approved_for_send -> sending -> submitted
```

`SEMANTICS.md §2.10` and Task 209 still describe manual outbound promotion as:

```text
outbound_command: draft_ready -> submitted
```

That is no longer the correct authority boundary. Manual operator promotion approves the draft for send. The outbound send execution worker performs the actual send and transitions through `sending` to `submitted`.

Selection and Inspection looked directionally clean, but their task evidence should be checked for stale verification or implementation-location claims while this corrective pass is open.

## Goal

Align canonical operator-family docs and task evidence with the current mailbox outbound authority path.

## Required Work

### 1. Correct Promotion Canonical Semantics

Update `SEMANTICS.md §2.10` so outbound send promotion is described as:

```text
outbound_command: draft_ready -> approved_for_send
```

with authority:

```text
execute
```

Then describe:

```text
approved_for_send -> sending -> submitted
```

as worker-owned effect execution, not manual promotion.

Do not describe any manual operator path as directly promoting `draft_ready` to `submitted`.

### 2. Map Existing `approve_draft_for_send`

In `SEMANTICS.md §2.10.3`, map:

```text
approve_draft_for_send -> outbound_command: draft_ready -> approved_for_send, manual, execute
```

Keep `retry_failed_work_items` as the first implemented bulk promotion if accurate, but ensure implementation location is current.

### 3. Correct Task 209 Evidence

Update `.ai/tasks/20260419-209-promotion-operator-family.md` execution evidence if stale.

At minimum verify:

- `retry_failed_work_items` implementation location is current after the canonical executor moved into `@narada2/control-plane`.
- references to daemon-local `PERMITTED_OPERATOR_ACTIONS` are not stale if the code now re-exports from control-plane.
- the documented missing transition is now `draft_ready -> approved_for_send`, not `draft_ready -> submitted`.

### 4. Spot-Check Tasks 208 and 210 Evidence

Check `.ai/tasks/20260419-208-selection-operator-family.md` and `.ai/tasks/20260419-210-inspection-operator-family-alignment.md` for stale claims caused by later code movement or verification policy changes.

Only correct concrete stale claims. Do not rewrite the tasks.

### 5. Preserve Boundaries

Do not add new promotion behavior. This is a documentation/evidence correction task unless a tiny doc-link fix is needed.

## Non-Goals

- Do not implement new promotion surfaces.
- Do not change outbound state machine code.
- Do not change operator action behavior.
- Do not rename CLI flags, DB columns, package APIs, or task numbers.
- Do not rerun broad test suites.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Acceptance Criteria

- [x] `SEMANTICS.md §2.10` no longer says manual outbound promotion is `draft_ready -> submitted`.
- [x] `SEMANTICS.md §2.10` explicitly maps `approve_draft_for_send` to `draft_ready -> approved_for_send`.
- [x] Worker-owned `approved_for_send -> sending -> submitted` is distinguished from manual promotion.
- [x] Task 209 evidence no longer points at stale implementation locations or stale transition names.
- [x] Tasks 208 and 210 are spot-checked; no concrete stale claims found.
- [x] No runtime behavior is changed.
- [x] No derivative task-status files are created.

## Suggested Verification

Documentation-focused:

```bash
rg "draft_ready.*submitted|approve_draft_for_send|retry_failed_work_items|PERMITTED_OPERATOR_ACTIONS" SEMANTICS.md .ai/tasks/20260419-208-selection-operator-family.md .ai/tasks/20260419-209-promotion-operator-family.md .ai/tasks/20260419-210-inspection-operator-family-alignment.md packages/layers/control-plane/src/operator-actions packages/layers/daemon/src/observation
pnpm verify
```

If no code changes are made, `rg` evidence plus task-file guard is sufficient.

## Execution Notes

### SEMANTICS.md §2.10 fixes

**§2.10.1 Promotable Objects and Transitions table**
- Changed `outbound_command` target state from `submitted` to `approved_for_send`.
- Authority remains `execute`.

**§2.10.3 Existing Actions Mapped to Promotion Algebra**
- Added `approve_draft_for_send` → `outbound_command: draft_ready → approved_for_send`, manual, `execute`, with explicit note that the actual send is performed by the outbound worker.

**§2.10.4 Evolution Note**
- Changed `outbound_command: draft_ready → submitted` to `draft_ready → approved_for_send`.
- Added sentence: "The `approved_for_send → sending → submitted` path is worker-owned effect execution, not manual promotion."

### Task 209 evidence fixes

- **Transition table (line 50)**: Changed `outbound_command` target from `submitted` to `approved_for_send`.
- **Specific Gap #4**: Changed "manually advance them to `submitted`" to "manually advance them to `approved_for_send`" with worker-owned clarification.
- **Design section "Manual draft → approve for send"**: Updated design question and requirements to reference `approved_for_send`, noting worker performs actual send.
- **Implementation evidence**: Corrected stale daemon-local claim. Now documents:
  - Canonical `PERMITTED_OPERATOR_ACTIONS` and executor live in `packages/layers/control-plane/src/operator-actions/executor.ts`
  - Daemon observation layer re-exports from `@narada2/control-plane`

### Tasks 208 and 210 spot-check

- **Task 208 (Selection)**: No stale claims found. Evidence is selection-specific and does not reference send-path transitions or stale implementation locations.
- **Task 210 (Inspection)**: No stale claims found. Evidence is inspection-specific and docs-only.

### Verification

- `rg "draft_ready.*submitted" SEMANTICS.md .ai/tasks/20260419-209-promotion-operator-family.md` — no matches.
- `pnpm build` — clean across all packages.
