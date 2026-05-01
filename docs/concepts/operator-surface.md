# Operator Surface

An **Operator Surface** is a durable, addressable interface through which an Operator or AI thread inhabits, observes, or resumes work in relation to a Site, role, workflow, or operational locus.

It is not the adapter that presents it. A Windows Terminal profile, Komorebi window rule, YASB button, VS Code workspace, browser profile, local console, MCP facade, or web dashboard may embody an Operator Surface, but the surface is the governed interface identity: what it is for, what it is bound to, how it can be found again, and what authority it does not have.

Operator Surfaces were earned by inhabited work friction: recurring Narada role windows needed stable launch/focus identities, but API agents and MCP tools also needed a way to describe non-spatial inhabited work without pretending that every session is a terminal tab.

## Current Substrate Evidence

The most intensively tested spatial Operator Surface substrate is Windows 11 with WSL, Windows Terminal, PowerShell carrier scripts, local Git, Node tooling, and paired Windows User/PC Site coordination. That is the evidence-backed path for stable labels, focused input, runtime binding, PC-locus messaging, and multi-agent inhabited ergonomics.

This is an evidence boundary, not a product identity claim. Narada's core CLI and Site model are not Windows-only, and API/MCP/control-channel surfaces may be governed without a Windows terminal. macOS and Linux Operator Surface adapters require their own read-back evidence before documentation or UI should imply parity with the Windows 11 path.

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
| `input_capabilities` | Declared input abilities such as `focus`, `type_text`, `submit`, `clear_pending_input`, and `recover_surface_state`. |
| `submit_strategy` | Submission posture: `type_only`, `operator_confirmed_submit`, or `known_surface_submit`. |
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

## Agent Activity Projection

Operator Surface Agent activity is a projection for inhabited ergonomics. It is not task lifecycle authority, inbox authority, review authority, or Operator Surface message authority. It tells an Operator what an inhabited agent appears to be doing so labels, overlays, workboards, and launchers can avoid false idleness or noisy default labels.

The canonical initial activity family is:

| Activity | Meaning | Operator visibility |
| --- | --- | --- |
| `idle` | No current evidence of active task, review, inbox, message, or blocker work. | Hidden/default; do not create label noise. |
| `executing` | Agent appears to be working an admitted task or command. | Visible. |
| `awaiting_review` | Agent has reported or completed work and is waiting for review/admission/closure. | Visible. |
| `reviewing` | Agent appears to be performing review work for another task or handoff. | Visible. |
| `blocked` | Agent is blocked by dependency, capability, law receipt, lifecycle, or authority posture. | Visible. |
| `processing_inbox` | Agent appears to be handling an inbox envelope or intake item. | Visible. |
| `messaging` | Agent appears to be sending, receiving, or waiting on Operator Surface or directed-message work. | Visible. |
| `unknown` | Evidence is absent, unbound, ambiguous, or insufficient. | Visible only when needed for repair or routing. |
| `stale_evidence` | Evidence exists but freshness has expired or the binding is stale. | Visible as stale/repair posture. |

Activity source evidence is a bounded projection bundle, usually including:

| Source evidence | Used for | Authority posture |
| --- | --- | --- |
| Operator Surface binding state | Whether the role surface is addressable and fresh enough to route messages. | Addressability projection only. |
| Roster projection | Current task pointer, work status, and last activity timestamp. | Compatibility projection; never lifecycle truth. |
| SQLite task lifecycle | Whether the current task is claimed, in review, closed, or blocked. | Lifecycle authority for the task, but only an input to activity projection. |
| Inbox envelope handling | Whether the role is processing intake. | Inbox authority for envelope status, not agent activity truth by itself. |
| Operator Surface delivery queue | Whether the role is involved in directed messaging. | Message delivery evidence, not task status. |

Freshness expectations:

- Activity projections should expose `source_evidence` and freshness posture when machine-readable.
- `idle` is the unit/default state and should be suppressed in overlays unless the Operator asked for full diagnostic detail.
- `unknown` and `stale_evidence` should point to repair or rebind guidance, not pretend to know what the agent is doing.
- No adapter may use activity projection to claim, release, close, review, or admit task evidence.

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

Visible labels and addressable runtime bindings are separate. A window title such as `narada.builder` may be useful label evidence, but it does not prove that Narada can send input to that surface. Status surfaces should report this as `labeled_unbound` when label evidence exists without an active runtime binding. The repair path is to bind the durable identity in the owning runtime locus:

```bash
narada operator-surface bind-focused --identity <identity> --runtime-locus <pc-or-user-site>
```

Sending input must fail closed until an active binding exists. The role remains metadata on an admitted identity; Narada must not infer Architect, Builder, or Observer authority solely from a title string.

Use [`Capability Announcement`](capability-announcement.md) when a Site needs to publish that an Operator Surface-adjacent capability exists. Announcements are discovery metadata with entrypoints, prerequisites, evidence, and constraints; they do not grant execution authority or substitute for runtime identity binding.

## Voice Transcription

Voice input has two distinct postures:

| Posture | Authority |
| --- | --- |
| Mic-only capture | Local diagnostic capture. It must not require a remote transcription credential and must not send audio off-locus. |
| Remote transcription | Capability-bearing effect. Audio may be sent only after an active `voice.transcription.remote` capability grant admits `remote_audio_transcribe`. |

Remote transcription credentials must be references, not raw tokens. Supported references include `env:<VAR>` for local runtime material and `credential-manager:<target>` for Windows Credential Manager. Narada proper may check whether an env reference is present, but Windows Credential Manager access belongs to the owning Windows Site adapter; Narada proper records the reference and extension requirement, not the secret.

The readiness surface is:

```bash
narada operator-surface voice transcription-check \
  --site <site-id> \
  --principal <principal> \
  --capability-grant-id <grant-id>
```

For debugging microphone capture without remote transcription:

```bash
narada operator-surface voice transcription-check \
  --site <site-id> \
  --principal <principal> \
  --mic-only
```

The command intentionally separates microphone availability from transcription credential availability. Output must not include raw tokens in config, logs, traces, recognition artifacts, or task evidence.

## Inspection Posture

The first coherent command posture is read-only inspection.

The current generic Narada proper CLI surface admits durable identity records and builds bounded label projections without requiring direct JSON edits:

```bash
narada operator-surface agent instantiate --site <site-id-or-root> --role architect --agent-kind codex_cli --by <principal>
narada operator-surface identity add <identity-name> --role <role> --agent-kind <kind> --site <site-id> --by <principal>
narada operator-surface labels build --site <site-id>
```

`agent instantiate` is the canonical high-level Operator path. It admits or reuses the durable role identity, emits bounded bootstrap/copy text, and includes `narada operator-surface bind-focused --as self`. The lower-level `identity add` and `labels build` commands remain primitives.

Operator-surface identity metadata may include optional `affinity_color` hints for the Site and role projection lines. The supported command flags are `--site-affinity-color <color>` and `--role-affinity-color <color>` on the identity-admission and agent-instantiation paths. These colors are ergonomic recognition hints only: they are not identity proof, authority boundaries, capability grants, review evidence, or runtime-handle binding.

Operator-surface identity metadata may also include input posture:

| Capability | Meaning | Authority posture |
| --- | --- | --- |
| `focus` | Bring or identify the surface. | Ergonomic only; not proof of correct locus. |
| `type_text` | Type inert text into the surface. | Allowed only as input preparation unless a later crossing admits execution. |
| `submit` | Send the pending input through the surface's channel. | Disabled by default; requires an admitted submit strategy. |
| `clear_pending_input` | Clear staged text before retry/recovery. | Recovery convenience; must not destroy authoritative traces. |
| `recover_surface_state` | Reconcile visible/current surface state. | Observation/recovery only. |

Submit strategies are:

| Strategy | Meaning |
| --- | --- |
| `type_only` | Default. Automation may focus/type but must not submit. |
| `operator_confirmed_submit` | Automation may submit only after explicit Operator confirmation for that pending input. |
| `known_surface_submit` | Surface-specific evidence admits submit for this exact surface/channel/posture. |

Default automation is always `type_only`. A surface may expose `submit` only when its identity or surface declaration carries an admitted submit strategy. Repeated blind submit-chord probing against live agent surfaces is forbidden; the bounded projection sets blind submit probe limit to zero unless a surface-specific adapter later admits a safer recovery protocol.

Projection precedence is:

1. Explicit projection style owned by the consuming surface may override local rendering only when that surface declares the override as presentation metadata.
2. The Site line uses Site `affinity_color` when present.
3. The role line uses role `affinity_color` when present.
4. The agent/name line remains neutral unless a separate governed rule admits name coloring.

These commands write/read Site-local durable identity records. They do not bind HWNDs, process ids, terminal tabs, API threads, MCP clients, or other volatile runtime handles.

