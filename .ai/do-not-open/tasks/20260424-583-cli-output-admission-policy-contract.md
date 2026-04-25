---
status: closed
closed_at: 2026-04-24
closed_by: a2
governed_by: task_close:a2
created: 2026-04-24
depends_on: [581, 582]
---

# Task 583 - CLI Output Admission Policy Contract

## Goal

Define the admission law that decides how much of a command result artifact may be shown to a given viewer under a given verbosity and budget posture.

## Context

Creation alone does not solve the problem.

The real operator pain appears at admission time:

- too much JSON shown to an agent transcript,
- long guidance blocks on routine success paths,
- human output optimized for completeness instead of next-action clarity,
- and no stable rule for when rich detail is admitted versus withheld.

Narada needs a governed admission policy, not just formatter preferences.

## Required Work

1. Define the admission inputs at minimum:
   - viewer class
   - requested format
   - requested verbosity
   - context/token budget posture
   - failure vs success state
   - explicit operator request for details
2. Define admission rules for each viewer class:
   - human terminal
   - agent transcript
   - browser workbench
   - machine JSON
   - audit/log sink
3. Define default posture rules:
   - success path should be terse and state-forward by default
   - warnings remain visible but bounded
   - expanded rationale requires explicit verbose/detail request unless failure demands it
4. Define transcript-budget rules:
   - smallest useful projection first
   - no broad payload admission for "what next?" style inspection
   - explicit conditions under which large machine payloads may be admitted
5. Define truncation/summarization/redaction policy:
   - what can be summarized
   - what must never be dropped
   - how to preserve correctness when details are withheld
6. Define the relationship between:
   - command-level `--verbose`
   - machine `--format json`
   - transcript-safe projection
   - explicit inspection commands
7. Define how admission failure or refusal should surface:
   - e.g. "details omitted by admission policy; rerun with explicit verbose/inspection path"
8. Name at least one first implementation line for this policy:
   - formatter layer,
   - command adapter layer,
   - or transcript-safe projection layer.
9. Record verification or bounded blockers.

## Non-Goals

- Do not implement a general-purpose logging framework here.
- Do not widen into arbitrary UI component design.
- Do not treat all viewers as if they need the same admitted projection.

## Acceptance Criteria

- [x] Viewer-class admission rules are explicit
- [x] Default terse / explicit verbose posture is explicit
- [x] Transcript-budget rules are explicit
- [x] Truncation/summarization/redaction posture is explicit
- [x] Relationship between verbose/json/inspection paths is explicit
- [x] First implementation line is named
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Admission Inputs

The admission policy receives these inputs for every command result:

| Input | Source | Description |
|-------|--------|-------------|
| `artifact` | Creation zone | The `CommandResult` from Task 582 |
| `viewerClass` | Runtime context | `human_terminal` / `agent_transcript` / `browser_workbench` / `machine_json` / `log_sink` |
| `format` | CLI flag `--format` | `json` / `human` / `auto` |
| `verbosity` | CLI flag `--verbose` | `terse` / `normal` / `verbose` |
| `tokenBudget` | Runtime config or env | Max lines or tokens for this admission |
| `redactionPolicy` | Runtime config | Fields to redact per viewer class |
| `explicitDetailRequest` | CLI flags like `--details`, `--full` | Operator explicitly asked for more |

### Viewer-Class Admission Rules

#### `human_terminal`

| Aspect | Rule |
|--------|------|
| Format | Human-readable text, colors if TTY |
| Default posture | Terse: primary result first, warnings ≤ 3 lines, guidance suppressed |
| Verbose | Expands guidance by relevance (`material` and `urgent` shown; `routine` still hidden unless `--verbose`) |
| Warnings | All severities shown; `info` warnings may be collapsed to one line |
| Guidance | Only `urgent` and `material` by default; all scopes shown with `--verbose` |
| Truncation | Large lists truncated to first 10 items with "…N more" |
| Token budget | Soft limit: 20 lines of output |

#### `agent_transcript`

| Aspect | Rule |
|--------|------|
| Format | Plain text, no color codes, no decorative framing |
| Default posture | Same as human but stricter: primary result only, warnings ≤ 1 line each, no guidance |
| Verbose | Allows `material` guidance; still suppresses `routine` |
| Warnings | `warn` and above only; `info` suppressed |
| Guidance | `urgent` only by default; `material` with `--verbose` |
| Truncation | Large lists truncated to first 5 items with "…N more" |
| Token budget | Hard limit: 10 lines of output; excess triggers suppression notice |
| Special rule | If a command is invoked as a tool call, always use transcript-safe projection regardless of TTY detection |

#### `browser_workbench`

| Aspect | Rule |
|--------|------|
| Format | Structured JSON or HTML render |
| Default posture | Full artifact admitted; expandable sections for warnings/guidance/diagnostics |
| Truncation | None by default; pagination for very large lists |
| Token budget | N/A (not a transcript) |

