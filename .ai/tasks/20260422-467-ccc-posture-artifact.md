---
status: closed
depends_on: [395, 426, 464]
closed_at: 2026-04-23T14:04:30.061Z
closed_by: a2
---

# Task 467 — CCC Posture Artifact and Recommender Input

## Context

Task 464 defined `CCCPosture` as a narrow advisory artifact to prevent arbitrary next-task selection in the Narada Self-Build Operation. CCC (coherence / constructive / counterweight) posture captures six coherence coordinates from Decision 395:

- `semantic_resolution`
- `invariant_preservation`
- `constructive_executability`
- `grounded_universalization`
- `authority_reviewability`
- `teleological_pressure`

Without an inspectable artifact, CCC lives only in design documents. Commands cannot consult it. The risk is that `task recommend` selects locally optimal but globally incoherent next tasks.

## Goal

Implement `CCCPosture` as a structured advisory signal that:
1. Is stored as a versioned JSON file.
2. Is readable by CLI commands.
3. Influences `task recommend` scoring without hard-filtering.
4. Can be ignored, overridden, or allowed to expire gracefully.

## Required Work

### 1. Define CCC posture schema

Create `.ai/postures/schema.json` (or document in `.ai/postures/README.md`):

```json
{
  "posture_id": "string",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "source": "chapter-closure-<range> or manual or task-<number>",
  "coordinates": {
    "semantic_resolution": { "reading": "stable|improving|degraded", "evidence": "string" },
    "invariant_preservation": { "reading": "strong|adequate|weak", "evidence": "string" },
    "constructive_executability": { "reading": "strong|improved|stalled|weak", "evidence": "string" },
    "grounded_universalization": { "reading": "healthy|premature|deferred", "evidence": "string" },
    "authority_reviewability": { "reading": "strong|overweighted|underweighted", "evidence": "string" },
    "teleological_pressure": { "reading": "focused|diffuse|needs_target", "evidence": "string" }
  },
  "counterweight_intent": "string",
  "recommended_next_slices": ["task-number"],
  "expires_at": "ISO-8601"
}
```

Store the active posture at `.ai/postures/current.json`.

### 2. Implement `narada posture` commands

Create `packages/layers/cli/src/commands/posture.ts`:

```bash
narada posture show [--format json|human]
narada posture update --from <source> [--file <path>]
narada posture check
```

Behavior:

**`posture show`:**
- Read `.ai/postures/current.json`.
- Display coordinates, counterweight intent, expiration.
- Warn if expired.

**`posture update`:**
- Validate input JSON against schema.
- Write to `.ai/postures/current.json` atomically (tmp + rename).
- Archive previous posture to `.ai/postures/archive/<id>.json`.
- Requires `admin` authority (operator-only).

**`posture check`:**
- Validate current posture schema compliance.
- Warn on missing coordinates, expired posture, or stale evidence.
- Exit 0 if valid, 1 if invalid.

### 3. Wire into `narada task recommend`

Modify `packages/layers/cli/src/commands/task-recommend.ts`:

- If `.ai/postures/current.json` exists and is not expired:
  - Load posture coordinates.
  - Adjust recommendation scores per coordinate:
    - `constructive_executability` low → boost runnable-proof tasks (+10%)
    - `teleological_pressure` unfocused → penalize meta tasks, boost vertical tasks (+10% / -10%)
    - `authority_reviewability` overweighted → penalize new observation surfaces (-10%)
    - `semantic_resolution` unstable → boost contract/terminology tasks (+10%)
    - `invariant_preservation` weak → boost test/boundary tasks (+10%)
    - `grounded_universalization` premature → penalize generic abstraction tasks (-10%)
  - Include posture-derived adjustments in recommendation reasons.
- If posture missing or expired:
  - Proceed with local heuristics.
  - Warn: "No active CCC posture; recommendations use local heuristics only."
- Add `--ignore-posture` flag to disable CCC scoring.

### 4. Add focused tests

Create `test/commands/posture.test.ts` and update `test/commands/task-recommend.test.ts`:

- `posture show` displays coordinates;
- `posture update` writes valid posture;
- `posture update` rejects invalid schema;
- `posture check` passes valid, fails invalid;
- `task recommend` boosts tasks when `constructive_executability` is low;
- `task recommend` penalizes meta tasks when `teleological_pressure` is unfocused;
- `task recommend --ignore-posture` disables scoring;
- Expired posture warns and falls back to heuristics;
- Missing posture proceeds normally with warning.

