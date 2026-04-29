# Operator Surface

An **Operator Surface** is a durable, addressable interface through which an Operator or AI thread inhabits, observes, or resumes work in relation to a Site, role, workflow, or operational locus.

It is not the adapter that presents it. A Windows Terminal profile, Komorebi window rule, YASB button, VS Code workspace, browser profile, local console, MCP facade, or web dashboard may embody an Operator Surface, but the surface is the governed interface identity: what it is for, what it is bound to, how it can be found again, and what authority it does not have.

Operator Surfaces were earned by inhabited work friction: recurring Narada role windows needed stable launch/focus identities, but API agents and MCP tools also needed a way to describe non-spatial inhabited work without pretending that every session is a terminal tab.

## Adjacent Concepts

| Concept | Definition | Authority posture |
| --- | --- | --- |
| `OperatorSurface` | Durable, addressable interface for inhabiting or observing a Site, role, workflow, or operational locus. | May present, focus, inspect, or request; never owns truth by itself. |
| `AgentRuntime` | Concrete running agent/tool process, such as Codex, Kimi, an MCP client, daemon worker, or API conversation executor. | May reason or execute sanctioned commands; gains no authority from being live. |
| `ControlChannel` | Communication path into or out of an `AgentRuntime`: terminal stdin/stdout, API thread, MCP tool call, HTTP route, mailbox, file drop, or console event. | Transports requests/results; does not admit consequences by transport alone. |
| `SessionBinding` | Durable continuity link binding a role, task, runtime, control channel, surface, and trace references for resume/recovery. | Preserves continuity; does not claim work or close evidence by existing. |

These concepts are related but must not collapse:

```text
OperatorSurface presents inhabited work.
AgentRuntime performs reasoning or command execution.
ControlChannel carries interaction.
SessionBinding preserves continuity.
Site authority admits consequence.
Trace substrate records what happened.
```

## Minimal Field Grammar

A v0 `OperatorSurface` declaration should be able to carry:

| Field | Meaning |
| --- | --- |
| `surface_id` | Stable local identifier such as `narada-proper` or `staccato-builder`. |
| `site_ref` | Site id or Site root the surface is about. |
| `role_binding` | Role intended for the surface, usually `architect` or `builder` when role-bound. |
| `embodiment_id` | Concrete embodiment that hosts or presents the surface. |
| `adapter_kind` | Presentation adapter such as `windows_terminal`, `komorebi_window`, `vscode_workspace`, `browser_profile`, `mcp_console`, or `http_console`. |
| `launch_identity` | Stable launch coordinate, for example a terminal profile name or URL. |
| `focus_identity` | Stable focus coordinate, for example window title, workspace id, URI, or process label. |
| `placement_hints` | Optional layout hints such as desktop, monitor, workspace, or tab group. |
| `recovery_posture` | How the surface participates in resume: `reopen`, `focus_if_present`, `read_only_projection`, or `manual`. |
| `authority_limits` | Explicit statement that the surface does not confer mutation authority, capability authority, review authority, or Operator authority. |

A v0 `AgentRuntime` declaration should be able to carry:

| Field | Meaning |
| --- | --- |
| `runtime_id` | Stable or observed runtime identifier. |
| `runtime_kind` | Tool/process/API kind such as `codex_cli`, `kimi_cli`, `mcp_client`, `daemon_worker`, or `api_agent`. |
| `principal_ref` | Principal identity used for task, inbox, or command evidence. |
| `site_ref` | Site whose law and authority boundaries scope the runtime. |
| `role_binding` | Intended role when applicable. |
| `control_channel_ref` | The channel through which the runtime is reached. |
| `authority_limits` | Explicit capabilities and non-capabilities of the runtime. |

A v0 `ControlChannel` declaration should be able to carry:

| Field | Meaning |
| --- | --- |
| `channel_id` | Stable local channel identifier. |
| `channel_kind` | `terminal`, `api_thread`, `mcp_stdio`, `http`, `mailbox`, `file_drop`, or `console_event`. |
| `endpoint_ref` | Opaque coordinate needed to reach or inspect the channel. |
| `direction` | `interactive`, `inbound`, `outbound`, or `bidirectional`. |
| `admission_posture` | Whether messages are inert, advisory, actionable, or mutating only through sanctioned commands. |

A v0 `SessionBinding` declaration should be able to carry:

| Field | Meaning |
| --- | --- |
| `binding_id` | Durable continuity identifier. |
| `site_ref` | Site the binding is scoped to. |
| `role_binding` | Role represented by the session. |
| `task_refs` | Current or recent task numbers when relevant. |
| `surface_ref` | Operator Surface used to inhabit or observe the session, if any. |
| `runtime_ref` | AgentRuntime used by the session, if any. |
| `control_channel_ref` | ControlChannel used for interaction. |
| `trace_refs` | Evidence, transcript, inbox, task, or command records needed for resume. |
| `continuity_posture` | `active`, `paused`, `recoverable`, `stale`, or `archived`. |

## Anti-Collapse Rules

- An Operator Surface is not a Site.
- An Operator Surface is not an authority locus.
- An Operator Surface is not an agent or runtime.
- An Operator Surface is not an effect capability.
- An AgentRuntime does not gain authority by being bound to an Operator Surface.
- A ControlChannel does not admit consequence merely because it transported an instruction.
- A SessionBinding does not claim work, close work, or prove evidence merely by preserving continuity.
- API conversations and MCP calls may have ControlChannels and SessionBindings without having a spatial Operator Surface.
- Terminal tabs and windows may be Operator Surface adapters without being the canonical trace substrate.
- Stable focus identity is ergonomic continuity, not proof that the correct authority locus was used.

## Relationship To Site Embodiments

Site `embodiments` declare where a Site is operationally present and how those presences relate to authority. Operator Surfaces live one layer above embodiments: they are addressable ways to inhabit, inspect, or recover work through an embodiment.

An embodiment can host many Operator Surfaces. An Operator Surface can present one Site, one role, one workflow, or a read-only aggregate view. Neither case creates another mutation authority.

```text
Site authority locus
  -> embodiment
  -> OperatorSurface
  -> ControlChannel
  -> AgentRuntime
  -> SessionBinding / Trace
```

The arrow is not authority inheritance. It is a topology of presentation, access, continuity, and evidence.

## Relationship To Resume Continuity

`narada resume` recovers inhabited work from durable traces. Operator Surfaces provide a possible focus or launch target for that recovery, but resume remains read-only.

Coherent recovery order:

```text
trace substrate
-> resume brief
-> optional Operator Surface focus/launch hint
-> optional AgentRuntime hydration hint
-> explicit governed command for any mutation
```

Opening or focusing a surface is not claiming work. Hydrating a runtime is not accepting evidence. Any task, inbox, publication, execution, or Site mutation must still cross its governed command surface.

## Relationship To Role-Specific Bootstrap

Architect and Builder thread bootstrap contracts describe the role grammar for a fresh AI thread. Operator Surfaces can make those roles spatially or operationally durable, for example a stable `narada-proper-architect` terminal profile or an MCP console scoped to a Project Site.

The role contract remains the authority-bearing instruction source. The surface is only an interface for inhabiting that contract.

## Relationship To MCP And API Agents

MCP and API agents may not have a visible window. They still have:

- an `AgentRuntime`,
- a `ControlChannel`,
- a `SessionBinding`,
- trace references,
- and Site authority boundaries.

This prevents terminal bias. The long-term model includes both spatial surfaces and non-spatial channels, while preserving one rule: authority is admitted by the Site's governed crossings, not by the interface shape.

## Relationship To Contextual Capability Projection

Operator Surface controls should be projections of canonical capability families, not direct mirrors of helper functions or implementation internals.

Use [`Contextual Capability Projection`](contextual-capability-projection.md) when deciding whether adjacent buttons are distinct capabilities or contextual labels/modes of one capability. The surface label must be backed by an operator-visible invariant: the work outcome the Operator expects, not merely a command exiting successfully.

Use [`Operator Surface Action Posture`](operator-surface-action-posture.md) when deciding which surface tier a valid control belongs in. Diagnostic tools, repair/recovery actions, intrusive platform mutations, and hidden/internal primitives should remain available through their governed diagnostic or recovery posture, not appear in primary work-action rows by default.

Use [`Visibility Domain Reconciliation`](visibility-domain-reconciliation.md) when an adapter has a managed object set but the host owns independent membership truth, such as Windows virtual desktop membership, display membership, browser profile membership, or process/session membership. Adapter state must be reconciled against that host truth before it is treated as current.

Use [`Runtime Identity Binding`](runtime-identity-binding.md) when a live runtime object must be related to a durable Site, role, surface, participant, or workflow identity. Handles such as HWNDs, process ids, session ids, tab ids, MCP client ids, or API thread ids are volatile substrate facts; titles, profiles, process metadata, and transcript labels are carrier evidence, not naming authority.

## Inspection Posture

The first coherent command posture is read-only inspection.

The current generic Narada proper CLI surface admits durable identity records and builds bounded label projections without requiring direct JSON edits:

```bash
narada operator-surface identity add <identity-name> --role <role> --agent-kind <kind> --site <site-id> --by <principal>
narada operator-surface labels build --site <site-id>
```

These commands write/read Site-local durable identity records. They do not bind HWNDs, process ids, terminal tabs, API threads, MCP clients, or other volatile runtime handles.

The runtime binding command surface exists as an authority-preserving deferral surface:

```bash
narada operator-surface bind-focused --identity <id>
narada operator-surface bind-focused --as self
narada operator-surface rebind --identity <id>
narada operator-surface unbind-focused
narada operator-surface bindings list
narada operator-surface bindings clean-stale
```

In Narada proper these commands either refuse unknown identities or return `status: "deferred"` with the required runtime locus. The actual volatile-handle mutation belongs to the User/PC/runtime Site that can observe the handle and admit the binding. `--as self` resolves from governed runtime context such as `NARADA_AGENT_ID` / `NARADA_PRINCIPAL_ID` or an unambiguous active roster assignment, so the Operator does not need to remember the exact identity string during inhabited work.

Any agent inhabiting an Operator Surface should attempt self-binding during bootstrap:

```bash
narada operator-surface bind-focused --as self
```

If the command returns a runtime-locus deferral, the agent must route the deferred binding to the owning User/PC/runtime Site. It must not infer HWNDs, process ids, terminal tabs, API thread ids, or MCP client ids from convenience metadata.

Future command names may be:

```bash
narada sites surface list <site-id-or-root>
narada sites surface show <site-id-or-root> <surface-id>
narada sites session-binding list <site-id-or-root>
narada sites session-binding show <site-id-or-root> <binding-id>
```

These commands should:

- read declared `operator_surfaces` and `session_bindings` from Site governance coordinates;
- disclose `site_id`, `site_root`, authority locus, embodiment id, surface id, role id, adapter kind, recovery posture, and authority limits;
- disclose runtime and channel identity only as bounded metadata;
- return `[]` for Sites without declarations rather than treating absence as failure;
- include output bounds such as `--limit`, compact human output, and JSON fields that avoid transcript-scale dumping;
- never print raw secrets, tokens, full credential paths, or opaque channel payloads by default;
- never launch, focus, write profile files, mutate session registries, claim work, or hydrate a runtime.

Inspection output is evidence of declared topology, not proof that a live window, process, API conversation, or channel currently exists.

## Materialization Posture

Materialization is a separate governed crossing. It must not happen as an implicit side effect of Site bootstrap, resume, doctor, or inspection.

Future command names may be:

```bash
narada sites surface materialize <site-id-or-root> <surface-id> --dry-run
narada sites surface materialize <site-id-or-root> <surface-id> --execute
narada sites session-binding record <site-id-or-root> --runtime <id> --channel <id> --surface <id> --execute
```

Materialization commands should:

- default to dry-run;
- require explicit `--execute` for adapter writes or session-binding mutation;
- classify the adapter side effect as filesystem, OS profile, window-manager, browser profile, MCP config, or external system mutation;
- route non-test command execution through CEIZ or an equivalent governed execution boundary;
- write mutation evidence and read back the adapter artifact or registry record;
- refuse raw secret embedding and reference capabilities through governed capability records instead;
- distinguish adapter materialization from Site authority mutation.

Examples:

| Adapter | Materialization effect | Authority posture |
| --- | --- | --- |
| Windows Terminal profile | Write or update terminal profile/settings entry. | OS/user-profile mutation; dry-run first, `--execute` required. |
| Komorebi rule | Write/focus window-manager rule. | External adapter mutation; route through governed command execution. |
| YASB button | Write UI launcher config. | Operator convenience mutation; not Site authority. |
| VS Code workspace | Create or update workspace file. | Filesystem artifact; bounded, evidence-backed. |
| Browser profile/tab group | Create profile or launch/focus URL. | External UI mutation; no credential material in config. |
| MCP console | Write MCP facade config or launch command. | Facade/channel setup; Site authority remains target Site. |
| API conversation | Record session binding to transcript/channel ids. | Trace continuity only; no spatial surface required. |

Adapter materializers and live session registries are deferred until a Builder is explicitly assigned implementation work for them. Until then, declarations remain orientation and recovery metadata.

## Summary

Operator Surface makes inhabited work addressable without making interface convenience into authority.

```text
Surface helps Narada be found.
Runtime helps Narada think or act.
Channel carries interaction.
Binding preserves continuity.
Site authority admits consequence.
Trace substrate remembers.
```
