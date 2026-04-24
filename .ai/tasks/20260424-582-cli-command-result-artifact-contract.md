---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [581]
---

# Task 582 - CLI Command Result Artifact Contract

## Goal

Define the structured output artifact that the creation zone produces once and the admission zone projects differently for different viewers.

## Context

If output creation and output admission are separate, then there must be a canonical artifact between them.

Without that artifact, Narada falls back into one of two failures:

1. commands emit raw strings directly;
2. or every viewer recreates its own ad hoc interpretation of command state.

The needed artifact is not "just JSON mode". It is the command's canonical result object, from which:

- terse human output,
- verbose human output,
- transcript-safe output,
- browser workbench rendering,
- and machine JSON

can all be projected.

## Required Work

1. Define the canonical result artifact shape, including at minimum:
   - command identity
   - operation/result status
   - primary summary
   - warnings
   - errors
   - structured machine payload
   - guidance/details payload
   - verbosity classes or projection hints
   - budget/admission sensitivity markers where needed
2. Distinguish clearly between:
   - authoritative result content
   - advisory guidance
   - debug/diagnostic detail
3. Define which fields are mandatory for all commands and which are optional.
4. Define how success, warning, partial success, and failure should be represented without forcing human prose into the creation zone.
5. Define how commands that currently emit giant structured payloads should instead classify content into:
   - primary result
   - secondary details
   - expandable diagnostics
6. Define projection-readiness requirements:
   - human-default projection
   - human-verbose projection
   - transcript-safe projection
   - machine/stable projection
7. Define backward-compatibility posture:
   - what existing command surfaces may continue temporarily,
   - what must eventually migrate to the artifact model.
8. Record verification or bounded blockers.

## Non-Goals

- Do not implement all command migrations in this task.
- Do not treat raw pretty-printed JSON as the final design.
- Do not collapse distinct warning/error classes into one generic blob.

## Acceptance Criteria

- [x] Canonical command result artifact shape is explicit
- [x] Authoritative result vs guidance vs diagnostics split is explicit
- [x] Projection-readiness requirements are explicit
- [x] Backward-compatibility posture is explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Canonical Artifact Shape

The crossing artifact between `CliOutputCreationZone` and `CliOutputAdmissionZone` is the **`CommandResult`**:

```typescript
interface CommandResult<T = unknown> {
  // ── Authority: creation zone owns these ──
  exitCode: number;                          // process exit code

  result: {
    // ── Truth (authoritative, always present) ──
    status: 'success' | 'failure' | 'partial';
    truth: T;                                 // primary structured payload; NEVER pre-rendered

    // ── Warnings (authoritative that a warning exists, but advisory about action) ──
    warnings?: Array<{
      severity: 'info' | 'warn' | 'error' | 'critical';
      code: string;                           // stable warning code for filtering/suppression
      message: string;                        // concise, never multi-line
      context?: Record<string, unknown>;      // structured context for projection
    }>;

    // ── Guidance (advisory, non-authoritative) ──
    guidance?: Array<{
      scope: string;                          // e.g., 'roster', 'evidence', 'learning'
      message: string;
      relevance: 'routine' | 'material' | 'urgent'; // helps admission zone decide whether to show
    }>;

    // ── Diagnostics (debug-only, never shown by default) ──
    diagnostics?: Array<{
      label: string;
      value: unknown;
    }>;

    // ── Metadata (non-authoritative, decorative) ──
    metadata?: {
      command: string;
      durationMs?: number;
      timestamp: string;
      agentId?: string;
    };
  };
}
```

### Field Cardinality

| Field | Mandatory | Notes |
|-------|-----------|-------|
| `exitCode` | Yes | Numeric exit code |
| `result.status` | Yes | `success` / `failure` / `partial` |
| `result.truth` | Yes | Primary payload; type varies by command |
| `result.warnings` | No | Absence means no warnings |
| `result.guidance` | No | Absence means no guidance |
| `result.diagnostics` | No | Only when `--verbose` or debug mode |
| `result.metadata` | No | Decorative; useful for logs |

### Status Representation

| Status | Meaning | Exit Code Convention |
|--------|---------|---------------------|
| `success` | Command achieved its goal | `0` |
| `failure` | Command could not achieve its goal | Non-zero |
| `partial` | Command achieved some goals but not all; warnings present | `0` or non-zero depending on severity |

The creation zone determines status and exit code. The admission zone must not reinterpret them.

### Content Classification

Commands that currently emit large structured payloads (e.g., `task list`, `task evidence-list`) should classify content into three buckets:

1. **Primary result** (`truth`): The minimal answer to the command's question.
   - For `task list`: `{ count, tasks: [{ taskId, status, title }] }`
   - For `task evidence`: `{ status, taskId, evidenceVerdict, gaps }`

2. **Secondary details**: Additional data available on demand.
   - Not included in `truth`; referenced by ID or available via inspection path
   - e.g., full task body, full evidence list, full roster

3. **Expandable diagnostics**: Debug/diagnostic data.
   - Lives in `result.diagnostics`
   - Only admitted when `--verbose` or explicit inspection requested

### Projection-Readiness Requirements

The `CommandResult` must be projection-ready without re-execution:

| Projection | Requirement |
|------------|-------------|
| Human-default | `truth` must be renderable as ≤ 10 lines of human text; `warnings` ≤ 3 lines; `guidance` suppressed |
| Human-verbose | `truth` full; `warnings` full; `guidance` admitted by relevance |
| Transcript-safe | Same as human-default but with stricter line budget (≤ 5 lines total); no color codes; no decorative framing |
| Machine/stable | `JSON.stringify(result, null, 2)`; complete and stable field names |

### Backward-Compatibility Posture

| Surface | Current | Migration |
|---------|---------|-----------|
| `wrapCommand()` commands | Return `unknown` via `logger.result()` | Gradual: wrapper will accept `CommandResult` and route to admission zone |
| Task governance inline handlers | Return `unknown`, handler does `console.log` | Gradual: handlers will pass `CommandResult` to admission function |
| `Formatter` class | Directly prints human output | Deprecate after all commands migrated; admission zone will own human rendering |
| `createFormatter()` | Factory for fused formatter | Replace with `createAdmissionPolicy()` or equivalent |

**Temporarily allowed**: Commands may continue returning `{ exitCode, result: unknown }` during migration. The `CommandResult` contract is the target shape, not an immediate breaking change.

**Must eventually migrate**: All commands that do their own `fmt.message()`, `fmt.table()`, or `console.log` inside the command function.

## Verification

Design review against:
- Task 581 zone boundary — artifact is the crossing artifact ✅
- SEMANTICS.md §2.15 — artifact is durable (immutable once created), carries its own proof (structured shape) ✅
- Current codebase patterns — shape accommodates existing command outputs without loss ✅

## Bounded Blockers

- **Type implementation**: `CommandResult<T>` interface will be added to `packages/layers/cli/src/types/` in Task 585.
- **Migration order**: `task evidence` or `task list` will be the first command migrated because they are observation-only (no mutation) and have clear primary/secondary data split.
- **Formatter replacement**: Human rendering of `CommandResult` will be implemented in `packages/layers/cli/src/lib/admission-policy.ts` or similar, not by extending `Formatter`.
