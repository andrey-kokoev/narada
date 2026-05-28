---
status: confirmed
depends_on: [1508]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T15:42:03.002Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T15:42:03.461Z
closed_by: narada.builder
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Define canonical MCP role-policy projection contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1509-1511-mcp-policy-reconciliation.md

## Goal

Define the bounded contract that derives expected role-policy allowed tools from the Narada proper MCP surface registry without making package code the owner of all Site config.

## Context

Task 1508 contained config drift by aligning local config.json and adding a test guard. The principled next step is reconciliation: surface registry contract -> expected role-policy projection -> local config reconciliation. This task must preserve config.json as Site-local runtime posture while making the expected MCP policy projection explicit and testable.

## Required Work

1. Inspect packages/narada-proper-mcp/src/surface-registry.ts, config.json role policy shape, and existing carrier config projection helpers.
2. Define a typed projection contract for architect narada-proper allowed_tools that distinguishes canonical tools, optional aliases, refused tools, and role eligibility.
3. Specify where the expected projection lives and how it remains inert until reconciled into local config.json.
4. Add focused tests proving the projection excludes aliases unless explicitly admitted and rejects unknown/stale tool names.

## Non-Goals

- Do not generate or overwrite the whole config.json file.
- Do not make live MCP tool discovery the authority for role policy.
- Do not broaden architect tool permissions beyond the canonical Narada proper MCP role-policy projection.

## Execution Notes

- Inspected `packages/narada-proper-mcp/src/surface-registry.ts`, `config.json` role-policy shape, and existing carrier config projection helpers.
- Added a typed Narada proper architect role-policy projection contract in `packages/narada-proper-mcp/src/surface-registry.ts`:
  - `NaradaProperMcpRolePolicyProjection`
  - `RolePolicyValidationResult`
  - `buildNaradaProperArchitectRolePolicyProjection`
  - `validateNaradaProperArchitectAllowedTools`
- The projection explicitly names the MCP surface registry as policy source and `config.json` as reconciled Site-local runtime posture, not authority.
- The projection separates:
  - canonical allowed tools
  - optional inbox alias tools
  - refused tools
  - role-eligible tools
- Optional bare `inbox_*` aliases are excluded from canonical allowed tools by default and admitted only when `include_alias_tools` is set.
- Exported the projection/validation API through `packages/narada-proper-mcp/src/index.ts`.
- Replaced the task-1508 local-config-dependent allowlist test with contract-level tests. The package test no longer unconditionally reads gitignored `config.json`.
- Added focused tests for:
  - inert projection posture and config authority boundary
  - missing canonical tools
  - stale/unknown tools
  - alias tools requiring explicit admission
  - refused tools
  - explicit alias admission mode
- Did not generate, overwrite, or stage `config.json`.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp typecheck`: passed.
- `pnpm --filter @narada2/narada-proper-mcp test`: passed; 1 file, 31 tests.
- `pnpm --filter @narada2/narada-proper-mcp build`: passed.

## Acceptance Criteria

- [x] A typed expected role-policy projection contract exists for Narada proper MCP architect tools.
- [x] The contract names the registry as policy source and config.json as reconciled Site-local runtime posture.
- [x] Tests cover missing tools, stale tools, alias handling, and refused tools.
