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
- Workspace launcher result evidence distinguishes hidden runtime handoff from operator projection handoff; a hidden NARS start should not be described as a terminal handoff.
- Liveness authority comes from `/health` or `session.health`, not from `status_hint`, terminal windows, or ambient process guesses.
- Launch result renderers should surface `NARADA_NARS_SESSION_ID` first, then `NARADA_RUNTIME_SESSION_ID`, and keep `NARADA_CARRIER_SESSION_ID` fenced under explicit legacy compatibility.
- Workspace launch starts NARS runtime hosts through hidden runtime posture when the runtime start is `hidden_detached`; operator terminals are projections, not the runtime ownership mechanism.

Remaining implementation work:

- Continue hardening stale and ambiguous session UX in attach commands.
- Keep the extraction boundaries explicit: session control is in session-core, provider execution is in provider-runtime, MCP hosting is in capability-gateway, and carrier-runtime is stateless.
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

## 1550A - Launcher Legacy Carrier Compatibility Boundary

CL: 0.991

First-class object: explicit compatibility descriptor for legacy `carrier` vocabulary in workspace launch plans.

Authority contracts:

- `C:/Users/Andrey/Narada/docs/operator/agent-start.md`
- `packages/layers/cli/src/commands/launcher.ts`

Current implementation posture:

- Workspace launch plans expose canonical `operator_surface`, `operator_surface_kind`, `launch_operator_surface`, `launch_operator_surfaces`, `runtime_host_kind`, `launch_runtime_host`, and `launch_runtime_hosts` fields.
- Legacy `carrier`, `launch_carrier`, `launch_carriers`, and `launch_runtime` remain in JSON output only as compatibility fields for existing callers.
- Any workspace-plan output carrying those legacy fields also carries `legacy_carrier_compatibility` on each selected agent and aggregate `compatibility` on the result.
- Smoke output also carries `legacy_carrier_compatibility` beside outer smoke-agent `carrier`/`runtime` fields, plus the nested plan descriptor, so compatibility is explicit at every JSON object level that still exposes the deprecated vocabulary.
- The compatibility descriptor names the canonical replacements and the `remove_after_consumers_migrate` policy.

Remaining implementation work:

- Migrate downstream consumers from `carrier`/`launch_carrier*` to `operator_surface`/`launch_operator_surface*`.
- Avoid renaming unrelated Site live-carrier concepts; those are a different use of the word `carrier`.
- Remove compatibility aliases only after consumers and fixtures no longer rely on them.

Acceptance coverage:

- `packages/layers/cli/test/commands/launcher-workspace-plan.test.ts` requires compatibility descriptors for plan and smoke outputs.
- `packages/layers/cli/test/integration/operator-launch-journey.test.mjs` requires the descriptor through the PowerShell wrapper dry-run path.
- Operator docs state the replacement fields and the descriptor requirement.

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

## 1556 - Role Enforcement Policy

CL: 0.989

First-class object: resolved task role and capability policy across product, host, User Site, target Site, and task scopes.

Authority contracts:

- [`task-lifecycle-role-enforcement-policy.md`](task-lifecycle-role-enforcement-policy.md)
- Task lifecycle MCP target docs and role/capability enforcement tests

Current implementation posture:

- Role enforcement has a policy document and task lifecycle tests for target role, generic engineer, outcome contracts, review capability, and verification capability.
- Role binding is an eligibility filter, while lifecycle mutation authority remains explicit and auditable.
- Advisory and strict modes must not be conflated because different Sites may be at different enforcement maturity.

Remaining implementation work:

- Surface the resolved policy consistently in claim, continue, finish, review, workboard, and diagnostics.
- Make Site-level opt-in and host/User defaults explicit where they participate in resolution.
- Ensure refusal messages explain role binding, authority basis, and available remediation separately.

Acceptance coverage:

- The policy object is named independently from any one task lifecycle tool call.
- Advisory and strict modes are stated as distinct enforcement postures.
- Diagnostics must identify the resolved policy basis, not just the refusal outcome.

## 1557 - MCP Ergonomics Feedback Loop

CL: 0.997

First-class object: feedback intake, routing, status, import, and downstream task linkage for MCP surface ergonomics.