#### `machine_json_consumer`

| Aspect | Rule |
|--------|------|
| Format | Raw JSON of full artifact |
| Default posture | Complete `CommandResult` serialized; no suppression |
| Warnings | Inline in artifact; no filtering |
| Guidance | Inline in artifact; no filtering |
| Truncation | None |
| Redaction | None unless explicitly configured |

#### `log_audit_sink`

| Aspect | Rule |
|--------|------|
| Format | Structured log line or JSON |
| Default posture | `exitCode` + `metadata` + `warnings` at `warn` and above |
| Truth payload | Omitted or replaced with hash/reference |
| Guidance | Omitted |
| Diagnostics | Omitted |

### Default Posture Rules

**Success path**:
- Show the primary result first (1–3 lines)
- Show warnings if any (bounded)
- Suppress guidance unless `--verbose`
- Example: `Closed task 20260424-581` (not a multi-line confirmation block)

**Failure path**:
- Show error classification first
- Show all warnings and errors
- Show relevant guidance even without `--verbose` if it helps recovery
- Show diagnostics if `--verbose`

**Partial success path**:
- Show what succeeded
- Show what failed
- Show warnings
- Show `material` guidance by default (since partial success usually needs next-action clarity)

### Transcript-Budget Rules

1. **Smallest useful projection first**: The admission zone must compute the minimal projection that answers the operator's likely question, then stop.
2. **No broad payload admission for "what next?"**: If the command is a status or inspection command, admit only the status, not the full underlying data.
3. **Large payload conditions**: A large machine payload may be admitted to an agent transcript only when:
   - The operator explicitly requested it (`--details`, `--full`)
   - OR the payload is the primary result and there is no smaller summary available
   - AND the payload fits within the token budget after truncation
4. **Budget exceeded**: If projection exceeds budget, emit a suppression notice: `Output truncated by admission policy (showing N of M items). Use --verbose for full output.`

### Truncation / Summarization / Redaction Policy

| Operation | What Can Be Done | What Must Never Be Dropped |
|-----------|-----------------|---------------------------|
| Truncation | Lists, tables, long strings | The fact that truncation occurred (must show "…N more") |
| Summarization | Complex objects to key-value pairs | Critical fields that change command meaning |
| Redaction | Sensitive config values, tokens, PII | Error messages, exit codes, status classification |
| Suppression | Guidance, diagnostics, info warnings | `warn`/`error`/`critical` warnings on failure path |

**Correctness preservation**: When details are withheld, the admitted output must still allow the viewer to determine:
- Did the command succeed or fail?
- Are there actionable warnings?
- What is the next step (if any)?

### Relationship Between Flags and Paths

| Flag / Path | Effect |
|-------------|--------|
| `--format json` | Bypasses human admission policy; emits full `CommandResult` as JSON regardless of viewer class |
| `--verbose` | Expands admission depth for human and transcript viewers; does not affect JSON |
| `--quiet` | Suppresses all non-error output; exit code only |
| `narada task evidence <n>` | Inspection command; admits full evidence regardless of default posture because the command's purpose is inspection |
| `narada task list` | Summary command; admits truncated list by default, full list with `--verbose` |

### Admission Refusal Surface

If admission policy suppresses material output, it must not silently omit. It must emit:

```
Details omitted by admission policy (budget: 10 lines, needed: 25).
Rerun with --verbose for full output.
```

This is itself a valid admitted projection.

### First Implementation Line

**Task 585 — `CommandResult` type and first command migration**:
- Add `CommandResult<T>` interface to `packages/layers/cli/src/types/command-result.ts`
- Add `AdmissionPolicy` interface and default implementation to `packages/layers/cli/src/lib/admission-policy.ts`
- Refactor `task evidence` or `task list` to produce `CommandResult` and route through admission policy
- The admission policy will be a pure function: `(CommandResult, AdmissionContext) => AdmittedOutput`

## Verification

Design review against:
- Task 581 zone boundary — admission zone authority matches definition ✅
- Task 582 artifact contract — policy consumes the defined artifact shape ✅
- Task 508/509 austerity — terse default and verbose expansion align with prior work ✅
- SEMANTICS.md §2.12 advisory signals — guidance is treated as advisory (non-authoritative) ✅

## Bounded Blockers

- **No admission implementation yet**: This contract defines the law; Task 585 implements the first policy engine.
- **Budget measurement**: Token budgets are currently measured in lines-of-output approximation. True token counting (for LLM transcripts) will require integration with a tokenizer or heuristic; deferred to Task 586.
- **Viewer class detection**: Auto-detecting `agent_transcript` vs `human_terminal` requires runtime context (e.g., `NARADA_VIEWER_CLASS` env var or tool-call detection). Default will be `human_terminal` for TTY, `machine_json` for `--format json`, and `agent_transcript` when invoked via tool API.
