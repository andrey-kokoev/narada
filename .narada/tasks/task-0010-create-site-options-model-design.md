# narada-proper.task-0010

## Title

Design agent-ergonomic create-Site option model for Narada CLI.

## Authority Basis

- Operator correction relayed by `narada-andrey.Kevin` in `OSM:osm_20260510_192056_073_3aec7e63`.
- The milestone belongs in Narada proper.

## Goal

Design the option taxonomy, UX, presets, admission boundaries, and refusal model for `narada cli create site` / `narada sites init` evolution so agents can define coherent greenfield Site creation options from Narada proper templates/catalog and Narada repo package components without importing existing Site runtime state.

## Non-Goals

- Do not implement the full CLI.
- Do not design normal create-site as migration/lift/import from another Site.
- Do not import narada-andrey, CPY, Narada proper, PC, or operator-surface runtime state.
- Do not grant live capabilities, credentials, DB mutation, MCP registration, or runtime hydration by package selection.

## Changed-File Scope

- `docs/product/` design artifact and structured fixtures.
- `.narada` task/admission/audit/ledger evidence.

## Verification Checklist

- Structured JSON fixtures parse.
- Design artifact names option taxonomy, presets, UX, admission boundaries, identity doctrine, Windows PowerShell examples, refusal fixtures, blockers, and first implementation slice.