Authority contract:

- `@narada2/surface-feedback-mcp` feedback store and registrar binding guidance

Current implementation posture:

- Surface feedback exists as a dedicated MCP surface and is used during launcher, delegation, lifecycle, filesystem, and projection work.
- User Site and workspace guidance already instruct agents to submit MCP ergonomics observations while working.
- Delegation and task lifecycle flows can reference feedback IDs, but feedback is not itself execution completion authority.

Remaining implementation work:

- Audit that every maintained MCP surface advertises the feedback path clearly.
- Clarify the distinction between feedback, execution tasks, and lifecycle closeout evidence.
- Improve feedback-to-task conversion and status visibility so useful reports do not disappear into an unreviewed queue.

Acceptance coverage:

- MCP feedback is named as a first-class loop, not an incidental operator request.
- Feedback is traceable into tasks or surface backlog without becoming mutation authority by itself.
- The distinction between ergonomics feedback and task execution evidence is explicit.

## 1558 - Health, Heartbeat, And Lifecycle Hooks

CL: 0.995

First-class object: NARS-owned health projection, heartbeat freshness, session events, and session/turn lifecycle hooks.

Authority contracts:

- [`nars-runtime-contract.md`](nars-runtime-contract.md)
- [`nars-session-management.md`](nars-session-management.md)

Current implementation posture:

- NARS runtime contract names `session.health`, HTTP `/health`, heartbeat freshness, session events, and lifecycle hook payloads.
- Session management docs define health and heartbeat as liveness projections rather than terminal-window guesses.
- Client views are expected to observe health without letting routine samples pollute conversation history.

Remaining implementation work:

- Keep routine healthy heartbeats out of operator chat while still surfacing degraded and error states.
- Add or preserve hook payload tests where runtime extraction changed package boundaries.
- Make session and turn lifecycle hook semantics stable enough for CLI, TUI, Web UI, and future surfaces to share.

Acceptance coverage:

- Health and heartbeat are documented as NARS-owned projections.
- Lifecycle hooks are stated as shared runtime semantics, not client-local callbacks.
- Routine health visibility and conversation rendering are explicitly separated.

## 1559 - Renderable Artifacts

CL: 0.991

First-class object: session-scoped artifact registration, serving, message references, and client rendering.

Authority contracts:

- [`nars-session-management.md`](nars-session-management.md)
- `@narada2/artifacts-mcp` artifact registration/list/read/present tools
- `@narada2/agent-runtime-server` artifact routes and message-part references

Current implementation posture:

- Artifact registration, listing, reading, and presentation exist as dedicated MCP/runtime mechanics.
- NARS exposes artifact routes and client-facing message parts can carry `artifact_ref` instead of dumping raw payloads into chat.
- Web and terminal clients still need consistent rendering policy for artifact links, previews, content safety, and copy/download affordances.

Remaining implementation work:

- Keep large/raw tool payloads out of conversation by preferring artifact references.
- Define safe rendering policy by content type and trust boundary.
- Add client parity checks for artifact refs in CLI, TUI, Web UI, and future surfaces.

Acceptance coverage:

- Renderable artifacts are named as first-class session-scoped objects.
- Artifact references are preferred over raw payload dumps for large or structured outputs.
- Content policy and client rendering are recorded as explicit remaining work.

## 1560 - AuthorityGrant

CL: 0.993

First-class object: explicit grant object for who may do what, under which authority, over which scope, and with what expiry or revocation posture.

Authority contracts:

- [`SEMANTICS.md`](../../SEMANTICS.md)
- [`task-lifecycle-role-enforcement-policy.md`](task-lifecycle-role-enforcement-policy.md)
- [`../../docs/product/message-routing-authority-posture.md`](../product/message-routing-authority-posture.md)

Current implementation posture:

- Narada still carries authority as scattered `authority_basis` text, tool policy, task routing, launch permissions, and projection tokens.
- The target shape needs grantor, grantee, action/capability, scope, authority basis, expiry/revocation, evidence refs, audit metadata, and enforcement posture.
- The grant object must stay separate from secret tokens and from the enforcement mechanisms that consume it.

Mapped authority cases:

