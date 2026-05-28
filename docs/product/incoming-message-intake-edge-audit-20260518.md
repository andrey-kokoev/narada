# Incoming Message Intake Edge Audit - 2026-05-18

This audit classifies current incoming message and observation channels under
the [`IncomingMessageIntakeEdge`](incoming-message-intake-edge.md) model.

The audit records current posture only. It does not publish pending inbox
artifacts, admit remote candidates, create tasks from residuals, or treat local
operational warnings as semantic failures.

## Current Local Inbox Doctor Findings

`narada inbox doctor --format json` from `D:\code\narada` reported:

| Finding | Current value | Interpretation |
| --- | --- | --- |
| Inbox DB | accessible/openable | Local Canonical Inbox runtime substrate is usable. |
| SQLite binding | loaded | CLI can use the local inbox database. |
| CLI build | present at `packages\layers\cli\dist\main.js` | Canonical inbox commands are available. |
| Runtime posture | `unknown_or_external_entrypoint` | Operational embodiment note, not intake doctrine failure. |
| Message routing authority | `configured=false`, default `allow_when_unconfigured` | Local legacy submission is admitted; this does not prove cross-Site delegated routing. |
| Publication | `publication_pending`, `uncommitted_envelope_artifacts_count=200` | Portable inbox artifacts exist locally and need `narada inbox publish --execute` for publication. This is visibility posture, not semantic authority. |
| Upstream | `head_matches_remote=true`, `unpushed_commit_count=0` | No unpushed commit backlog was reported. |

## Audit Table

| Incoming surface | Edge reading | Source owner | Target authority | Current artifact | Admission boundary | Lifecycle status | Capability/trust posture | Current implementation posture | Known gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Exchange mailbox | `exchange_mailbox_source_to_mail_facts` | External Microsoft Graph / configured mailbox operation | SourceRecord/Fact, then mailbox policy/evaluation and mailbox projections | `ExchangeSource` deltas normalized into mail facts/events and mailbox read models | Source read and fact admission first; policy may later produce recommendations/intents | `receiving` where mailbox operation is configured and sync succeeds; not proven by this audit for every Site | Graph credential/capability posture is operation-specific; mailbox sync does not imply send/effect authority | Implemented in `ExchangeSource` and mailbox vertical/control-plane code | No first-class edge record/doctor state; mailbox readiness remains separate from source reachability and effect readiness |
| Human file drop / leave-message file path | `site_inbox_drop_to_canonical_inbox` | Local Site/user filesystem authority | Canonical Inbox, with ledger for rejected/deferred candidates | `.ai/inbox-drop` candidate; admitted `.ai/inbox-envelopes/*.json`; optional `.ai/admission-rejection-ledger.json` | `narada inbox ingest-files --from <dir> --admit --by <principal>` | `receiving` for CLI-supported file-drop admission; daemon observation path may remain fact-only | Local filesystem trust plus principal admission; shell quoting avoided by file body | Implemented for CLI file-drop intake; daemon observation documented | No unified edge health row; rejected dry-run candidates are expected to migrate incrementally to ledger records |
| CLI inbox submit | `cli_to_local_canonical_inbox` | Local CLI caller/principal | Canonical Inbox | `.ai/inbox.db` row plus `.ai/inbox-envelopes/*.json` artifact and mutation evidence | `narada inbox submit` / `submit-observation` routing decision | `receiving`; doctor confirms local runtime usable | `message_routing_authority` is unconfigured, so legacy local allow posture applies; direct target authority only | Implemented and used repeatedly | Publication pending: 200 uncommitted envelope artifacts; no configured routing matrix |
| MCP inbox submit | `mcp_to_canonical_inbox` | MCP facade caller/carrier session | Canonical Inbox | Same envelope artifacts as CLI when target is local/source Site | MCP tool delegates to CLI/routing authority | `receiving` for local source-Site submission; cross-Site mutation refused in v1 fabric proof | Local submissions follow message routing authority; cross-Site requires capability-governed route | Implemented for local inbox tools; cross-Site target inspection exists | Cross-Site `canonical_inbox_cross_site_submission` capability path remains missing/refused in current fabric proof |
| Hosted registry message candidate | `site_registry_message_to_remote_candidate_exchange` | Site Registry / Cloudflare hosted surface | Remote Candidate Exchange first; target Site Canonical Inbox or ledger only after local decision | `narada.remote_candidate.message.v0`, receipt, pending/detail/finalize responses; compatibility `site_communication.message_candidate.v0` | Remote preservation is candidate-only; target Site finalization reports local decision evidence | `configured` to `receiving` in code/tests; live deployment/capability posture is Site-specific | Submit/poll/finalize/admin tokens or capability refs; raw secrets excluded | Implemented in `packages/site-registry-cloudflare` routes and tests; documented as compatibility/generic remote candidate | No local target admission automation should be inferred; live route/capability/readiness varies by deployment |
| Webhook source | `webhook_to_source_record_fact` | External webhook sender and local daemon/runtime queue | SourceRecord/Fact, later policy/inbox/ledger if admitted | `webhook.received` source record/fact | Source observation first; policy maps to consequence | `configured`/implemented source family; receiving depends on runtime config | Webhook validation/trust is source-specific; arrival is inert | Implemented in control-plane/daemon source code | No generic edge health record; mapping from webhook fact to inbox/ledger remains policy-specific |
| Site pub/sub signal | `pubsub_signal_to_site_intake` | Publishing Site / subscription relation | Canonical Inbox or Remote Candidate Exchange, with local ledger decisions | Doctrine-level typed inert signal | Subscription delivery only; receiving Site admits locally | `declared` / doctrine-only | Trust/signature/freshness expected but not implemented as a general route | Doctrine-only in `site-pubsub-signal-exchange.md` | Needs concrete route, storage, trust verification, doctor/preflight, and admission mapping |
| Agent report | `agent_report_to_canonical_inbox` | Agent/carrier/principal producing report | Canonical Inbox when submitted as intake; task lifecycle when report is task-bound | Inbox envelope with `source.kind=agent_report`, or WorkResultReport for task lifecycle | Inbox submission or task lifecycle report command | `receiving` for Canonical Inbox and task report surfaces | Authority level usually `agent_reported`; local admission/promotion still required | Implemented through `narada inbox submit(-observation)` and task lifecycle report paths | Ambiguity remains between conversational report, inbox observation, and task report unless source/ref and target authority are explicit |
| System observation | `system_observation_to_canonical_inbox_or_fact` | Local diagnostic, doctor, daemon, or runtime observation | Canonical Inbox or SourceRecord/Fact | Inbox envelope with `source.kind=system_observation`, diagnostic payload, or fact | Submission/admission command or source fact admission | `receiving` for inbox source kind; fact path is implemented for several source families | `authority_level=system_observed` when observed locally; still inert until promoted | Implemented as inbox source kind and source/fact families | Needs edge-specific health/provenance where observations come from daemons or external runtime surfaces |
| Site-local daemon source | `daemon_source_to_source_record_fact_or_inbox` | Site-local daemon/runtime locus | SourceRecord/Fact first; Canonical Inbox after governed file-drop admission | `timer.tick`, `filesystem.change`, `webhook.received`, or no-op source records | Daemon observes; `narada inbox ingest-files --admit` or policy admits consequence | `configured` to `receiving` for implemented source families; no-op is liveness only | Runtime-local trust; daemon authority belongs to owning Site | Implemented source families: TimerSource, InboxDropSource, WebhookSource, FilesystemSource; no-op fallback exists | Existing doctrine warns against projecting all daemon records through mailbox logic; no unified edge lifecycle surface yet |
| External leave-message / hosted communication form | `external_message_to_remote_candidate_or_target_inbox` | Operator/visitor/chat surface or hosted registry UI | Remote Candidate Exchange, then target Canonical Inbox/ledger after local decision | Site Communication `message_candidate` compatibility schema or remote candidate message/receipt | Hosted receipt only; target Site local admission required | `declared`/compatibility implemented depending on host route | Submit/read/finalize capability and trust verification required; chat requires operator-confirmed send unless delegated-send is admitted | Documented in Site Communication Surface; hosted routes overlap Remote Candidate Exchange implementation | Must not be treated as target Site inbox admission; delegated-send and live transport readiness are residuals |

