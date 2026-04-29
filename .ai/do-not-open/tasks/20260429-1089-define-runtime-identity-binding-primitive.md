---
status: closed
amended_by: architect
amended_at: 2026-04-29T20:16:48.391Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-29T20:18:47.753Z
criteria_proof_verification:
  state: unbound
  rationale: Runtime identity binding doctrine defines the primitive, captures the Windows HWND fixture, preserves User Site versus PC Site authority, requires explicit no_runtime_binding for unknown objects, and links the concept from Operator Surface, Visibility Domain Reconciliation, and Site Governance Coordinates. Verification passed with task-file guard and targeted documentation search.
closed_at: 2026-04-29T20:18:53.344Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Define runtime identity binding primitive

## Chapter

Operator Surface Runtime Identity

## Goal

Define a reusable runtime identity binding primitive that separates durable identity authority from volatile substrate handles and projection consumers.

## Context

Inbox envelope env_3acde992-326e-4000-9988-0d495adcdca1 proposes a runtime identity binding primitive from Windows overlay work. The motivating case is HWND -> identity_name -> label: User Site owns identity_name -> label, while PC Site owns HWND -> identity_name because HWND values are machine-local runtime facts. Carrier facts such as visible title, terminal profile, class name, process id, and tab title may be evidence but must not become naming authority. Unknown windows remain unlabeled and inspect reports no_runtime_binding.

## Required Work

1. Inspect Operator Surface, visibility-domain reconciliation, Site governance coordinates, Site state projections, and plural embodiment doctrine. 2. Define runtime identity binding as a reusable primitive separating durable identity authority, volatile substrate handles, carrier evidence, and projection consumers. 3. Specify authority ownership for User Site identity labels versus PC Site/runtime handle bindings. 4. Document the Windows HWND overlay case as the first fixture while preserving Narada proper as doctrine/product locus, not Windows mutation authority. 5. Define behavior for unknown/unbound runtime objects: no label by default and explicit no_runtime_binding diagnostic. 6. Connect the primitive to MCP clients, overlays, terminal portals, browser profiles, session inspectors, and future runtime projections without overfitting to Windows. 7. Add docs and focused guard/schema checks if code surfaces are touched. 8. Verify and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T20:16:48.391Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Doctrine defines runtime identity binding as distinct from durable identity registry volatile substrate handle and projection consumer
- [x] Windows HWND to identity_name to label case is captured without making titles or process metadata naming authority
- [x] Unknown or unbound runtime objects remain explicitly unlabeled or no_runtime_binding
- [x] Authority ownership is explicit between User Site identity labels and PC Site runtime handles
- [x] Source envelope env_3acde992-326e-4000-9988-0d495adcdca1 is routed
