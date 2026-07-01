# First-Class Narada Runtime Concepts

## Purpose

This document is the coordination ledger for Narada runtime concepts that have crossed the threshold from incidental implementation detail into first-class product/system objects.

It does not replace narrower contracts. It records the first-class object, the authority contract, the current implementation posture, and remaining implementation work for each slice.

## Rule

A concept is first-class when operators, agents, tests, and implementation packages need to refer to it by stable name and boundary. If the same shape keeps reappearing across launch, NARS, MCP, delegation, projection, and task lifecycle surfaces, it must be named instead of rediscovered through local code paths.

## 1549 - NARS Session Management

CL: 0.995

First-class object: Site-local NARS session index, liveness, discovery, attach, and recovery.

Authority contracts:

- [`nars-session-management.md`](nars-session-management.md)
- [`nars-runtime-contract.md`](nars-runtime-contract.md)

Current implementation posture:

- NARS session discovery has a dedicated Site-local storage contract under `.narada/crew/nars-sessions/<session-id>/`.
- Per-session records, heartbeat files, event logs, and aggregate indexes are named as discovery projections rather than runtime authority.
- Attach semantics are endpoint-based at the low level and discovery-based through Narada CLI at higher levels.
- Liveness authority comes from `/health` or `session.health`, not from `status_hint`, terminal windows, or ambient process guesses.

Remaining implementation work:

- Continue hardening stale and ambiguous session UX in attach commands.
- Keep extraction boundaries clear while helpers still live partly under `@narada2/carrier-runtime`.
- Preserve compatibility fields such as `carrier_session_id` without letting clients infer that `carrier_` means `agent-cli` ownership.

Acceptance coverage:

- A reviewer can find the authoritative session management contract from this ledger and the linked docs.
- Current implementation gaps are recorded explicitly above.
- The target attach model is not dependent on terminal windows or ambient runtime state.

## 1550 - Operator Surface Attachment Model

CL: 0.992

First-class object: peer operator projections such as `agent-cli`, `agent-tui`, `agent-web-ui`, and future surfaces attaching to one NARS session.

Authority contracts:

- [`nars-runtime-contract.md`](nars-runtime-contract.md)
- [`nars-client-projection-contract.md`](nars-client-projection-contract.md)
- [`agent-carrier.md`](agent-carrier.md)

Current implementation posture:

- `operator_surface_kind` is the first-class selector for local operator projections.
- `launch_operator_surface_kind` records only the surface that launched the runtime; it is not the set of attached clients.
- `agent-cli`, `agent-tui`, and `agent-web-ui` are peer clients/projections over a NARS session, not separate runtime hosts.
- Low-level attach remains endpoint-based; higher-level CLI attach resolves Site/session candidates through the NARS session index.

Remaining implementation work:

- Continue removing operator-facing legacy `carrier` wording after compatibility callers are accounted for.
- Keep attach/discovery refusal messages focused on Site, agent, session, endpoint, health state, and remediation.
- Add explicit attached-projection tracking only after a real attach/detach registration surface exists.

Acceptance coverage:

- Operator surfaces are documented as peer projections of one NARS session.
- Attach/discovery failure semantics are stated as endpoint/session/health problems, not terminal ownership problems.
- Multi-surface launch belongs to NARS session attach semantics, not to separate runtime ownership.

## 1551 - Event Projection And Rendering Policy

CL: 0.994

First-class object: shared projection classification into conversation, operations, diagnostics, and raw views.

Authority contract:

- [`nars-client-projection-contract.md`](nars-client-projection-contract.md)

Current implementation posture:

- `@narada2/nars-client-projection-contract` owns event classification and view eligibility.
- Canonical conversation comes from NARS lifecycle events, not provider telemetry.
- Provider agent messages, stream fragments, routine health samples, and websocket/replay records are progress, operations, diagnostics, or raw records rather than durable chat facts.
- Client packages own medium-specific rendering but not event semantics.

Remaining implementation work:

- Reduce local client rendering drift as new message parts and projections appear.
- Add cross-client parity checks for realistic turns that include operator input, tool calls, provider telemetry, lifecycle assistant messages, and artifact references.
- Keep routine health out of conversation while preserving degraded/error visibility.

Acceptance coverage:

