---
status: closed
created: 2026-04-23
closed_at: 2026-04-23T23:15:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [513, 517]
---

# Task 522 - Local Self-Build Runtime Boundary Contract

## Goal

Define the bounded local runtime for Narada self-build: what it owns, what it exposes, what remains operator-owned, and what must not be smuggled through chat.

## Acceptance Criteria

- [x] A boundary artifact exists.
- [x] Runtime objects and authority boundaries are explicit.
- [x] Governed actions vs read-only observations are explicit.
- [x] v0 non-goals are explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research Phase

1. **Examined existing self-governance and agent-runtime infrastructure**:
   - Self-governance boundary contract (510): authority classes, self-governed vs operator-owned actions
   - Agent runtime boundary contract (514): 14 term mappings to Narada canonical concepts
   - Architect-operator pair model (515): crossing regime with provenance
   - Agent runtime modeling closure (517): what is first-class vs what remains external

2. **Examined existing CLI commands and operators**:
   - `construction-loop.ts`: plan, run, pause, resume, metrics, policy management, 12 hard gates
   - `principal.ts`: attach, detach, status, list, sync-from-tasks
   - `task-roster.ts`: show, assign, done, idle, review
   - `task-recommend.ts`, `task-promote-recommendation.ts`: recommendation → promotion pipeline

3. **Identified runtime objects and their durable stores** by tracing each object to its persistence layer:
   - Tasks → `.ai/tasks/*.md`
   - Assignments → `.ai/assignments/<task-id>.json`
   - Roster → `.ai/roster.json`
   - Principal runtime → `config.json`-adjacent JSON registry
   - Construction loop policy → `.ai/construction-loop/policy.json`
   - Audit log → `.ai/construction-loop/audit.jsonl`

4. **Defined the 7-phase minimum admissible loop** by composing existing operators:
   propose → assign → claim → report → review → continue → close

5. **Identified 8 forbidden chat-smuggling patterns** by comparing chat transport against governed operator paths.

6. **Defined 10 v0 non-goals** including remote execution, browser-native agents, hidden auto-assignment, chat as authoritative transport.

### Deliverable

Created `.ai/decisions/20260423-522-local-self-build-runtime-boundary-contract.md` (16.7 KB) containing:
- 11 runtime objects with durable store mapping and mutability rules
- 3-category action boundary: governed mutations, read-only observations, operator-owned actions
- 7-phase minimum admissible loop with invariants
- 8 forbidden chat-smuggling patterns with correct paths
- 10 v0 non-goals
- Workbench state boundary (decorative vs authoritative)
- Reused vs new component inventory (13 reused, 3 new)

## Verification

### Decision Artifact Verification

- Decision file exists: `.ai/decisions/20260423-522-local-self-build-runtime-boundary-contract.md` ✅
- File size: ~16.7 KB, 11 sections ✅
- Contains all required sections: objects, boundaries, loop, non-goals, workbench, components ✅

### Cross-Reference Verification

- References to Tasks 510, 513, 514, 515, 517 are accurate ✅
- References to existing CLI commands match actual file paths ✅
- Authority class mappings are consistent with 510 ✅
- No new authority classes introduced ✅

### Existing Test Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/task-recommend.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/task-promote-recommendation.test.ts
pnpm --filter @narada2/cli exec vitest run test/commands/principal-bridge.test.ts
```

Results:
- `task-recommend.test.ts`: 21/21 pass ✅
- `task-promote-recommendation.test.ts`: 16/16 pass ✅
- `principal-bridge.test.ts`: 21/21 pass ✅

### Typecheck Verification

- `pnpm typecheck`: all 11 packages pass ✅

### Invariant Verification

Confirmed that the boundary contract:
- Introduces no new durable stores ✅
- Introduces no new authority classes ✅
- Reuses all existing operators without modification ✅
- Treats chat as advisory only ✅
- Preserves operator ownership of terminal transitions ✅
