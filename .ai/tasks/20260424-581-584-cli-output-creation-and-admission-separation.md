---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
reservation: 581-584
---

# CLI Output Creation And Admission Separation

## Goal

Separate Narada CLI output into two explicit zones:

- **CLI Output Creation**
- **CLI Output Admission**

So commands stop conflating:

- result computation,
- result structuring,
- verbosity choice,
- audience choice,
- and transcript budget admission.

## Why This Chapter Exists

Narada already improved CLI austerity in Tasks `508` and `509`, but those tasks mostly treated the symptom:

- too much text on the default success path.

The deeper structural problem is still present:

- commands often create output and admit it to the viewer in one fused step,
- which makes it easy to overspend tokens,
- hard to project the same result differently for different viewers,
- and difficult to enforce a consistent budget-aware output posture across terminal, agent transcript, browser workbench, and machine JSON surfaces.

The clean Narada reading is:

- output creation is one zone,
- output admission to a viewer is another,
- and the crossing between them should be explicit and governed.

## Chapter DAG

```text
581 CLI Output Zone Boundary Contract
582 CLI Command Result Artifact Contract
583 CLI Output Admission Policy Contract
581, 582, 583 ─→ 584 CLI Output Separation Closure
```

## Tasks

| Task | Title | Purpose |
|------|-------|---------|
| 581 | CLI Output Zone Boundary Contract | Define the creation zone, admission zone, and crossing between them |
| 582 | CLI Command Result Artifact Contract | Define the structured output artifact created once and projected many ways |
| 583 | CLI Output Admission Policy Contract | Define audience-, verbosity-, and budget-governed admission/projection rules |
| 584 | CLI Output Separation Closure | Close the chapter honestly and name the first implementation line |

## Closure Criteria

- [x] Output creation and output admission are explicit distinct zones
- [x] The crossing artifact between them is explicit
- [x] Audience, verbosity, and budget admission law is explicit
- [x] JSON, human, and transcript surfaces are distinguished coherently
- [x] First implementation line is named
- [x] Verification or bounded blockers are recorded

## Chapter Summary

All four tasks closed. The CLI output separation chapter establishes:

1. **Two zones**: `CliOutputCreationZone` (owns truth) and `CliOutputAdmissionZone` (owns projection)
2. **Crossing artifact**: `CommandResult<T>` — structured, immutable, projection-agnostic
3. **Crossing regime**: Six irreducible fields per SEMANTICS.md §2.15
4. **Five viewer classes**: `human_terminal`, `agent_transcript`, `browser_workbench`, `machine_json_consumer`, `log_audit_sink`
5. **Admission policy**: Terse by default, verbose expands, failure admits more, transcript has strict budget
6. **First implementation line**: Task 585 — `CommandResult` type + first command migration

See individual task files for full contract text:
- Task 581: Zone boundary and concern split
- Task 582: `CommandResult` artifact shape
- Task 583: Admission policy per viewer class
- Task 584: This closure artifact