- task lifecycle claim/close authority: explicit task owner or reviewer capability with audit trail.
- launcher admission: a launch principal may start a surface only within the declared session and Site scope.
- MCP mutation: a capability grant can authorize a specific mutation family without granting blanket runtime power.
- Cloudflare projection: a projection grant can authorize a site or worker to publish a bounded artifact or state projection.
- delegation: a delegated agent can act on a scoped task or inbox envelope without inheriting unrelated authority.

Remaining implementation work:

- Define the schema and lifecycle as a durable object, not an ad hoc text convention.
- Record revocation, expiry, and evidence invalidation semantics explicitly.
- Distinguish declaration, admission, and enforcement so checks remain layered instead of collapsing into one gate.

Acceptance coverage:

- AuthorityGrant is named as a first-class object with explicit lifecycle posture.
- At least five existing authority cases are mapped to the object.
- Revocation, expiry, evidence, and audit semantics are documented.
- The declaration/admission/enforcement split is stated as required implementation shape.

## 1561 - SurfaceAttachment

CL: 0.992

First-class object: operator surface attachment as a runtime relationship rather than a one-off attach command.

Authority contracts:

- [`nars-session-management.md`](nars-session-management.md)
- [`nars-client-projection-contract.md`](nars-client-projection-contract.md)
- [`agent-carrier.md`](agent-carrier.md)

Current implementation posture:

- `agent-cli`, `agent-tui`, `agent-web-ui`, and future surfaces need a shared attach/detach model.
- The object needs surface kind, surface instance id, runtime session, projection mode, view policy, permission set, event cursor, health, attach source, detach state, and lifecycle timestamps.
- Launcher behavior, NARS session index lookup, and web UI attach behavior must all be representable in the same attachment shape.

Mapped attachment cases:

- `agent-cli` attached to a NARS session through launcher discovery.
- `agent-web-ui` attached through a browser-backed projection mode with view-policy filtering.
- stale attachment after session loss or heartbeat expiry.
- failed attachment after endpoint discovery, permission, or health checks reject the relationship.

Remaining implementation work:

- Keep attachment state first-class instead of deriving it only from attach command logs.
- Separate runtime authority from operator surface presentation authority.
- Preserve surface-specific differences while still sharing the common attachment object.

Acceptance coverage:

- SurfaceAttachment is documented as a schema and lifecycle relation.
- `agent-cli` and `agent-web-ui` attachment cases are representable.
- Attach, detach, stale, and failed states are explicit.
- Session index and operator view policy integration is named.

## 1562 - AdmissionPolicy

CL: 0.994

First-class object: unified admission decision policy for inbound operator messages, inbox events, email-derived tasks, remote inputs, and projection ingress.

Authority contracts:

- [`message-routing-authority-posture.md`](../product/message-routing-authority-posture.md)
- [`canonical-mutation-evidence.md`](canonical-mutation-evidence.md)
- [`task-lifecycle-role-enforcement-policy.md`](task-lifecycle-role-enforcement-policy.md)

Current implementation posture:

- Narada currently spreads accept/queue/reject/delay/review decisions across surfaces, NARS, task lifecycle, and site-specific flows.
- The policy needs source, target authority, accepted payload kinds, queueing semantics, turn-state behavior, review gates, rejection reasons, retry posture, and audit evidence.
- NARS should own canonical operator-message admission semantics while site-level governance still controls target-specific admission.

Mapped ingress cases:

- operator message queueing and backpressure.
- email intake into facts or tasks.
- inbox task creation from a governed incoming message.
- Cloudflare remote operator input entering a local or remote projection boundary.

Remaining implementation work:

- Define the decision outcomes explicitly: accepted, queued, rejected, delayed, and review-required.
- Preserve site-level governance instead of flattening all ingress into one universal allow/deny switch.
- Record retry and audit posture so admission can be explained after the fact.

Acceptance coverage:

- AdmissionPolicy is documented as a schema and decision model.
- Queueing, acceptance, rejection, delay, and review-required outcomes are represented.
- Canonical operator-message admission semantics are assigned to NARS.
- At least four ingress paths are mapped.

## 1563 - ObjectLifecyclePolicy

CL: 0.993

