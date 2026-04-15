# Phase A Hardening Corrections

## Context

Phase A — Make It Real has been successfully implemented.

The system now executes a real charter runtime inside the daemon dispatch loop with tool execution and end-to-end integration tests.

This task applies minimal corrections to remove unsafe ambiguity introduced by moving from mock to real runtime.

Do not expand scope into Phase B.

---

## Correction 1 — Remove Silent Runtime Fallback

### Problem

Daemon currently falls back to `MockCharterRunner` when:
- `charter.runtime !== 'codex-api'`
- or API key is missing

This creates two operationally distinct systems under identical binaries.

### Required Change

Replace fallback behavior with:

- if `charter.runtime === 'codex-api'`:
  - require API key
  - if missing → throw at startup (fail-fast)

- if `charter.runtime === 'mock'`:
  - explicitly use `MockCharterRunner`

No implicit fallback allowed.

### Acceptance

- starting daemon without required runtime config fails deterministically
- no branch where mock is used unless explicitly configured

---

## Correction 2 — Constrain Phase A Tool Execution

### Problem

Tool execution is now live but not explicitly bounded.

### Required Change

Add **Phase A guardrail**:

- in daemon dispatch:
  - only allow execution of tools present in envelope `available_tools`
  - reject any tool_request not in catalog (hard fail or strip)

- ensure each tool definition includes:
  - `read_only` flag (already present in schema)
  - enforce:
    - Phase A: allow read-only + explicitly listed safe tools only

- log and persist rejected tool calls as:
  - `status = 'rejected_policy'`

### Acceptance

- no tool executes unless explicitly listed in catalog
- unauthorized tool_request cannot silently pass through

---

## Correction 3 — Stabilize Envelope Normalization Boundary

### Problem

`normalizeMessageForEnvelope` introduces a translation layer that can drift from compiler semantics.

### Required Change

- document function as **normative boundary**:
  - add docstring:
    > “This is the canonical projection from exchange-fs-sync message model into charter runtime model”

- add unit test:
  - input: real normalized message fixture
  - output: envelope message
  - assert:
    - stable field mapping
    - no lossy transformations without explicit comment

### Acceptance

- normalization is tested and treated as part of contract, not helper

---

## Constraints

- do not redesign runtime
- do not introduce arbitration logic (Phase B)
- do not expand tool system beyond guardrails
- do not touch multi-mailbox logic

---

## Definition of Done

- daemon fails fast on missing runtime config
- tool execution is explicitly bounded to catalog
- normalization boundary is documented + tested
- all tests pass