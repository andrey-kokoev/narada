---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T23:59:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [522, 523]
---

# Task 524 - Local Self-Build Runtime Bridge Plan

## Goal

Define the bounded bridge from Codex/chat agents and operator actions into the local self-build runtime so that chat stops being the hidden transport layer.

## Acceptance Criteria

- [x] A bridge-plan artifact exists.
- [x] Chat/transcript is explicitly demoted from authoritative transport.
- [x] Mutation paths are grounded in governed operators.
- [x] The first executable implementation line is explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Examined existing mutation paths** by tracing all CLI commands that modify durable state:
   - `task-claim`, `task-report`, `task-review`, `task-continue`, `task-release`
   - `task-close`, `task-finish`, `task-promote-recommendation`
   - `task-roster assign/done/idle`
   - `construction-loop run` (12 hard gates)
   - `principal attach/detach`

2. **Examined existing bridge infrastructure**:
   - `principal-bridge.ts`: 5 event mappings (task_claimed → claiming, task_reported → waiting_review, etc.)
   - `console-server-routes.ts`: HTTP API with CORS + control routing
   - `construction-loop-audit.ts`: append-only `audit.jsonl`
   - `task-governance.ts`: atomic roster mutations, append-only assignments

3. **Defined 8 ingress paths** with explicit mutation/no-mutation classification and authority mapping:
   - CLI commands, browser controls, agent reports, reviews, auto-promotion, principal sync, chat, workbench observation

4. **Demoted chat from authoritative transport** by defining what chat may contain (advisory communication) and what it must not serve as (assignment records, status source, audit trail).

5. **Defined mutation routing rules**: 11 mutation types each mapped to a required operator and audit record.

6. **Specified Codex/chat agent representation** through durable artifacts (roster entry, assignment record, report, review) rather than chat presence.

7. **Defined workbench → runtime control routing** with 9 control surface mappings, all delegating to CLI commands.

8. **Prioritized implementation line**: HTTP API adapter first, then workbench HTML/CSS/JS, then pane rendering, then control wiring.

### Deliverable

Created `.ai/decisions/20260423-524-local-self-build-runtime-bridge-plan.md` (15.6 KB) containing:
- 8 ingress paths with mutation classification and authority
- 11 mutation routing rules (required operator + audit record for each)
- Chat demotion specification (advisory only, 5 forbidden uses)
- Agent representation model (4 durable artifacts, state machine)
- Workbench control routing (9 mappings)
- First executable implementation line (6 priorities, fixture/live split)
- 5 bridge invariants

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-524-local-self-build-runtime-bridge-plan.md` ✅
- File size: ~15.6 KB, 9 sections ✅
- Contains all required sections: ingress paths, mutation routing, chat demotion, agent representation, implementation line ✅

### Cross-Reference Verification

- Consistent with Task 522 runtime boundary contract ✅
- Consistent with Task 523 workbench layout contract ✅
- Authority classes match 510 self-governance contract ✅
- CLI command references match actual file paths ✅

### Existing Infrastructure Verification

All referenced infrastructure exists and is functional:

| Component | File | Status |
|-----------|------|--------|
| PrincipalRuntime bridge | `cli/src/lib/principal-bridge.ts` | ✅ Existing |
| Construction loop with 12 gates | `cli/src/commands/construction-loop.ts` | ✅ Existing |
| Console server routes | `cli/src/commands/console-server-routes.ts` | ✅ Existing |
| Audit logging | `cli/src/lib/construction-loop-audit.ts` | ✅ Existing |
| Roster atomic mutations | `cli/src/lib/task-governance.ts` | ✅ Existing |
| Assignment append-only | `cli/src/lib/task-governance.ts` | ✅ Existing |

### Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### Invariant Verification

Confirmed the bridge plan preserves:
- Chat is not state transport ✅
- All mutations route through governed operators ✅
- PrincipalRuntime updates are post-commit and advisory ✅
- Every bridge crossing leaves an audit trail ✅
- Workbench controls are operator-triggered ✅
