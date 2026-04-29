---
status: opened
amended_by: architect
amended_at: 2026-04-29T18:35:12.772Z
---

# Model visibility-domain reconciliation for operator surfaces

## Chapter

Operator Surface Reconciliation Boundaries

## Goal

Make host visibility or membership domains first-class reconciliation boundaries for operator-surface adapters, starting from the Windows virtual desktop and Komorebi HWND leak case.

## Context

Inbox envelope env_296dd225-411f-462a-b336-079a9ed6db88 reports a live Windows desktop switch test where Komorebi admitted a Staccato Windows Terminal HWND into the Narada workspace even though Windows virtual desktop membership still reported that HWND on Staccato. Komorebi then held invalid rectangles with negative width/height. Existing Operator Surface docs treat Komorebi as an adapter, but do not yet model host visibility or membership domains as independent reconciliation boundaries that can veto adapter state.

## Required Work

1. Inspect Operator Surface and Windows operator-surface adapter docs. 2. Define visibility-domain or membership-domain reconciliation boundary vocabulary: host OS desktop membership, display membership, browser/profile membership, process/session membership, or other external visibility truth that an adapter must not override by convenience. 3. Apply the vocabulary to the Windows virtual desktop + Komorebi HWND case: after desktop transition, read current desktop identity, inspect Komorebi-managed HWNDs, query each HWND desktop membership, remove/float/unmanage off-desktop HWNDs from active tiling, retile current-desktop windows, and assert no off-desktop HWNDs or invalid rectangles remain. 4. Preserve authority routing: Narada proper may document/specify; Windows PC Site or User Site owns actual Komorebi/YASB/Windows mutation. 5. Create or route a bounded PC Site/template implementation handoff if direct implementation belongs outside Narada proper. 6. Add acceptance fixture/evidence text using the captured diagnostic path without embedding large raw Windows logs. 7. Run focused docs/guard verification and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T18:35:12.772Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Doctrine distinguishes operator-surface adapter state from host visibility or membership domain truth
- [ ] Windows virtual desktop membership is modeled as an external reconciliation boundary for Komorebi adapter state
- [ ] PC Site/template execution task or handoff is specified for scoped Komorebi reconciliation
- [ ] No Narada proper task mutates Windows Komorebi YASB or PC Site runtime directly
- [ ] Source envelope env_296dd225-411f-462a-b336-079a9ed6db88 is routed
