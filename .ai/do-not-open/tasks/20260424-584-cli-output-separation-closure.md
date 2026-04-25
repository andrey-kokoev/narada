---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [581, 582, 583]
---

# Task 584 - CLI Output Separation Closure

## Goal

Close the CLI output separation chapter honestly and name the first executable implementation line.

## Required Work

1. Review whether the chapter now gives Narada a real creation/admission split rather than only more formatter advice.
2. State what is now explicit:
   - zone split,
   - crossing artifact,
   - admission law,
   - viewer distinction,
   - budget posture.
3. State what remains deferred or risky.
4. Name the first executable implementation line that should follow this chapter.
5. Write the closure artifact and update the chapter file consistently.

## Acceptance Criteria

- [x] Closure artifact exists
- [x] Creation/admission separation is explicit
- [x] Deferred risks are explicit
- [x] First executable implementation line is named
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### What Is Now Explicit

#### Zone Split

- **CLI Output Creation Zone** (`CliOutputCreationZone`): Owns what is true. Produces a complete, structured `CommandResult` artifact. Must not write to stdout, choose formatting, or know about viewers.
- **CLI Output Admission Zone** (`CliOutputAdmissionZone`): Owns what is shown. Receives the `CommandResult` and applies viewer-class policy, verbosity gating, budget truncation, and redaction. Must not change truth classification or invent warnings.

#### Crossing Artifact

- **`CommandResult<T>`** is the canonical crossing artifact.
- Shape: `{ exitCode, result: { status, truth, warnings?, guidance?, diagnostics?, metadata? } }`
- The artifact is immutable once created. All projections are non-destructive.

#### Crossing Regime

- Six irreducible fields defined per SEMANTICS.md §2.15:
  - `source_zone`: `CliOutputCreationZone`
  - `destination_zone`: `CliOutputAdmissionZone`
  - `authority_owner`: split — creation owns truth, admission owns projection
  - `admissibility_regime`: full artifact produced; admission applies policy
  - `crossing_artifact`: `CommandResult`
  - `confirmation_rule`: self-certifying (replay admission policy against artifact)

#### Viewer Distinction

Five viewer classes with distinct admission rules:
- `human_terminal` — colors, terse default, verbose expands
- `agent_transcript` — no colors, strict budget, suppresses routine guidance
- `browser_workbench` — full artifact, expandable sections
- `machine_json_consumer` — complete JSON, no suppression
- `log_audit_sink` — exit code + metadata + high-severity warnings only

#### Budget Posture

- Success path: terse by default (≤ 10 lines for transcript, ≤ 20 for terminal)
- Failure path: admits all warnings and material guidance regardless of verbosity
- Partial success: admits material guidance by default
- Large payloads: truncated with "…N more" and suppression notice

#### Concern Split

| Concern | Owner |
|---------|-------|
| Truth / result classification | Creation |
| Warnings (existence) | Creation |
| Warnings (admission) | Admission |
| Severity definition | Creation |
| Verbosity | Admission |
| Truncation | Admission |
| Redaction | Admission |
| Token budget | Admission |
| Human formatting | Admission |
| JSON serialization | Admission |
| Exit code | Creation |

### What Remains Deferred or Risky

| Risk | Description | Mitigation |
|------|-------------|------------|
| Migration scope | 20+ commands use fused `fmt.message()` pattern | Gradual migration; no breaking changes in one pass |
| `wrapCommand()` evolution | Wrapper currently just logs; must become admission entry point | Redesign wrapper as admission gateway in Task 585 |
| Token budget measurement | Currently line-based approximation; true token counting deferred | Heuristic is sufficient for initial implementation |
| Viewer class auto-detection | Detecting `agent_transcript` vs `human_terminal` requires runtime context | Use `NARADA_VIEWER_CLASS` env var as override; default to TTY detection |
| Backward compatibility | Existing `--format json` and `--verbose` flags must continue working | Admission policy respects existing flags; maps them to viewer class + verbosity |
| Browser workbench | No concrete UI exists yet; admission rules are speculative | Rules are conservative; will refine when UI is built |
| Formatter deprecation | `Formatter` class has many consumers | Deprecate after migration complete; do not remove prematurely |

### First Executable Implementation Line

**Task 585 — `CommandResult` type and first command migration**:

1. Add `CommandResult<T>` interface to `packages/layers/cli/src/types/command-result.ts`
2. Add `AdmissionPolicy` interface + default implementation to `packages/layers/cli/src/lib/admission-policy.ts`
3. Refactor one observation command (`task evidence` or `task list`) to:
   - Produce `CommandResult` instead of pre-rendered strings
   - Remove all `fmt.message()` / `console.log` from command function
   - Route through admission policy in the action handler
4. Add focused tests proving the command produces the same human output through the new pipeline

### Chapter DAG Status

```text
581 CLI Output Zone Boundary Contract     ✅ Closed
582 CLI Command Result Artifact Contract  ✅ Closed
583 CLI Output Admission Policy Contract  ✅ Closed
581, 582, 583 ─→ 584 CLI Output Separation Closure ✅ Closed
```

### Verification

- All four task files reviewed for consistency ✅
- Contracts cross-reference SEMANTICS.md §2.15 ✅
- Contracts preserve Task 508/509 austerity intent ✅
- No runtime code changes made (design-only chapter) ✅

## Residuals

- **Task 585**: First `CommandResult` type + command migration
- **Task 586**: Token budget measurement (true token counting)
- **Task 587+**: Gradual migration of remaining commands to creation/admission split
