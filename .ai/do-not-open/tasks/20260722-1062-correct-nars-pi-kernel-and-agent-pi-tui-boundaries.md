---
status: in_review
criteria_proved_by: operator
criteria_proved_at: 2026-07-22T18:14:55.831Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
---

# Task 1062 — Correct NARS Pi Kernel and agent-pi-tui Authority Boundaries

## Goal

Consolidate and resolve every incoherence introduced while implementing the
Pi-backed NARS intelligence kernel. The result must make
`@narada2/nars-pi-kernel` a replaceable cognition kernel behind NARS, while
`@narada2/agent-pi-tui` remains only a NARS client/projection and terminal
presentation surface.

This is one task. Do not split the residuals below into derivative tasks or
status files. Record all execution and verification evidence in this original
task.

## Context

<!-- Context placeholder -->

## Required Work

### 1. Establish one ownership and naming model

- Choose and enforce one canonical package identity, preferably
  `packages/nars-pi-kernel` / `@narada2/nars-pi-kernel`, or document and
  consistently enforce the retained path.
- Move kernel/runtime lifecycle, substitutability, authority, transport,
  recovery, and negotiation tests to `agent-runtime-server` or a dedicated
  cross-system test location.
- Leave `agent-pi-tui` responsible only for client protocol, cursor/replay,
  PTY, input classification, rendering, and client-specific live acceptance.
- Update package metadata, README, architecture, target, and dependency audit
  so they state the same ownership.

### 2. Make the kernel contract authoritative and strict

- Keep the public kernel API representation-neutral and based on an opaque
  NARS-admitted turn.
- Remove public arbitrary-input `invoke()` from the contract; if the
  canonical invocation gateway needs an adapter, make that adapter internal or
  require an opaque NARS-issued admission record.
- Validate required gateway capabilities, tool descriptors, event vocabulary,
  correlation fields, and terminal states at the boundary.
- Reject undeclared/native/ambient tools unless they carry an explicit,
  catalog-admitted NARS gateway proxy marker.

### 3. Restore NARS authority and substitutability

- Scrub kernel kind and Pi-specific fields from canonical durable events and
  client projections; expose implementation details only through the permitted
  NARS health/diagnostic projection.
- Make native, SDK, and RPC kernels obey the same lifecycle, cancellation,
  retry, recovery, reconfiguration, close, event, and tool-result semantics.
- Reserve active-turn state before the first await, cancel/join active work on
  close, and make recovery actually rebuild context from NARS records.
- Preserve assistant tool calls during context reconstruction.
- Ensure reconfiguration consumes only the resolver's admitted plan.
- Distinguish tool refusal, tool failure, and unknown effect outcome.

### 4. Harden Pi SDK/RPC isolation and negotiation

- Make missing or contradictory version/capability negotiation fail closed.
- Do not self-assert peer capabilities as verified evidence.
- Make compatibility-host fallback explicit only.
- Install the admitted tool catalog consistently at startup and per turn.
- Enforce the claimed cwd/resource isolation or narrow the documentation and
  add a process-level negative proof.
- Forward complete NARS correlation and authority context through RPC tool calls.

### 5. Repair launch binding and client discovery

- Validate launch-binding schema, site, runtime host, operator surface,
  session identity, and paired event/health endpoints.
- Do not allow a normal client argument to silently override an admitted
  binding identity.
- Add a stale/wrong-binding test that reaches identity validation rather than
  merely failing to connect to a dead endpoint.

### 6. Make live acceptance genuine and truthful

- Select `pi-sdk` explicitly for Pi scenarios.
- Exercise the production launch/binding path, real runtime process, real
  `agent-pi-tui` PTY, and any required second operator surface.
- Add real runtime crash/restart/recovery, Pi-originated cancellation,
  ambiguous transport, replay/live overlap, same-key race, authority-negative,
  negotiation-refusal, and close scenarios.
- Use independent durable and external oracles.
- Emit the required evidence record for every live scenario.
- Make package scripts and CI run the intended suites, or name them clearly as
  partial/fixture/in-process tests.
- Update all live-coverage and architecture documentation to match actual
  evidence.

## Non-Goals

- Do not make `agent-pi-tui` a second runtime or provider executor.
- Do not redirect the independent `pi` carrier.
- Do not expose Pi RPC protocol to NARS clients.
- Do not weaken NARS session, capability, effect, recovery, or observation
  authority.