### 5. Update docs

Update `.ai/decisions/20260422-464-narada-self-build-operation-design.md` §CCC Integration with implementation notes if behavior differs from design.

Update `AGENTS.md` if a new documentation index entry is warranted (likely not — posture is a governance concept, not a runtime component).

## Non-Goals

- Do not make CCC posture authoritative. It is advisory scoring only.
- Do not auto-update posture from task completions. Posture update is operator-owned.
- Do not require posture for any command to function.
- Do not create a CCC dashboard or UI beyond CLI output.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Execution Notes

### Schema and Storage
- Created `.ai/postures/schema.json` with JSON Schema for CCC posture.
- Created `.ai/postures/README.md` documenting authority and schema.
- Posture is stored at `.ai/postures/current.json` with atomic write (tmp + rename) and archiving to `.ai/postures/archive/<id>.json`.

### CLI Commands
- Created `packages/layers/cli/src/commands/posture.ts` with:
  - `postureShowCommand` — reads current posture, displays coordinates, warns if expired.
  - `postureUpdateCommand` — validates input JSON against schema, writes atomically, archives previous.
  - `postureCheckCommand` — validates schema compliance, warns on missing coordinates, expired posture, or stale evidence. Exits 0 if valid, 1 if invalid.
- Wired `narada posture show|update|check` in `main.ts`.

### Task Recommend Integration
- Modified `packages/layers/cli/src/commands/task-recommend.ts`:
  - Loads `.ai/postures/current.json` unless `--ignore-posture`.
  - Applies ±10% score adjustments per coordinate:
    - `constructive_executability` low → boosts runnable-proof tasks
    - `teleological_pressure` unfocused → penalizes meta tasks, boosts vertical tasks
    - `authority_reviewability` overweighted → penalizes observation surfaces
    - `semantic_resolution` unstable → boosts contract/terminology tasks
    - `invariant_preservation` weak → boosts test/boundary tasks
    - `grounded_universalization` premature → penalizes generic abstraction tasks
  - Includes posture adjustments in JSON output (`posture_adjustments`) and human output.
  - Warns on missing or expired posture and falls back to local heuristics.

### Tests
- Created `packages/layers/cli/test/commands/posture.test.ts` (11 tests):
  - show displays coordinates, warns on expired, fails gracefully when missing
  - update writes valid posture atomically and archives previous, rejects invalid schema
  - check passes valid, fails invalid, fails expired
  - validatePosture accepts valid, rejects missing coordinates, rejects invalid readings
- Updated `packages/layers/cli/test/commands/task-recommend.test.ts` (+5 tests):
  - warns when posture is missing
  - warns when posture is expired
  - boosts runnable-proof tasks when constructive_executability is low
  - penalizes meta tasks when teleological_pressure is unfocused
  - `--ignore-posture` disables CCC scoring

### Docs
- Decision 464 §CCC Integration already describes the exact behavior implemented. No amendment needed.
- AGENTS.md does not require a new index entry (posture is governance, not runtime).

## Verification

```bash
cd /home/andrey/src/narada
pnpm --filter @narada2/cli exec vitest run test/commands/posture.test.ts test/commands/task-recommend.test.ts
pnpm --filter @narada2/cli typecheck
pnpm verify
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

**Results:**
- `posture.test.ts`: 11 passed
- `task-recommend.test.ts`: 17 passed (12 original + 5 posture)
- `task-governance.test.ts`: 30 passed
- `pnpm --filter @narada2/cli typecheck`: passed
- `pnpm verify`: all 5 steps passed
- No derivative task-status files found

## Acceptance Criteria

- [x] `.ai/postures/current.json` schema is defined and validated.
- [x] `narada posture show` displays current posture.
- [x] `narada posture update` writes and archives posture atomically.
- [x] `narada posture check` validates schema and warns on staleness.
- [x] `narada task recommend` adjusts scores based on posture coordinates.
- [x] `--ignore-posture` disables CCC scoring.
- [x] Expired or missing posture falls back to local heuristics with warning.
- [x] Score adjustments are included in recommendation reasons.
- [x] Focused tests cover all commands and scoring paths.
- [x] No command requires posture to function.
- [x] No derivative task-status files are created.

## Residuals / Deferred Work

- `--explain` flag for per-candidate posture reasoning detail (future enhancement).
- Durable recommendation storage in `.ai/tasks/recommendations/` (schema defined but no storage operator).
- Weight tuning for posture adjustments remains heuristic (±10% per coordinate).



