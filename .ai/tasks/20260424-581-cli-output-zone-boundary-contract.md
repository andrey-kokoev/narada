---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
---

# Task 581 - CLI Output Zone Boundary Contract

## Goal

Define the canonical Narada zone split between:

- CLI output creation
- CLI output admission to be viewed

and make the crossing between them explicit.

## Context

Today many CLI commands still behave as if:

- command logic,
- formatter logic,
- verbosity choice,
- viewer choice,
- and transcript admission

are one fused concern.

That fusion is exactly what makes it easy to produce:

- giant JSON transcripts when only a small answer was needed,
- human-default output that behaves like machine-debug output,
- or command implementations that cannot cleanly separate "what is true" from "what should be shown here".

Narada's topology reading suggests a cleaner split:

- one zone produces the result artifact,
- another zone decides what projection of that artifact may be admitted to a viewer.

## Required Work

1. Define the **CLI Output Creation Zone**:
   - what inputs it receives,
   - what authority it owns,
   - what truth it is allowed to determine,
   - and what it must produce durably or ephemerally.
2. Define the **CLI Output Admission Zone**:
   - what inputs it receives,
   - what authority it owns,
   - and what it may admit or suppress for a viewer.
3. Define the explicit crossing between the two zones:
   - source zone,
   - destination zone,
   - admissibility regime,
   - crossing artifact,
   - confirmation law.
4. Make viewer classes explicit at minimum:
   - human terminal,
   - agent transcript,
   - browser workbench,
   - machine JSON consumer,
   - log/audit sink.
5. Define the key invariant:
   - command code should not directly "spray text";
   - it should create a result artifact first,
   - then admission policy determines projection.
6. State which concerns belong to creation vs admission, including:
   - truth/result classification,
   - warnings,
   - severity,
   - verbosity,
   - truncation,
   - redaction,
   - token budget.
7. Record verification or bounded blockers.

## Non-Goals

- Do not redesign every existing formatter in this task.
- Do not pick final implementation APIs yet if the boundary can be stated more simply.
- Do not widen into browser UI rendering beyond what is needed to define the boundary.

## Acceptance Criteria

- [x] Creation zone authority is explicit
- [x] Admission zone authority is explicit
- [x] Crossing regime is explicit
- [x] Viewer classes are explicit
- [x] Creation-vs-admission concern split is explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### 1. CLI Output Creation Zone

**Name**: `CliOutputCreationZone`

**Inputs received**:
- Command-line arguments and flags
- Configuration state
- Durable store query results
- Command execution outcomes (success, failure, partial)

**Authority owned**:
- What is true about the command result
- Classification of result into `success` | `failure` | `partial`
- What warnings are materially relevant
- What guidance is available
- Result structure and field naming

**What it must produce**:
A single `CommandResult` artifact containing:
- `exitCode`: numeric exit code
- `result.truth`: the primary result payload (structured, never pre-rendered)
- `result.warnings[]`: warning objects with `severity`, `code`, `message`, `context`
- `result.guidance[]`: guidance objects with `scope`, `message`, `relevance`
- `result.metadata`: command name, duration, timestamp, agent id

**What it must NOT do**:
- Directly write to `console.log`/`console.error`/`process.stdout`
- Decide whether a warning is shown or hidden
- Choose truncation levels
- Apply color or human formatting
- Know about token budgets or transcript constraints

### 2. CLI Output Admission Zone

**Name**: `CliOutputAdmissionZone`

**Inputs received**:
- The `CommandResult` artifact from the creation zone
- Viewer class identifier (human terminal, agent transcript, machine JSON, log sink)
- Verbosity level (`terse` | `normal` | `verbose`)
- Token budget or line budget constraints
- Redaction policy (if any)

**Authority owned**:
- Which warnings are admitted to the viewer
- Which guidance is admitted to the viewer
- How the truth payload is projected (full, truncated, redacted)
- Whether the output is rendered as JSON, human text, or transcript markup
- Whether output is suppressed entirely (e.g., `--quiet`)

**What it may do**:
- Suppress warnings below a severity threshold
- Suppress guidance unless `verbose` is set
- Truncate large payloads
- Redact sensitive fields
- Convert structured truth to human-readable lines
- Emit JSON for machine consumers
- Skip emitting anything for log sinks that only record exit codes

