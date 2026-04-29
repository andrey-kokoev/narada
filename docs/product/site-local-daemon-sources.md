# Site-Local Daemon Sources

Site-local daemon sources admit observations from the Site's own runtime locus. They are peers of mailbox, timer, webhook, and filesystem sources, but they are not mailbox projections and must not be forced through mailbox-shaped read models.

This document defines the authority posture for Project and Site-local daemons that observe heartbeat, inbox-drop, or filesystem surfaces.

## Current Source Inventory

| Source family | Current role | Authority posture |
| --- | --- | --- |
| `ExchangeSource` | Pulls Microsoft Graph mailbox deltas. | External remote source. Payloads are normalized into mailbox events and may update mailbox projections. |
| `TimerSource` | Emits deterministic `timer.tick` source records. | Local scheduling/liveness source. It creates facts for context formation; it is not a mailbox event. |
| `WebhookSource` | Pulls queued `webhook.received` records. | External intake source. Arrival is inert until policy admits or promotes it. |
| `FilesystemSource` | Pulls queued `filesystem.change` records. | Local filesystem observation source. It records file observations; it does not by itself decide meaning. |
| No-op fallback source | Emits no records for unsupported source config. | Liveness placeholder only. It must not be treated as useful Site-local work. |

The existing neutral source contract is already broad enough: `SourceRecord.payload` is opaque and `sourceRecordToFact` maps `timer.tick`, `webhook.received`, and `filesystem.change` into non-mail facts. The incoherence is treating every daemon record as a `NormalizedEvent` for `applyEvent`, which is mailbox projector logic.

## Source Families

Timer heartbeat and inbox/filesystem observation are separate source families.

| Family | Fact/envelope shape | Meaning |
| --- | --- | --- |
| Timer heartbeat | `timer.tick` fact | The daemon woke at a deterministic slot. This may trigger scheduled evaluation, health checks, or polling, but carries no content by itself. |
| Site inbox-drop observation | `file_drop` inbox envelope or `filesystem.change` fact followed by governed inbox admission | A local file-drop candidate arrived. The candidate is inert until admitted into Canonical Inbox and later promoted. |
| Site filesystem observation | `filesystem.change` fact | A watched path changed. The observation may open work, but must not mutate tasks, knowledge, or Site config directly. |

These families may be executed in the same daemon cycle. They must remain distinct because their admissibility regimes are different: a timer tick proves time-slot occurrence, while an inbox-drop/file observation proves arrival of local material that still needs classification and admission.

## Admission Boundary

The canonical path for Site-local daemon observations is:

```text
Site-local source observation
  -> durable SourceRecord / Fact or inert inbox envelope
  -> governed admission / classification
  -> governed promotion to task, operator action, knowledge candidate, Site config change, or archive
  -> execution only through the target zone's own lifecycle
```

Forbidden shortcuts:

| Shortcut | Reason |
| --- | --- |
| Daemon observes `.ai/inbox-drop` and directly creates a task. | File arrival is not task authority; it must cross Canonical Inbox admission first. |
| Timer tick is projected through mailbox `applyEvent`. | Timer payload has no `event_kind`, mailbox ID, message ID, or mailbox read-model semantics. |
| Filesystem change mutates Site config directly. | Filesystem observation is evidence of change, not authorization to change governed state. |
| No-op fallback source is reported as a useful Site-local daemon source. | It proves only process presence, not observation, admission, or work creation. |

For file-drop intake, the daemon should reuse the same semantics as `narada inbox ingest-files`: dry observation first, explicit admission when the governing context authorizes it, and portable envelope evidence under `.ai/inbox-envelopes`.

## Projection Posture

Mailbox projection is one projector, not the universal projector.

| Fact family | Projection posture |
| --- | --- |
| `mail.*` | May update mailbox messages, blobs, tombstones, and views. |
| `timer.tick` | Should be stored as a fact and routed to context formation; it does not update mailbox projections. |
| `filesystem.change` | Should be stored as a fact and routed to context formation or inbox admission; it does not update mailbox projections. |
| `webhook.received` | Should be stored as a fact and routed to context formation or inbox admission; it does not update mailbox projections. |

A daemon runner must select a projector by fact/source family or use a neutral fact-only projector for non-mail records. Casting every payload to `NormalizedEvent` is a zone collapse.

## Authority Locus

A Site-local daemon acts for the Site whose runtime locus it inhabits. Narada proper may define the doctrine, CLI, and reusable code, but it must not mutate another Site's inbox, tasks, or config merely because Narada proper observed the friction.

When a Project Site, PC Site, client Site, data Site, or ELT Site observes local material, the mutation authority remains in that Site. Cross-Site transfer requires an explicit governed crossing, normally through Canonical Inbox, publication, or a Site relation signal.

## Non-Goals And Residuals

This posture does not implement a new daemon adapter. Implementation belongs to the follow-up tasks that wire non-mail daemon records through fact admission and inbox-drop handling.

This posture does not mutate the `thoughts` Site or any other external Site.

This posture does not make the no-op fallback source sufficient. If a Site needs useful daemon work, it needs an explicit source family and admission path.

Open residuals:

| Residual | Required direction |
| --- | --- |
| Daemon runner currently applies mailbox projector logic to non-mail source payloads. | Route non-mail source records through fact admission without mailbox projection. |
| Site-local inbox-drop observation needs a daemon-safe intake path. | Reuse Canonical Inbox file-drop admission semantics and portable envelope evidence. |
| Unsupported source config silently falls back to no-op. | Report unsupported source posture clearly so operators do not mistake liveness for useful observation. |