First-class object: shared lifecycle semantics for first-class Narada objects instead of each object inventing states independently.

Authority contracts:

- [`canonical-mutation-evidence.md`](canonical-mutation-evidence.md)
- [`task-lifecycle-role-enforcement-policy.md`](task-lifecycle-role-enforcement-policy.md)
- [`nars-session-management.md`](nars-session-management.md)

Current implementation posture:

- Tasks, sessions, projections, artifacts, attachments, grants, loops, and health records each need creation, mutation, closure, archival, retention, revocation, replay, cleanup, and stale-state rules.
- A shared policy should define allowed states, transitions, ownership, mutation authority, retention, archival, revocation, replay, cleanup, stale detection, and audit requirements.
- Object-specific lifecycle policies remain necessary where an object family has a distinct domain meaning or safety boundary.

Mapped object families:

- tasks
- sessions
- projections
- artifacts
- attachments
- grants

Remaining implementation work:

- Identify the shared lifecycle algebra that can be reused across those families.
- Keep object-specific policy hooks for the families that need them.
- Preserve existing task lifecycle semantics while adopting a more generic lifecycle vocabulary.

Acceptance coverage:

- Lifecycle policy schema is documented.
- At least six object families are mapped to shared and object-specific rules.
- Retention, revocation, stale, and archival semantics are explicit.
- Gradual adoption without breaking task lifecycle semantics is stated as a requirement.

## 1564 - OperatorViewPolicy

CL: 0.994

First-class object: shared rules for what operator surfaces show in conversation, activity, diagnostics, raw, and status views.

Authority contracts:

- [`nars-client-projection-contract.md`](nars-client-projection-contract.md)
- [`nars-runtime-contract.md`](nars-runtime-contract.md)
- [`../product/message-routing-authority-posture.md`](../product/message-routing-authority-posture.md)

Current implementation posture:

- `agent-cli` and `agent-web-ui` have renderer-local policy drift around health spam, duplicate messages, raw objects, tool events, and progress indicators.
- The policy needs lanes/views, verbosity, event class visibility, deduplication, markdown/artifact rendering, health suppression, progress indicators, raw diagnostics access, and per-surface overrides.
- Surfaces may render differently while still sharing the same classification rules.

Mapped view cases:

- conversation view: canonical operator conversation only.
- activity view: progress, operations, and task movement.
- diagnostics view: degraded state, failures, and bounded troubleshooting details.
- raw view: explicit raw access without accidental leakage into conversation.
- status view: concise operator-facing health and progress summary.

Remaining implementation work:

- Move classifier rules out of renderers and into shared policy.
- Preserve raw diagnostics access without making raw the default presentation.
- Treat duplication, health spam, and raw object leakage as policy failures.

Acceptance coverage:

- OperatorViewPolicy is documented as a schema and policy surface.
- Conversation, activity, diagnostics, raw, and status semantics are explicit.
- `agent-cli` and `agent-web-ui` share classification rules while rendering differently.
- Duplication, health spam, and raw object leakage are named failure modes.

## 1565 - EvidencePacket

CL: 0.995

First-class object: structured proof of claims across tasks, SOPs, git commits, E2E tests, probes, and projections.

Authority contracts:

- [`canonical-mutation-evidence.md`](canonical-mutation-evidence.md)
- [`task-lifecycle-role-enforcement-policy.md`](task-lifecycle-role-enforcement-policy.md)
- [`message-routing-authority-posture.md`](../product/message-routing-authority-posture.md)

Current implementation posture:

- Evidence currently appears as task lifecycle notes, SOP receipts, git diffs, test output, projection artifacts, and ad hoc summaries.
- The packet should carry claim, evidence type, producer, verifier, artifact refs, command/test refs, timestamps, trust level, scope, and invalidation conditions.
- Evidence must remain referenceable by task lifecycle and review flows without discarding existing evidence fields.

Mapped evidence sources:

- task closeout evidence
- SOP run evidence
- git commit evidence
- E2E proof artifacts
- projection health evidence

Remaining implementation work:

- Make verifier and trust semantics explicit instead of implicit in prose.
- Define invalidation conditions so stale or superseded evidence can be recognized.
- Keep lightweight notes possible for trivial cases while retaining structure for meaningful claims.

