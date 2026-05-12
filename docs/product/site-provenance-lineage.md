# Site Provenance Lineage

Site provenance lineage is the durable continuity substrate for Site lifecycle transformations and cross-Site signal influence.

It records crossings over Site authority objects, not raw folder relationships. For the Site authority object / realization / projection factorization, see [`site-factorization.md`](site-factorization.md).

Its canonical shape is:

```text
append-only lineage events -> graph projection for inspection
```

The event log is the authority-bearing record. Chain, DAG, and general graph views are projections over that log.

Durable current-state relation evidence is tracked by the Site relation ledger. See [`site-relation-ledger.md`](site-relation-ledger.md). Relation records may reference lineage events, but they do not replace the append-only lineage event log.

## Why It Exists

Site clone, fork, split, absorb, migrate, re-instantiate, archive, pub/sub, knowledge admission, and tool admission all create relationships between Sites. Those relationships are not all authority relationships.

Without lineage, Narada risks collapsing:

- copy into authority;
- subscription into ownership;
- influence into admission;
- template application into proof;
- migration into raw folder movement;
- absorption into undocumented memory loss.

## Required Event Fields

Each lineage event must carry:

| Field | Meaning |
| --- | --- |
| `event_id` | Stable event identity. |
| `event_type` | Vocabulary item such as `site.cloned` or `site.authority_transferred`. |
| `source_site_ref` | Source Site or originating locus. |
| `target_site_ref` | Target Site when applicable. |
| `principal` | Operator, agent, daemon, or charter runner that caused or recorded the event. |
| `authority_effect` | Whether authority transfers, remains, is refused, is local-only, or is influence-only. |
| `evidence_refs` | Task, inbox, command, verification, review, or trace references. |
| `occurred_at` | Event timestamp. |
| `rollback_or_residual_posture` | How to reverse, retire, or retain unresolved linkage. |

Authority-relevant lineage events should eventually carry verifiable envelope trust evidence for authoring, forwarding, and admission provenance. A valid signature is evidence about origin or relay; it is not authority to mutate the receiving Site.

## Event Vocabulary

| Event | Edge Type | Authority Effect |
| --- | --- | --- |
| `site.created` | origin | establishes Site authority |
| `site.cloned` | clone | preserves, routes, or migrates authority |
| `site.forked` | fork | creates independent authority lineage |
| `site.split` | split | partial transfer or residual linkage |
| `site.absorbed` | absorption | admission without implicit ownership |
| `site.migrated` | migration | authority transfer |
| `site.reinstantiated` | re-instantiation | reconstruction proof |
| `site.archived` | retirement | retired non-authority posture |
| `site.authority_transferred` | authority | authority transfer |
| `site.authority_refused` | authority | authority refusal |
| `site.subscribed` | subscription | influence only |
| `site.published` | publication | influence only |
| `site.knowledge_admitted` | knowledge admission | local admission |
| `site.tool_admitted` | tool admission | local admission |
| `site.template_applied` | template | template application |

## Authority Separation

Lineage edges must not smear authority:

- `subscription` and `publication` edges are influence-only;
- `knowledge_admitted` and `tool_admitted` are local admissions by the receiving Site;
- `authority_transferred` is the explicit event for mutation-authority movement;
- `authority_refused` preserves rejected or blocked authority attempts as evidence;
- `template_applied` is not proof by itself; re-instantiation evidence is still required.

For Site pub/sub doctrine, see [`site-pubsub-signal-exchange.md`](site-pubsub-signal-exchange.md).

## CLI Surface

The initial CLI surface is read-only:

```bash
narada sites lineage events
narada sites relation list
narada sites relation validate
```

The lineage surface exposes the vocabulary and required fields. The greenfield
`narada sites create` skeleton path writes a local `site.created` origin event
under `.narada/lineage/events/` and projects that event ref into local Site
config/seed records. The relation surface records evidence edges without
changing Site authority. Future mutating Site lifecycle and pub/sub commands
must write lineage events before changing authority-bearing Site state.
