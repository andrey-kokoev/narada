# Agent Carrier

## Canonical Definition

An **Agent Carrier** is the runtime embodiment that carries one durable Agent through one bounded Carrier Session by projecting contextual capabilities, mediating governed crossings, preserving singular authority, and emitting reconstructable session evidence.

The word **harness** may be used as explanatory shorthand, but it is not the primitive. A carrier is not an amorphous wrapper around a model and it is not a bundle of executors. It is defined by the obligations below.

## Carrier Obligations

An Agent Carrier must:

- bind exactly one durable Agent identity into one bounded Carrier Session;
- hydrate the session with the applicable law, role, launch packet, context, and startup evidence;
- project only the capabilities admitted for that session and posture;
- mediate effectful crossings, including shell, MCP, HTTP, filesystem, UI, and process execution surfaces when present;
- preserve the distinction between capability availability, operator consent, execution attempt, and confirmed effect;
- emit reconstructable evidence for launch, hydration, capability projection, approvals, tool calls, outputs, interruptions, handoffs, and closeout;
- support bounded lifecycle operations such as start, resume, interrupt, handoff, close, and reconstruction;
- remain an embodiment of authority-bearing work, not the authority locus itself.

Shell, MCP, HTTP, browser, filesystem, and UI access are **capability channels** or **tool surfaces** projected by a carrier. They do not define the carrier. A carrier may expose any subset of them, and Narada-native carriers may expose additional governed capability families, but the carrier identity comes from session embodiment, crossing mediation, and evidence obligations.

## Authority Boundary

An Agent Carrier must not collapse embodiment into authority. Codex, Kimi, a Narada-native carrier, a daemon, a terminal, or a UI may present work and assist with effects, but governed mutation must still resolve to the declared authority locus for the Site, Operation Specification, task lifecycle, inbox, outbox, repository publication, or other affected substrate.

This keeps **Plural Embodiment, Singular Authority** intact: many carrier implementations and operator surfaces may exist, but they do not create parallel authority.

## Terminology Posture

Prefer **Agent Carrier**, **carrier runtime**, **runtime embodiment**, and **Carrier Session** in normative text.

Use **harness** only in informal explanatory prose, and only where the surrounding text immediately constrains it with the carrier obligations above.

An **Agent Carrier** is the governed runtime harness that embodies one durable Agent in one bounded Session.

Use [`Carrier Taxonomy`](carrier-taxonomy.md) when distinguishing `Carrier`, `CarrierKind`, `CarrierHost`, `CarrierTransport`, `CarrierProtocol`, `CarrierRuntimeContract`, `CarrierSurface`, and `ControlChannel`.

It answers:

```text
What runtime machinery is carrying this Agent right now, and what Narada authority, policy, tools, evidence, and restart semantics are bound into that embodiment?
```

Codex CLI, Claude Code CLI, Kimi CLI, and Narada-native are carrier implementation families. A Narada-native carrier is not a new kind of Agent; it is a Narada-owned carrier runtime posture for one bounded Carrier Session.

## Split

| Layer | Meaning | Authority posture |
| --- | --- | --- |
| Agent | Durable Site-recognized identity such as `narada.architect` or `narada-andrey.Kevin`. | Owns role, history, task assignment, checkpoint trail, and capability posture through Site authority records. |
| Session | One bounded embodiment of exactly one Agent. | Cannot change Agent identity after start; records start event, carrier session id, workspace, and runtime evidence. |
| Carrier | Runtime harness that starts and governs the Session. | Binds environment, MCP surfaces, approval policy, startup affordance, launch result, transcript/evidence capture, and restart semantics. It does not own authority. |
| Substrate | Model or execution backend used by the carrier, such as an OpenAI-backed Codex runtime, Kimi model, local model, or API executor. | Generates cognition or execution attempts; does not own Narada identity, role, task, or capability authority. |
| Operator Surface | Addressable interface for inhabiting or observing the Session. | Presents/focuses/labels work; does not grant mutation authority. |
| Control Channel | Transport into or out of the carrier, such as terminal stdin/stdout, API thread, MCP stdio, HTTP, mailbox, or console event. | Carries requests/results; arrival is not admission. |
| Trace substrate | Durable evidence stores: launch events, session records, transcripts, task reports, inbox envelopes, checkpoints, and mutation evidence. | Records what happened; does not itself authorize what may happen next. |