- Conversation, operations, diagnostics, and raw inclusion rules are linked to the projection contract.
- Provider telemetry is explicitly non-canonical conversation.
- Clients are directed to consume shared projection semantics rather than invent local classifiers.

## 1552 - Delegation `work_order` Contract

CL: 0.991

First-class object: governing delegation contract for scope, repositories, budgets, mutation boundaries, deliverables, authority gates, and verification policy.

Authority contract:

- `@narada2/delegated-task-mcp` target docs and tests in `D:/code/mcp-surfaces`

Current implementation posture:

- Delegation tests cover `work_order`, `allowed_repositories`, `budget`, `verification_budget`, `test_budget`, mutation boundaries, deliverables, and dependencies.
- `work_order` is the governing object; budget is only a sub-object inside it.
- Compatibility paths still accept simpler task descriptions, but the target shape is a structured work order.

Remaining implementation work:

- Document canonical `work_order` examples and operator guidance.
- Make validation failures distinguish missing work order, invalid budget, repository boundary violation, and deliverable mismatch.
- Migrate callers away from legacy step-list compatibility where a `work_order` is available.

Acceptance coverage:

- The governing object is named `work_order`, not `budget`.
- Repository boundaries, budgets, deliverables, dependencies, and authority gates are included in the contract.
- Legacy compatibility is recorded as transitional rather than the target delegation interface.

## 1553 - Delegation DAG Templates

CL: 0.993

First-class object: named delegation DAG templates for common work shapes such as research/synthesis, implementation/review/repair, and guarded publication.

Authority contract:

- `@narada2/delegated-task-mcp` template catalog and template validation tests

Current implementation posture:

- Template catalog covers milestones, dependencies, joins, gates, review, repair, verification, and authority-gated publication.
- Templates are emerging as reusable topology objects rather than ad hoc lists of worker prompts.
- DAG execution still exposes more raw structure than an operator should need for routine cases.

Remaining implementation work:

- Improve template discovery and selection guidance.
- Make template result topology easier to inspect after launch.
- Add examples that show when to use parallel research, fan-out implementation, review gates, and repair loops.

Acceptance coverage:

- DAG templates are named as first-class delegation objects.
- Review/repair/verification gates are included in the target shape.
- Operators are directed toward templates instead of repeatedly hand-authoring common graphs.

## 1554 - Provider/Auth Launch Preflight

CL: 0.991

First-class object: provider/runtime compatibility and credential readiness before operator handoff.

Authority contract:

- `@narada2/agent-start` provider resolution, credential projection, and launch preflight tests

Current implementation posture:

- Launch preflight covers provider registry resolution, missing credentials, Codex subscription readiness, unsupported provider/runtime combinations, and API key projection.
- Provider/auth checks belong before the operator surface takes over, because failures after handoff are harder to diagnose and repair.
- Runtime and operator surface selection must constrain provider choices rather than accepting impossible combinations.

Remaining implementation work:

- Keep interactive and noninteractive provider selection behavior aligned.
- Make diagnostics name runtime, operator surface, selected provider, credential source, and remediation.
- Preserve provider-specific secret names rather than collapsing all API keys into one generic variable.

Acceptance coverage:

- Provider failures are described as launch preflight failures, not opaque runtime errors.
- Runtime/provider compatibility is named as part of launch admission.
- Remediation guidance is specific to the missing or invalid credential source.

## 1555 - Site/Agent Speech Preferences

CL: 0.986

First-class object: Site default speech settings with Agent-level partial overrides.

Authority contract:

- `@narada2/speech-mcp` provider/model/voice schema and operator-routing speech defaults

Current implementation posture:

- Speech MCP supports provider, model, and voice selection for operator-facing speech output.
- Site-level and Agent-level preferences have a clear target shape: Site provides defaults, Agent supplies partial overrides.
- The inheritance model is conceptually settled, but config schema and validation coverage are not yet fully implemented.

Remaining implementation work:

- Add Site and Agent config schema fields for speech preferences.
- Implement an inheritance resolver where Agent values override only the fields they name.
- Validate provider/model/voice combinations after inheritance and produce actionable diagnostics.

Acceptance coverage:

- Site defaults and Agent partial overrides are named as the target shape.
- The remaining implementation gap is explicit rather than implied complete.
- Combination validation is part of the acceptance target.