`operator-surface labels build` is the carrier projection boundary for window labels and Windows focused-window binding helpers. The durable Site identity field is `identity_id`; the Windows carrier-facing `identity_name` field is generated from that value and is not a second identity authority. If an identity registry cannot project `identity_name`, label build fails closed with repair guidance to use `narada operator-surface identity add` or `identity rename` rather than editing carrier JSON by hand.

Architect-loop inspection must use the schema-stable compact surface instead of ad hoc projections against raw carrier JSON:

```bash
narada operator-surface inspect compact --site <site-id-or-root> --format json
```

The compact inspect output joins durable identities, projected labels, runtime binding posture, and visible-label carrier evidence into one bounded schema. If a carrier wrapper changes shape, compact inspect fails once with `operator_surface_visible_labels_schema_mismatch` and repair guidance; callers must not repeatedly `Select-Object` guessed properties such as `labels` from unknown PowerShell output.

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

The input front door is:

```bash
narada operator-surface send --identity <id> --text <text> --dry-run
narada operator-surface send --identity <id> --text <text> --execute
```

`send` validates an admitted durable identity and a Site/runtime-locus binding before accepting input. Dry-run returns the resolved runtime locus, handle, submit strategy, and text digest without mutation. Execute records bounded send evidence for the owning runtime locus; it does not hardcode Windows paths or treat Narada proper as the owner of volatile handles. Secret-like text is refused and must route through capability consent and secret-reference paths.

Typed operator-surface messages mechanically carry sender identity in delivered text. By default, `send` renders:

```text
From: <resolved-sender-identity>

<message text>
```

The event artifact records the same `sender_identity`, `resolved_sender_identity`, `rendered_text_digest`, and `input_posture`. Raw input/keystroke delivery may omit the visible sender header only through explicit raw posture:

```bash
narada operator-surface send --to <id> --from <sender> --text <raw-input> --raw-input --execute
```

Raw input is for carrier control text or keystroke-like input. It must not be used for typed messages, review requests, completion claims, CAPAs, handoffs, or questions where recipient attribution matters. Sender resolution from a live foreground binding remains runtime-locus work; Narada proper uses the explicit `--from` value or the bounded `operator` fallback until a User/PC adapter supplies foreground-binding evidence.

## Governed Message Queue Posture

Operator-surface messages are governed records before they are visible text. A message is not task lifecycle truth, review truth, closure truth, or command execution truth.

Canonical crossing:

```text
message_intent -> addressed_message -> delivery_attempt -> delivered_to_surface
  -> admitted_by_recipient -> acted | replied | reported -> reconciled
```

Required message record fields:

| Field | Meaning |
| --- | --- |
| `message_id` | Durable message identity. |
| `sender_identity` | Site-qualified sender identity or principal. |
| `recipient_identity` | Site-qualified recipient identity, role address, or resolved agent identity. |
| `site_plane` | Site or plane in which the address is meaningful. |
| `kind` | `nudge`, `note`, `handoff`, `review_request`, `capa`, `question`, `command_intent`, or `completion_claim`. |
| `expected_response_posture` | `none`, `ack`, `reply`, `report`, `review`, or `task_lifecycle_action`. |
| `delivery_status` | `queued`, `awaiting_visible_surface`, `delivery_attempted`, `delivered_to_surface`, `timed_out`, or `fallback_routed`. |
| `intake_status` | `unseen`, `admitted_by_recipient`, `rejected_by_recipient`, `acted`, `replied`, `reported`, or `reconciled`. |
| `evidence_refs` | Links to delivery evidence, reply, report, review, task evidence, or fallback inbox envelope. |
| `reply_to` | Source message id when this message is a reply. |

Authority rules:

- Delivery is PC/runtime-locus opportunity. It proves only that text or a notification reached a carrier surface.
- Recipient admission is agent/Site-locus intake. It proves the recipient accepted the message into its duty loop.
- Acting, reporting, reviewing, closing, or confirming must cross the existing task, evidence, review, command, inbox, or publication surfaces.
- A `completion_claim` message must route through `narada task reconcile claim`; it must not set criteria, report, review, close, or confirm state.
- A `review_request` message may direct attention to `narada task review`, but it is not a review artifact.
- If visible delivery fails, fallback routing must create another governed message or inbox artifact rather than dropping the original.

Recipient intake path:

```bash
narada role-loop next --agent <recipient> --format json
narada work-next --agent <recipient> --peek --format json
```

These surfaces are the current compact intake path. A future `operator-surface message work-next` command may specialize message intake, but it must remain a facade over the governed message record and must not become a parallel task lifecycle.

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