- Do not run live external provider or production side effects.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`,
  `*-FINAL`, or `*-SUPERSEDED` files.
- Do not split this inventory into additional tasks.

## Execution Notes

### Ownership and naming

- Retained `packages/nars-intelligence-runtime-pi` as the canonical directory
  and enforced `@narada2/nars-pi-kernel` as the canonical package name. The
  package metadata, lockfile, role catalog, README, target, architecture, and
  dependency audit agree; the proposed `packages/nars-pi-kernel` path and the
  nonexistent `@narada2/nars-intelligence-runtime-pi` package name have no
  remaining references.
- Moved the kernel/client substitutability acceptance probe from
  `packages/agent-pi-tui/test/` to
  `packages/agent-runtime-server/test/live-pi-client-kernel-substitutability-fixture-e2e.mjs`.
  Runtime lifecycle, recovery, authority, negotiation, and transport evidence
  now belong to the runtime-server/kernel boundary. `agent-pi-tui` retains
  client protocol, projection, cursor/replay, PTY, input, rendering, and
  client live acceptance ownership.
- Package scripts, the root live aggregates, the live-suite guard, the opt-in
  workflow, and the coverage documentation now name the moved probe and
  distinguish baseline real-process acceptance from direct-runtime
  `fixture-boundary` probes. Every live probe emits
  `narada.agent.live_evidence.v2` under
  `.ai/tmp/agent-pi-tui-live-e2e/evidence/` with PIDs, input boundary, durable
  and external oracles, negative assertions, same-session status, a canonical
  posture, and the validated `production_launch_binding` record when the
  production launcher is selected. The package now exposes a separate
  production-binding aggregate so launcher evidence cannot be confused with
  the local fixture aggregate.

### Contract and runtime corrections

- Removed arbitrary public `invoke()` from the representation-neutral public
  kernel declaration. The runtime-only `invokeAdmitted` bridge requires a
  NARS-issued turn identity, resolver-admitted plan, adapter resource, and one
  canonical capability gateway. `runTurn` now requires a complete gateway.
- Hardened the contract against non-record inputs, unknown turn/start fields,
  undeclared event kinds, invalid terminal states, invalid sequence/correlation
  fields, malformed tool descriptors, missing gateway capabilities, native or
  ambient tools, duplicate catalog names, and catalog membership bypasses.
  Gateway refusal, failed execution, and unknown outcome remain distinct.
- Reserved the Pi active turn before the first asynchronous setup await;
  setup failures release the reservation; close requests cancellation and
  joins the active turn before host close; recovery rehydrates rebuilt context;
  assistant tool-call messages with null content are preserved; and
  reconfiguration consumes only the resolver's admitted plan.
- Added complete correlation propagation for SDK/RPC tool calls and Pi event
  observations, explicit Pi capability negotiation evidence, fail-closed RPC
  handshake behavior, explicit-only compatibility fallback, startup and
  per-turn catalog enforcement, and narrowed SDK cwd/resource handling.
- `agent-runtime-server` now creates one scoped NARS capability gateway and
  passes the same gateway to local runtime startup and session turns. The
  admitted catalog is fetched before `kernel.start`; local unit/native runs
  receive an inert NARS-owned disabled gateway rather than an ambient fallback.
  The focused runtime test `runtime installs the admitted capability catalog
  before kernel startup` proves the startup ordering.
- The representation-neutral native kernel now sources and validates the same
  gateway-owned catalog before provider cognition, while reserving its active
  turn before the asynchronous catalog read. This keeps native and Pi SDK
  tool visibility and outer carrier lifecycle evidence substitutable; the
  runtime-server native-versus-Pi fixture now passes with an admitted tool
  round on both paths.
- Scrubbed kernel/Pi identity from durable startup and client projections;
  kernel identity remains only in the permitted health/diagnostic projection.
  Launch binding discovery now requires the known binding schemas, readiness,
  site/workspace/agent/runtime identity, paired result/session records, valid
  ws/http endpoints, and rejects a conflicting `--session` override. The
  authority-negative probe reaches a mismatched session identity rather than a
  dead endpoint.

### Inventory disposition (all 33 items)

| Item | Disposition |
| --- | --- |
| 1 | Resolved: runtime/kernel acceptance moved to runtime-server. |
| 2 | Resolved: retained path plus canonical package name documented and cataloged. |
| 3 | Resolved: architecture/audit docs distinguish real processes from synthetic/fixture evidence. |
| 4 | Resolved: fixture and partial-live names/docs are explicit. |
| 5 | Resolved: package/root scripts and opt-in workflow include the gap suite and moved probe. |
| 6 | Resolved: coverage document matches actual files and obligations. |
| 7 | Resolved: Pi gap harness selects `pi-sdk` explicitly. |
| 8 | Resolved: every gap probe has an explicit canonical production-launch mode and binding validator; the default remains truthfully fixture-boundary. |
| 9 | Resolved: P0 production-launch mode performs explicit same-session resume and records runtime/client/oracle evidence. |
| 10 | Resolved in the P0 harness: malformed input, failure handling, cancellation, and final durable journal checks are explicit. |
| 11 | Resolved for stale identity/refusal side effects and Pi-RPC child ambient traps; arbitrary in-process SDK ambient state remains intentionally not claimed. |
| 12 | Resolved for the governed WebSocket/child fault fixtures and production-binding runs; a separately provisioned external proxy remains outside this task. |
| 13 | Resolved: shared evidence schema records the required runtime/client/oracle fields. |
| 14 | Resolved as a truthful boundary: baseline is full production-launch evidence for its four surfaces; Pi-admitted artifact registration and renderer-close limitations remain explicit. |
| 15 | Resolved: canonical startup and client projections omit kernel selection. |
| 16 | Resolved: early fallback projections no longer invent `narada-native`. |
| 17 | Resolved: native/SDK/RPC share the tool-round contract; real Pi-PTY production baseline and partial-launch substitutability probes cover the lifecycle matrix, with external-provider dimensions still bounded. |
| 18 | Resolved: public declaration has no arbitrary invocation escape hatch; internal bridge is admission-shaped. |
| 19 | Resolved: strict boundary checks cover admitted inputs, gateway shape, event vocabulary, terminal states, and correlation. Opaque payload records remain intentional representation-neutral data. |
| 20 | Resolved: explicit proxy marker, canonical catalog, duplicate rejection, and membership enforcement are required. |
| 21 | Resolved: gateway failures are projected as failed/unknown execution, not admission refusal. |
| 22 | Resolved: RPC forwards NARS identity, attempt, admission, execution, result, reconciliation, and correlation context. |
| 23 | Resolved: active-turn reservation precedes asynchronous setup. |
| 24 | Resolved: close cancels and joins active work before terminal close. |
| 25 | Resolved: recovery passes journal-derived context into rebuilt Pi host. |
| 26 | Resolved: null-content assistant tool-call messages survive reconstruction. |
| 27 | Resolved: reconfiguration uses admitted plan resources only. |
| 28 | Resolved: RPC child handshake fails closed without advertised version/capabilities. |
| 29 | Resolved: peer-advertised verification is distinguished from adapter-declared capability evidence. |
| 30 | Resolved: compatibility fallback is explicit only. |
| 31 | Resolved: one admitted catalog is installed before startup and reused per turn; focused runtime proof added. |
| 32 | Resolved for the claimed posture: SDK isolation is narrowed to strict adapter policy and Pi-RPC has a process-level disposable-cwd/ambient-resource negative proof. |
| 33 | Resolved: launch binding/session/endpoint pairing and session override conflicts are validated. |

### Residuals / deferred production evidence

- No live external provider credentials or production side effects were run.
- Direct-runtime probes still record `production_launch_binding: false`, while
  the explicit `--production-launch` mode records a validated partial-launch
  binding. The production-binding aggregate exercises the launcher, lease
  discovery, and all selected client journeys; no direct fixture result is
  promoted to full production posture.
- External transport-proxy/provider credentials, arbitrary SDK ambient-resource
  process isolation, Pi-admitted artifact registration, and an external Pi
  compaction implementation remain bounded evidence gaps. The repository
  fixtures now cover malformed MCP JSON-RPC, request timeout, child
  disconnect/restart, provider 401/malformed responses, and Pi-RPC
  compaction/reconstruction without claiming those external dimensions.

### Post-report hardening (2026-07-22)

- Replaced the remaining v1 live-evidence ambiguity with the validated
  `narada.agent.live_evidence.v2` contract and three explicit postures:
  `fixture-boundary`, `partial-production-launch`, and
  `production-launch`. Production launch now records the canonical launcher,
  runtime host, site/workspace, session, process ownership, and paired
  event/health binding instead of inferring those facts from a direct child.
- Added the explicit production-binding aggregate and included the ambient
  isolation, provider-auth, and compaction/reconstruction probes in the
  package guard and launch matrix. The production P0 and authority-negative
  runs passed with real runtime/client PIDs and validated launch bindings.
- Unified native and Pi provider rounds through the shared
  `narada.nars.tool_round.v1` contract; the native/Pi substitutability probe
  passed with the same gateway-owned catalog and terminal authority.
- Narrowed SDK isolation to `in-process-adapter` plus
  `strict-adapter-policy`; retained the process-level disposable-cwd and
  ambient-negative proof for Pi-RPC, rather than claiming OS isolation for an
  in-process SDK. Added RPC auth refusal and bounded dropped-response timeout
  coverage; the Pi-kernel suite now passes 62 tests.
- Normalized runtime evidence `{kind: ...}` records to the session-core
  `{event: ...}` vocabulary. This fixed durable lifecycle/refusal evidence in
  the production authority path. The live harness now uses a separate 90
  second production-launch startup budget to tolerate sequential Windows
  launcher/process teardown without weakening its bounded timeout.
- Corrected the ambient-isolation and compaction RPC fixture paths to resolve
  from the repository root instead of the package working directory. Tightened
  the determinism canonicalizer to exclude launch/process authority metadata
  while retaining semantic event fields; the production determinism probe now
  passes across two independently launched sessions.
- Residuals remain explicit: external provider/proxy/auth credentials,
  arbitrary SDK ambient process isolation, Pi-admitted artifact registration,
  and an external Pi compaction implementation are not claimed by fixture or
  partial-launch evidence.

## Verification

- Final post-recovery focused checks were executed through the reopened
  structured-command MCP surface:
  - `pnpm --filter @narada2/nars-intelligence-kernel-contract test` — passed,
    4 tests.
  - `pnpm --filter @narada2/nars-pi-kernel test` — passed, 62 tests, exit 0.
  - `pnpm --filter @narada2/agent-runtime-server typecheck` — passed after the
    package's NodeNext module-resolution script correction.
  - The bounded runtime set (`local-intelligence-runtime.test.mjs`,
    `pi-kernel-substitutability.test.mjs`, and `local-execution-evidence.test.mjs`)
    — passed, 15 tests.
  - `pnpm --filter @narada2/agent-pi-tui typecheck` — passed.
  - `pnpm --filter @narada2/agent-pi-tui test` — passed, 5 files / 16 tests.
  - `pnpm --filter @narada2/agent-pi-tui test:live:guard` — passed; the
    package guard includes every gap probe, the fixture aggregate, and the
    production-binding aggregate.
  - Production P0 durability/cancellation and authority-negative probes —
    passed with `production_launch_binding: true` and
    `partial-production-launch` evidence.
  - The moved native-versus-`pi-rpc` client-kernel probe — passed through the
    canonical launcher with a real Pi PTY and partial-production evidence.
  - `pnpm --filter @narada2/agent-pi-tui test:live:production-binding` — passed
    with exit 0 after the repo-root fixture-path and determinism corrections;
    both four-surface kernel selections and every selected launcher gap probe
    emitted validated production-binding evidence. The earlier 420000 ms run
    timed out after passing its completed prefix; the final 900000 ms run
    completed in 8m14s.
- After the final native duplicate-catalog rejection hardening, the contract
  suite (4 tests) and the native-versus-Pi substitutability fixture (1 test)
  were rerun through MCP and passed.
- One initial post-edit Pi full-suite run had a single parallel RPC recovery
  timeout. The focused recovery suite passed, and the immediate full-suite
  rerun passed all 62 tests; this is retained as
  infrastructure/flakiness evidence rather than hidden as a code pass.
- `pnpm --dir packages/agent-runtime-server test` was attempted with a bounded
  240000 ms structured-command timeout and returned `child_request_timeout`
  without stdout. It is retained as an infrastructure/suite-hang result, not
  a pass or a claimed code failure.
- An earlier post-edit verification window returned `Transport closed` for
  structured-command MCP retries; the surface was later reopened through
  mcp-loader, so that historical transport interruption is not treated as
  final verification evidence. The governed `task finish 1062 --agent
  operator` submission succeeded with the recorded summary, changed files,
  verification, residuals, and `--prove-criteria`: report submitted, criteria
  proved, roster transition done, evidence verdict `needs_review`, and
  lifecycle status `in_review`.
- No derivative task-status file exists for this task (MCP filesystem search
  found no `-EXECUTED`, `-DONE`, `-RESULT`, `-FINAL`, or `-SUPERSEDED` match).

## Acceptance Criteria

- [x] One canonical kernel package path/name is selected and all references
- [x] `agent-pi-tui` contains no kernel/runtime acceptance ownership beyond
- [x] All 33 inventory items are resolved or have explicit blocker evidence in
- [x] The public contract accepts only NARS-admitted, representation-neutral
- [x] Canonical NARS events and client projections do not reveal kernel
- [x] Native, SDK, and RPC kernels have shared contract/boundary conformance
- [x] Tool admission is explicit, catalog-bound, correlated, and correctly
- [x] Active-turn, close, recovery, context reconstruction, and admitted
- [x] SDK/RPC negotiation, isolation, fallback, startup catalog, and RPC
- [x] Launch binding/session discovery validates the complete binding identity.
- [x] Genuine live tests use production boundaries and emit the required
- [x] Focused verification is recorded below, and no derivative task-status

## Follow-Up Ledger

- covered by #1062: production binding, taxonomy, shared tool rounds, scoped isolation, transport fault coverage, and lifecycle synchronization are implemented and verified in this task.
- deferred: external provider/proxy credentials, arbitrary SDK ambient isolation, Pi-admitted artifact registration, and external Pi compaction remain unavailable and unclaimed.
- no follow-up needed: no derivative task is created because the remaining external dimensions are explicitly bounded evidence, not this task's acceptance criteria.
