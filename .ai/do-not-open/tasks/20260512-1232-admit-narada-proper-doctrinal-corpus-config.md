---
status: closed
closed_at: 2026-05-12T23:10:11.738Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Admit Narada proper doctrinal corpus config

## Goal

Create a Narada proper repo-local doctrinal corpus config for agent regrounding from the narada-andrey Site config as external evidence, without copying runtime state or WSL-dependent authority.

## Context

Operator asked whether the doctrinal corpus can be copied from narada-andrey Site config after the MCP regrounding surface reported doctrinal_corpus_not_configured. Source is C:\Users\Andrey\Narada\config.json runtime_config.doctrinal_corpus. Treat source as external evidence, not Narada proper truth.

## Required Work

1. Inspect narada-andrey config doctrinal_corpus and preserve source evidence. 2. Create Narada proper .narada-local doctrine corpus config using repo-local doctrine paths where available. 3. Do not create D:\code\narada\config.json and do not import narada-andrey runtime state. 4. Record audit/ledger evidence and verify configured paths exist or are explicitly marked external/unresolved. 5. Report whether MCP regrounding is fully wired or only the repo-local config exists.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Inspected `C:\Users\Andrey\Narada\config.json` and found `runtime_config.doctrinal_corpus`.
- Treated that config as external orientation evidence, not as Narada proper truth.
- Created Narada proper repo-local corpus config at `.narada/agent-context/doctrinal-corpus.json`.
- Used local Narada proper doctrine paths where exact or usable local references exist.
- Marked missing exact repo-local doctrine files as `external_reference_unresolved` instead of copying WSL UNC paths as local authority.
- Did not create `D:\code\narada\config.json`.
- Did not import narada-andrey runtime DB, history, checkpoints, secrets, or MCP runtime state.
- MCP regrounding remains not fully wired for this session because the available MCP surface still reports `doctrinal_corpus_not_configured`; this task creates the Narada proper config artifact only.

## Verification

- `Get-Content .narada\agent-context\doctrinal-corpus.json | ConvertFrom-Json`
  - Result: JSON valid.
- Path check over `.sources[].local_path`:
  - Existing local paths: `docs/concepts/inhabited-evolution.md`, `SEMANTICS.md`, `docs/concepts/plural-embodiment-singular-authority.md`, `docs/concepts/governed-crossing.md`, `docs/concepts/inquiry-topology.md`.
  - Explicit unresolved exact local sources: `cipda`, `cu`, `cis`.
- MCP check before this task:
  - `agent_context_doc_31ad22b10e36({mode:"list"})` returned `doctrinal_corpus_not_configured`.

## Acceptance Criteria

- [x] Narada proper doctrinal corpus config exists under .narada
- [x] Source narada-andrey config is recorded as external evidence
- [x] No narada-andrey runtime DB/history/state is imported
- [x] Verification reports path existence and remaining MCP wiring blocker if any