**What it must NOT do**:
- Change the truth classification
- Invent warnings that the creation zone did not produce
- Change the exit code
- Mutate durable state

### 3. Crossing Regime

Following SEMANTICS.md §2.15 irreducible fields:

| Field | Value |
|-------|-------|
| `source_zone` | `CliOutputCreationZone` — command execution logic |
| `destination_zone` | `CliOutputAdmissionZone` — output projection and viewer dispatch |
| `authority_owner` | The admission zone owns what is shown; the creation zone owns what is true. Neither may override the other's core authority. |
| `admissibility_regime` | Creation zone produces a complete `CommandResult`. Admission zone applies viewer-class policy, verbosity gating, budget truncation, and redaction. All suppressions are non-destructive (the full artifact remains available for re-projection). |
| `crossing_artifact` | `CommandResult` — the structured result artifact defined in Task 582. |
| `confirmation_rule` | Self-certifying: the admission zone's output can be compared against the creation zone's artifact by replaying the same admission policy. No external confirmation needed because the artifact is immutable once created. |

**Anti-collapse invariant**: If creation and admission collapse into one zone, commands will spray text, token budgets cannot be enforced, and the same result cannot be projected differently for different viewers without code duplication.

### 4. Viewer Classes

| Viewer Class | Description | Admission Policy Summary |
|--------------|-------------|-------------------------|
| `human_terminal` | Interactive operator at a TTY | Human formatting, colors, bounded warnings, terse by default, verbose expands guidance |
| `agent_transcript` | Agent session transcript consumed by LLM | Same as human but with stricter token budget; multi-line guidance suppressed unless materially relevant; no color codes |
| `browser_workbench` | Web UI observation surface | Structured rendering, expandable sections, full payload available on demand |
| `machine_json_consumer` | CI, scripts, automation | Raw JSON output of `result.truth` only; warnings inline; no human formatting |
| `log_audit_sink` | Persistent log or audit trail | Exit code + metadata + warnings at `warn` severity and above; truth payload omitted or hashed |

### 5. Concern Split: Creation vs Admission

| Concern | Creation Zone | Admission Zone |
|---------|--------------|----------------|
| Truth / result classification | **Owns** — determines what happened | Reads — must not alter |
| Warnings (existence, content, severity) | **Owns** — produces warning objects | **Owns** — decides which warnings are admitted based on severity threshold and viewer |
| Severity levels | Defines (`info`/`warn`/`error`/`critical`) | Uses for gating decisions |
| Verbosity | N/A — produces full artifact always | **Owns** — `terse`/`normal`/`verbose` controls projection depth |
| Truncation | N/A — produces complete payload | **Owns** — truncates large fields for budget-constrained viewers |
| Redaction | N/A — includes all fields | **Owns** — removes sensitive fields per policy |
| Token budget | N/A | **Owns** — enforces per-viewer budget |
| Human formatting | N/A | **Owns** — converts to human text |
| JSON serialization | N/A | **Owns** — converts to JSON |
| Exit code | **Owns** — sets numeric exit code | Reads — must not alter |

### 6. Key Invariant

> Command code should not directly "spray text." It creates a `CommandResult` artifact. The admission zone determines what projection of that artifact may reach a viewer.

This means:
- No `console.log` inside command functions (except for interactive prompts)
- No format branching (`if (format === 'json') ... else ...`) inside command functions
- No `fmt.message()` or `fmt.table()` inside command functions
- Command functions return a `CommandResult`; presentation is handled downstream

## Verification

This is a design/contract task. Verification is by review of the contract text against:
- SEMANTICS.md §2.15 (crossing regime irreducible fields) — all six fields present ✅
- Current codebase patterns from `packages/layers/cli/src/commands/` — contract accurately describes the fused problem ✅
- Task 508/509 austerity work — contract preserves the austerity intent while making the mechanism structural ✅

## Bounded Blockers

- **Implementation line**: Task 585 will define the first concrete `CommandResult` type and refactor one command (`task evidence` or `task list`) to use it.
- **Formatter migration**: The existing `Formatter` class and `createFormatter()` pattern will be deprecated gradually, not removed in one pass.
- **wrapCommand migration**: The `wrapCommand()` wrapper in `command-wrapper.ts` will evolve to become the admission-zone entry point rather than just a logger wrapper.
- **No breaking changes yet**: This contract does not change any runtime behavior; it establishes the boundary for subsequent implementation tasks.
