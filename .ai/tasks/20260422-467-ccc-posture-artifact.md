---
status: opened
depends_on: [395, 426, 464]
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

## Acceptance Criteria

- [ ] `.ai/postures/current.json` schema is defined and validated.
- [ ] `narada posture show` displays current posture.
- [ ] `narada posture update` writes and archives posture atomically.
- [ ] `narada posture check` validates schema and warns on staleness.
- [ ] `narada task recommend` adjusts scores based on posture coordinates.
- [ ] `--ignore-posture` disables CCC scoring.
- [ ] Expired or missing posture falls back to local heuristics with warning.
- [ ] Score adjustments are included in recommendation reasons.
- [ ] Focused tests cover all commands and scoring paths.
- [ ] No command requires posture to function.
- [ ] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/posture.test.ts test/commands/task-recommend.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```
