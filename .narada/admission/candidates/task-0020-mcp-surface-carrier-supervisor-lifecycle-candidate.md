# MCP Surface Carrier Supervisor Lifecycle Candidate

Candidate id: `narada-proper.capability.mcp-surface-carrier-supervisor-lifecycle.v0`

Task: `narada-proper.task-0020`

State: `admitted_candidate`

Exposure class: `read_only`

## Authority Basis

Narada proper admits this as reusable capability candidate coverage, not as live process-control authority.

Inbound delivery evidence:
- `OSM:osm_20260510_202553_877_8944d35c`
- `OSM:osm_20260510_205048_269_dfd91a90`

External orientation evidence only:
- `narada-andrey:docs/concepts/mcp-surface-carrier-supervisor-lifecycle.md`
- `narada-andrey:docs/concepts/fixtures/mcp-surface-carrier-supervisor/`
- `narada-andrey:kb/operator-surface/operator-surface-message-bus.md`
- `narada-andrey task #559`
- `narada-andrey task #562`
- Commit `f4ba725e0d5c19a9c7e6fc46187dcf553957f5a2`

Narada proper does not admit narada-andrey runtime state, process state, task state, registry state, or operator-surface state through these references.

## Core Invariant

A stdio MCP server must not self-restart. Restart/rebind belongs to an external carrier/supervisor.

## Lifecycle Vocabulary

First Narada proper slice must represent:
- `stale`
- `restart_requested`
- `carrier_restarted`
- `live_verified`

The model must keep distinct:
- Site authority
- MCP process
- Carrier/session
- Runtime registry
- Restart request
- Verification
- Capability Lifecycle state and exposure class

## Read-Only First-Slice Plan

Implement a read-only/status registry surface that can classify MCP surface records without mutating processes.

Inputs:
- declared MCP surface descriptor
- observed runtime registry record
- watched source freshness summary
- restart request record
- verification record

Outputs:
- lifecycle state
- Capability Lifecycle composition fields
- exact missing carrier action when stale
- refusal/non-authority evidence for self-restart and process mutation

Neutral fixtures:
- stale stdio surface with `restart_requested` and `source_newer_than_baseline`
- verified live surface after external carrier restart and smoke verification

Verification:
- fixture tests for stale and live verified records
- typecheck/build for touched package

## Refusals

This candidate does not admit:
- arbitrary process kill
- native shell fallback
- stdio MCP self-restart
- live carrier restart execution
- live rebind execution
- process mutation
- narada-andrey runtime registry import
- PC-locus state import
- operator-surface runtime copying

## Next Admissions

Live restart/rebind requires a separate carrier/supervisor execution admission.
