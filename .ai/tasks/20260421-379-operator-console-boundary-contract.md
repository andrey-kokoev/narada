---
status: closed
closed: 2026-04-20
depends_on: [378]
---

# Task 379 — Operator Console / Site Registry Boundary Contract

## Assignment

Produce the boundary contract for the Operator Console and Site Registry.

## Context

Task 378 defined the Operator Console / Site Registry chapter. This task turns the design into an actionable boundary contract with explicit authority rules, invariants, and in-scope/out-of-scope boundaries.

## Goal

Define exact authority boundaries so that Tasks 380–383 cannot accidentally make the console into hidden authority.

## Required Work

1. Document what the console/registry **may** do:
   - Scan filesystem paths for Site discovery
   - Call Site observation APIs (read-only)
   - Route audited control requests to Site control APIs
   - Aggregate derived attention views
   - Cache health snapshots and metadata

2. Document what the console/registry **must not** do:
   - Read/write Site coordinator SQLite directly
   - Create, approve, or execute outbound commands
   - Open work items or create decisions
   - Claim or release scheduler leases
   - Mutate Site config, cursor, apply-log, or health directly
   - Run Cycles or invoke effect workers
   - Bypass Site-owned operator action endpoints

3. Define the observation/control separation:
   - Observation namespace: GET-only, derived from Site APIs
   - Control namespace: POST/PUT/PATCH only via audited routing
   - No observation endpoint may mutate
   - No control endpoint may be called from observation code

4. Define the control request envelope and audit log schema.

5. Map to existing invariants from AGENTS.md (observation read-only, UI cannot become hidden authority).

6. Identify reuse inventory: what existing CLI commands, observation APIs, and control surfaces are reused vs new.

## Non-Goals

- Do not implement the registry or router in this task.
- Do not design a generic Site abstraction.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Boundary contract document exists under `docs/deployment/operator-console-site-registry-boundary-contract.md`.
- [x] Contract explicitly states "registry is inventory + routing only; no direct Site-state mutation."
- [x] Observation/control separation is documented with endpoint namespace rules.
- [x] Audit log schema is defined (`ConsoleControlRequest` + `RouterAuditRecord`).
- [x] Reuse inventory lists existing vs new surfaces.
- [x] No derivative task-status files are created.