Acceptance coverage:

- EvidencePacket is documented as a schema.
- At least five existing evidence sources are mapped.
- Verifier, trust, and invalidation semantics are explicit.
- Task lifecycle and review flows can reference the packet without losing existing evidence fields.

## 1708 - LoopDefinition And WatchDefinition

CL: 0.985

First-class object: the declarative Site Operating Loop definition and its watch/trigger definition, distinct from the runtime host and from a single bounded Loop Run.

Authority contracts:

- [`site-operating-loop.md`](site-operating-loop.md)
- [`site-operating-loop-runtime-contract.md`](site-operating-loop-runtime-contract.md)

Current implementation posture:

- Narada already has a generic Site Operating Loop runtime host, loop module contract, trigger admission, bounded runs, and durable run evidence.
- The semantic gap is the durable definition object that names the loop policy and the companion watch definition that explains what wakes or gates a run.
- The existing runtime contract already keeps host substrate separate from loop semantics, so the first-class object can be named without collapsing into the runtime package.

Remaining implementation work:

- Expose first-class LoopDefinition and WatchDefinition records in the concept registry.
- Keep loop-definition semantics separate from the runtime host, one run, and raw substrate.
- Clarify how watches map to trigger admission and cadence without reducing them to a plain subscription.

Acceptance coverage:

- LoopDefinition and WatchDefinition are named as distinct first-class objects.
- The Site Operating Loop docs are linked as the authority surface.
- Runtime host, loop definition, watch definition, and Loop Run remain separate objects.
- Trigger admission and step execution remain runtime responsibilities, not definition responsibilities.

## 1710 - LauncherSessionDashboard (removed)

Removed with the interactive group-launch stack (decision 20260718-2038, task
#2041): the persistent browser dashboard session opened by
`workspace-launch --interactive-selection-ui` no longer exists. Launch is
single-agent by default (`narada launcher workspace-launch --agent <id>`);
Site-level runtime bring-up is owned by `narada sites launch` and the Site
Operating Loop. This entry remains only as a historical pointer — do not
implement new work against it.

Runtime-start posture (still authoritative for the surviving launcher):

- `narada-agent-runtime-server` background starts are governed by [`Agent Runtime Start Posture`](../architecture/process-launch-posture.md#agent-runtime-start-posture).
- For `runtime = narada-agent-runtime-server`, `exec = true`, and `wait != true`, the default execution mode is `hidden_detached` unless an explicit `visible_runtime_terminal` request is present.
- Hidden runtime-start selection is independent of operator-surface or compatibility carrier naming. Operator-surface names may affect projection behavior; they must not decide whether the runtime host opens a terminal.
- Launch results should expose `agent_start_execution_mode`, `detach_decision`, and `detach_refusal_reasons` so operator diagnostics do not need to infer posture from process trees.

## 1709 - ProjectionTopology

CL: 0.985

First-class object: the canonical topology describing authority runtimes, projection stores, projection surfaces, and intent routes.

Authority contracts:

- [`narada-runtime-projection-graph.md`](narada-runtime-projection-graph.md)
- [`nars-runtime-contract.md`](nars-runtime-contract.md)
- [`nars-session-management.md`](nars-session-management.md)
- [`nars-client-projection-contract.md`](nars-client-projection-contract.md)
- [`nars-authority-runtime-host-transition.md`](nars-authority-runtime-host-transition.md)

Current implementation posture:

- The Narada Runtime Projection Graph doc already names the general topology and its authority/projection split.
- Session management, client projection, operator projection open requests, and authority host transitions are concrete embodiments of that topology.
- The missing step is the registry-facing first-class name so the topology can be queried without re-deriving it from prose.

Remaining implementation work:

- Keep projection stores non-canonical and authority runtimes canonical.
- Preserve authority/runtime separation across local, Cloudflare, and future host transitions.
- Surface the topology as a queryable registry object instead of only as prose.

Acceptance coverage:

- ProjectionTopology is named as the topology concept, with the Narada Runtime Projection Graph as an embodiment.
- NARS session management, client projection, and authority host transition are expressed as topology embodiments.
- Projection surfaces do not become authority by durability, freshness, or attachment order.
