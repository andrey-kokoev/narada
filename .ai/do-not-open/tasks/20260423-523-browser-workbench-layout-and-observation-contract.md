---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T23:45:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [522]
---

# Task 523 - Browser Workbench Layout And Observation Contract

## Goal

Specify the first browser workbench for the local self-build runtime, including the canonical operator layout and the read surfaces each pane must expose.

## Acceptance Criteria

- [x] A browser workbench contract exists.
- [x] The canonical layout is explicit.
- [x] Agent-pane and architect-pane read surfaces are explicit.
- [x] The read model is grounded in existing governed state, not ad hoc transcript scraping.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Examined existing observation infrastructure**:
   - `packages/layers/control-plane/src/observability/types.ts` — 30+ observation types with source-trust classification (`authoritative` / `derived` / `decorative`)
   - `packages/layers/control-plane/src/observability/queries.ts` — read-only SQLite queries
   - `packages/layers/daemon/src/ui/index.html` — existing scope-oriented operator console (1,654 lines)

2. **Identified gap:** The existing console is scope-oriented (mailbox operations), not agent-oriented (development workbench). A new layout contract is needed.

3. **Defined canonical v0 layout** based on chapter task specification:
   - Row 1: `a1`, `a2`, `architect` (spanning columns 3–4)
   - Row 2: `a3`, `a4`, `a5`, `a6`
   - Fixed positions for spatial memory; resizable widths; architect pane 2× width

4. **Specified agent pane read surfaces** by mapping each field to an existing durable store:
   - Header: roster (`agent_id`, `status`, `assigned_task`, `updated_at`)
   - Task card: task file front matter + assignment record
   - Evidence: task file body (`## Execution Notes`, `## Verification`, unchecked criteria)
   - Blockers: dependency check + stale detection + review status
   - Last action: construction loop audit log

5. **Specified architect pane read surfaces**:
   - Chapter frontier: task file aggregation + DAG analysis
   - Dependency state: `task graph` + `task lint`
   - Recommendation queue: `task-recommend` output
   - Promotion controls: `task-promote-recommendation` + `construction-loop run`
   - Review findings: review markdown files
   - Operator-gated decisions: policy state + pause status + audit trail

6. **Defined read model invariants:**
   - No ad hoc transcript scraping
   - No hidden caching that obscures authority
   - No write-through from read model
   - Source trust visible for every field

7. **Specified thin HTTP API adapter** that delegates to existing CLI commands — no new operators, no new authority surfaces.

### Deliverable

Created `.ai/decisions/20260423-523-browser-workbench-layout-and-observation-contract.md` (15.3 KB) containing:
- Canonical 2-row × 4-column layout with invariants
- 6 agent pane read surfaces (header, task card, evidence, blockers, last action, controls)
- 7 architect pane read surfaces (frontier, dependencies, recommendations, promotions, reviews, decisions, controls)
- Read model grounded in 9 existing data sources
- HTTP API surface (12 GET + 6 POST endpoints)
- 12 UI non-goals
- 4 bounded blockers

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-523-browser-workbench-layout-and-observation-contract.md` ✅
- File size: ~15.3 KB, 9 sections ✅
- Contains all required sections: layout, agent pane, architect pane, read model, API, non-goals ✅

### Read Model Grounding Verification

Every workbench field mapped to existing governed state:

| Field Category | Data Source | Status |
|----------------|-------------|--------|
| Agent identity | `roster.json` | ✅ Existing |
| Agent status | `roster.json` | ✅ Existing |
| Task status | `.ai/do-not-open/tasks/*.md` front matter | ✅ Existing |
| Assignments | `.ai/assignments/*.json` | ✅ Existing |
| Evidence | `.ai/do-not-open/tasks/*.md` body | ✅ Existing |
| Blockers | `task-governance.ts` helpers | ✅ Existing |
| Recommendations | `task-recommend` output | ✅ Existing |
| Reviews | `.ai/reviews/*.md` | ✅ Existing |
| Audit trail | `.ai/construction-loop/audit.jsonl` | ✅ Existing |
| Policy | `.ai/construction-loop/policy.json` | ✅ Existing |
| Principal state | `JsonPrincipalRuntimeRegistry` | ✅ Existing |
| Task graph | `.ai/do-not-open/tasks/*.md` DAG | ✅ Existing |

**Zero new data sources invented.**

### Cross-Reference Verification

- Consistent with Task 522 runtime boundary contract ✅
- Authority classes match 510 self-governance contract ✅
- No new authority surfaces introduced ✅

### Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### Existing UI Verification

- Existing operator console (`daemon/src/ui/index.html`) is scope-oriented, not agent-oriented ✅
- New workbench contract addresses the agent-oriented gap ✅