## Implemented Versus Doctrine-Only

Implemented or compatibility-implemented:

- CLI Canonical Inbox submission.
- MCP local Canonical Inbox submission.
- Human file-drop intake through Canonical Inbox CLI.
- Agent report and system observation as Canonical Inbox source kinds.
- Exchange mailbox source/fact/projection path.
- Webhook, timer, inbox-drop, and filesystem source families.
- Hosted remote-candidate/message routes in Site Registry Cloudflare code/tests.
- Site Communication `message_candidate` as compatibility schema over remote-candidate semantics.

Doctrine-only or not yet generally materialized:

- General Site pub/sub transport, storage, trust verification, and admission commands.
- First-class `IncomingMessageIntakeEdge` registry/doctor/readiness surface.
- General edge lifecycle state machine in CLI output.
- Cross-Site MCP inbox submission with admitted `canonical_inbox_cross_site_submission` capability.
- Unified ledger integration for all rejected/deferred intake candidates.

## Operational Incoherencies Without Semantic Overclaim

The current Narada proper clone has operational visibility work pending:

- `message_routing_authority` is not configured. Local legacy direct submission is admitted, but this does not prove delegated cross-Site routing or reusable MCP submission capability.
- `narada inbox doctor` reports 200 uncommitted inbox envelope artifacts. This means portable inbox visibility is publication-pending, not that the inbox substrate or intake model is invalid.
- Runtime posture is `unknown_or_external_entrypoint` because the active CLI entrypoint is under `node_modules`; the expected repo dist entrypoint exists. This is command embodiment posture, not a semantic intake-edge defect.

## Residuals

Specific follow-up candidates:

| Residual | Follow-up direction |
| --- | --- |
| No first-class edge registry/read model | Specify a read-only `incoming-message intake-edge list/show/doctor` or equivalent product surface before implementation. |
| Cross-Site MCP inbox submission refuses mutation | Add or repair capability-governed `canonical_inbox_cross_site_submission` route if an operating case requires reusable delegated submission. |
| Pub/sub remains doctrine-only | Admit a concrete pub/sub transport and receiving admission task only when a Site pair needs it. |
| Ledger integration is partial | Add adapter-specific ledger writes for rejected/deferred file-drop, remote candidate, webhook, and mailbox candidates incrementally. |
| Hosted message routes are compatibility/generic remote-candidate mix | Keep compatibility routes, but expose remote-candidate semantics consistently in docs, fixtures, and route responses. |
| Source family edge health is scattered | Teach future doctor/readiness output to report source owner, target authority, last arrival, artifact id, and degraded/suspended reasons without creating a new message queue. |