The canonical relation is:

```text
Agent
-> Session
-> Carrier
-> Substrate
-> Control Channel / Operator Surface
-> Trace substrate
```

## Carrier Responsibilities

A carrier must make Narada identity and authority boundaries mechanical instead of conversational.

At minimum, a carrier should:

- bind exactly one `agent_id` for the Session;
- materialize an agent start event and carrier session record;
- set required `NARADA_*` environment for child MCP surfaces;
- expose the startup command affordance, currently `agent_context_startup_sequence({})`;
- disable or refuse non-admitted native execution paths when policy requires MCP-only execution;
- mount only admitted MCP/tool surfaces with explicit approval posture;
- record a durable launch result packet before handoff to the interactive substrate;
- expose a copy-safe sentinel or equivalent result terminator for terminal/TUI output;
- preserve carrier/session evidence for resume, restart, and runtime binding;
- distinguish policy-aware Narada shell MCP from native carrier shell access;
- surface restart pressure without pretending a stdio child can restart its parent carrier;
- keep launch, tool approval, task lifecycle, inbox, and operator-surface authority separated.

## Narada-Native Carrier

A **Narada-native carrier** is a carrier implementation whose primary contract is Narada's Agent/Session/Carrier grammar rather than an adapter around a third-party CLI.

It should own:

- session start orchestration;
- startup hydration sequencing;
- MCP policy and permission configuration;
- model/substrate adapter selection;
- tool-call mediation and audit;
- transcript and evidence capture;
- checkpoint and resume affordances;
- PC/runtime registration hooks where a host runtime exists;
- operator-surface binding hooks where an Operator Surface exists.

It should not own:

- Agent identity truth;
- task claim/finish/review authority;
- inbox admission authority;
- capability grants;
- credential material;
- PC-local window/process truth;
- publication authority.

Those remain Site, lifecycle, inbox, capability, PC runtime, and Operator authority concerns.

## Adapter Families

Carrier implementations can be grouped as:

| Carrier | Substrate relation | Notes |
| --- | --- | --- |
| `codex_carrier` | Wraps Codex CLI. | Uses Codex flags/config for approvals and disables native `shell_tool` when MCP-only policy applies. |
| `claude_code_carrier` | Wraps Claude Code CLI. | First slice may represent the Carrier Session, startup hydration, Narada proper MCP posture, and non-claims before any Claude Code native tool execution is admitted. |
| `kimi_carrier` | Wraps Kimi CLI. | Must project the same Agent/Session/Carrier contract through Kimi-specific launch and tool semantics. |
| `narada_native_carrier` | Narada-owned harness with pluggable model/substrate adapters. | First slice plans start, hydration, capability projection, evidence recording, and closeout with facade-only capability posture until execution carriers are admitted. |
| `api_agent_carrier` | Wraps an API conversation or remote worker. | Needs explicit control-channel, transcript, and capability-envelope evidence because no terminal process may exist. |

The carrier interface should be stable enough that Codex, Claude Code, Kimi, and Narada-native carriers all produce comparable launch packets and readiness evidence.

## Native Shell Flag Scope

`EnableNativeShell` is a Codex-carrier break-glass flag, not a general carrier permission.

For Codex, the flag means the launcher does not pass `--disable shell_tool`. It does not itself grant task, inbox, publication, filesystem, credential, or external-effect authority.

For NARS-backed launches such as `-OperatorSurface agent-cli -Runtime nars` (compatibility spelling: `-Carrier agent-cli -Runtime narada-agent-runtime-server`), `pi`, `kimi`, `claude-code`, and Narada-native carriers, command execution must be represented through the carrier's own admitted tool/capability channel. These carriers must not interpret `EnableNativeShell` as a standing native shell grant merely because the launcher surface accepts the flag.

## Launch Packet Contract

A v0 carrier launch packet should include:

| Field | Meaning |
| --- | --- |
| `agent_id` | Durable Agent identity being embodied. |
| `site_root` | Site root whose law and runtime state scope the Session. |
| `runtime_kind` | Carrier implementation kind, such as `codex_cli`, `kimi_cli`, or `narada_native`. |
| `carrier_session_id` | Durable Session/Carrier correlation id. |
| `agent_start_event_id` | Start event materialized before substrate handoff. |
| `startup_command` | Named startup affordance and arguments. |
| `required_environment` | Required `NARADA_*` bindings inherited by MCP children. |
| `tool_approval_policy` | Explicit admitted/withheld MCP/tool surfaces and rationale. |
| `native_execution_policy` | Whether native shell/script execution is disabled, refused, or admitted by exception. |
| `launch_result_path` | Durable packet path to trust over terminal copy/display truncation. |
| `result_sentinel` | Copy-safe marker that identifies the complete launch result. |
| `pc_runtime_ref` | Optional host/runtime record for window/process/restart coordination. |
| `not_claimed` | Explicit non-claims such as exact resume binding, credential access, or source-state import. |

## Launch-Result File Lifecycle

Launch-result files are published only after the v0 result contract and canonical handoff coherence validate. The publisher writes a uniquely named temporary sibling file and renames it into the active result directory, so readers never observe a partially written `.result.json`.

At every runtime status/start boundary, the launcher scans the active result directory under a per-directory lock. Legacy or contract-invalid result files, including semantically incoherent handoffs, are deleted and appended by path, hash, reason, and timestamp to the adjacent reconciliation receipt. Valid current results remain audit history. If reconciliation cannot complete, the launcher fails closed with the exact artifact and remediation instead of silently ignoring it.

After each reconciliation pass, result discovery remains strict: an invalid artifact is an error, not a record to skip. The reconciliation receipt is strictly bound to its result directory and is an append-only audit trail of cleanup; its presence does not suppress later scans. The pass is idempotent when no new invalid artifacts appear.

## Locus Factorization

Carrier work splits across loci:

| Locus | Owns |
| --- | --- |
| Narada proper | Carrier concept, launch packet contract, package API, adapter semantics, doctrine, and cross-carrier tests. |
| User Site | Local adoption preferences, operator-facing launch affordances, evidence from inhabited use, package-lift proposals, and temporary compatibility projections. |
| PC Site | Host/runtime facts: processes, windows, HWNDs, terminal profiles, shortcuts, carrier-session records, restart coordination, and local health evidence. |

Do not implement a Narada-native carrier as a PC Site script first. PC scripts may materialize or observe a carrier, but the carrier abstraction belongs in Narada proper.

Do not implement a Narada-native carrier as a User Site preference first. User Site artifacts may request or configure adoption, but the stable API belongs in Narada proper.

## Anti-Collapse Rules

- A carrier is not an Agent.
- A Session is not an Agent.
- A substrate is not an Agent.
- An Operator Surface is not a carrier.
- A terminal profile is carrier evidence, not identity authority.
- A model backend is substrate, not Narada authority.
- A launch packet is evidence, not task activation authority.
- A carrier may enforce policy, but it does not create the policy authority it enforces.
- Native shell access and policy-aware Narada shell MCP are distinct capabilities.
- Restart pressure is runtime evidence; restart authority remains with the owning carrier or host/runtime locus.

## Relationship To Existing Concepts

- [`Carrier Taxonomy`](carrier-taxonomy.md) defines the layered vocabulary for carrier kind, host, transport, protocol, runtime contract, surface, and control channel.
- [`Runtime Identity Binding`](runtime-identity-binding.md) binds volatile runtime handles to durable identity evidence; Agent Carrier defines the harness that may produce such handles.
- [`Narada Agent Runtime Server`](narada-agent-runtime-server.md) defines the machine-addressable, multi-turn carrier posture for automation-driven local intelligence sessions.
- [`Carrier Action Admission Boundary`](carrier-action-admission-boundary.md) defines the carrier-to-authority conversion boundary for requested tool calls, commands, sends, publications, and other effectful work.
- [`Agent Identity Object`](../product/agent-identity.v0.md) defines the Site-scoped durable Agent identity record that a carrier embodies through a bounded Carrier Session.
- [`Operator Surface`](operator-surface.md) presents or reaches inhabited work; Agent Carrier runs the Session being presented.
- [`Runtime-Invariant Adapter Contract`](runtime-invariant-adapter-contract.md) governs stable adapter contracts across runtime substrates; Agent Carrier is the agent-session adapter family.
- [`Command Execution Intent Zone`](command-execution-intent-zone.md) governs command execution requests; Agent Carrier must route command execution through admitted surfaces rather than letting substrate convenience become authority.
- [`Plural Embodiment, Singular Authority`](plural-embodiment-singular-authority.md) explains why multiple carriers/surfaces can embody one Site or role without multiplying mutation authority.
