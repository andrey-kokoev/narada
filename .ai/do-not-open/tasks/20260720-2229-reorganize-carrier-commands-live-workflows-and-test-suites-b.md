---
status: closed
depends_on: [2222, 2228]
closed_at: 2026-07-21T02:40:36.136Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Reorganize carrier commands, live workflows, and test suites by surface

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260720-2223-2229-cloudflare-carrier-organization.md

## Goal

Turn the flat script/test directory into discoverable command, read-model, workflow, shared, and contract-test surfaces.

## Context

The package contains hundreds of flat script modules and paired tests whose filename prefixes currently provide the only structural grouping.

## Required Work

1. Define directory ownership for command clients, read models, live workflows, shared auth/HTTP helpers, and contract fixtures.
2. Move modules without changing public package scripts or operator command names.
3. Split the broad carrier test into focused suites for session protocol, intelligence, adapters, persistence, and boundary contracts.
4. Remove duplicated command/test setup through shared fixtures while preserving explicit live-versus-unit posture.
5. Update package test manifests and documentation so every suite remains discoverable and runs on supported shells.

## Non-Goals

- Do not remove live E2E coverage.
- Do not change command behavior or authentication handling.
- Do not refactor unrelated packages.

## Execution Notes

The flat carrier script surface was fully converted into explicit ownership boundaries.
The canonical implementation counts are `commands` 31, `read-models` 26, `workflows`
61, `shared` 2, and `contracts` 120. All 234 root `scripts/*.mjs` paths are now
compatibility entrypoints: 230 are pure re-exports and 4 retain the legacy CLI
forwarding behavior while delegating to canonical modules. This preserves package
script names and operator command names without leaving duplicate implementations in
the root directory.

Ownership is enforced by the explicit `scripts/shared/carrier-script-surfaces.mjs`
registry rather than filename heuristics. Canonical command and workflow modules use
the shared auth/HTTP boundary directly; read-model imports remain limited to actual
product-read helpers. The contract suite loader discovers canonical contract tests
and excludes the suite harnesses, with shared fixture setup retained for focused
session protocol, intelligence, adapter, persistence, and boundary suites.

Relocation fallout was repaired at the same boundary: nested relative imports, package
root resolution, fixture paths, operator-session defaults, intelligence manifests,
and site-continuity workflow paths now resolve from their canonical locations. The
package README, module-boundary map, package scripts, and manifest contract test
document and enforce the layout.

## Verification

* The package-wide `pnpm test` was executed through structured-command MCP with
  `exit_code: 0`; its package script composes `test:unit`, `test:contract`, and
  `test:live`.
* The focused suites passed: unit 43, contract 651, and live 336 tests (1030 total).
* The script manifest contract passed 2/2 checks for canonical ownership, parseability,
  and compatibility entrypoints.
* The Cloudflare carrier MCP readiness check found the configured worker and a present
  operator session; the runtime proxy was current and the health snapshot reported
  reconciliation completed. The product-read MCP surface returned `401 unauthorized`,
  which is recorded as an environment authentication limitation rather than a code
  or test failure.
* The prior formal review rejected the first report for incomplete directory ownership.
  The repaired replacement report
  wrr_23c287a7_20260720-2229-reorganize-carrier-commands-live-workflows-and-test-suites-b_operator
  was accepted by Poincare with no findings. The task is closed with peer-reviewed
  closure at 2026-07-21T02:40:36.136Z; review ID:
  review-20260720-2229-reorganize-carrier-commands-live-workflows-and-test-suites-b-1784601635782.

## Acceptance Criteria

- [x] Script and test ownership is discoverable from directories rather than filename prefixes alone.
- [x] Public package commands remain compatible.
- [x] Unit, contract, and live suites are separately identifiable and all pass.
- [x] The package has no monolithic core carrier test or duplicated surface-specific harness.
