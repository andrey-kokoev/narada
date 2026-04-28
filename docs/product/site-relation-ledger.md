# Site Relation Ledger

The Site relation ledger is the durable evidence surface for relationships between Narada Sites.

It records edges such as absorption, reverse absorption, references, routing, subscription, and publication without moving mutation authority or editing Site config.

## Why It Exists

Site lifecycle work often needs to say "these Sites now relate" before a mutating lifecycle operator exists.

Without a ledger, agents tend to encode relation state by manually editing config, README files, or AGENTS.md. That collapses:

- relation evidence into Site config;
- graph projection into authority;
- absorption into ownership;
- reciprocal references into unvalidated convention.

## Authority Rule

A relation record is evidence, not mutation authority.

`narada sites relation record` must report:

- `authority_moved: false`;
- `config_mutated: false`;
- a durable `relation_id`;
- explicit `authority_effect`.

Authority-moving lifecycle operators, when they exist, must consume relation records and lineage events. They must not treat a relation record itself as permission to move authority.

## Record Shape

Each relation record carries:

| Field | Meaning |
| --- | --- |
| `relation_id` | Stable relation identity. |
| `relation_kind` | `absorbed`, `absorbed_by`, `references`, `routes_to`, `subscribes_to`, or `publishes_to`. |
| `source_site_ref` | Source Site or locus. |
| `target_site_ref` | Target Site or locus. |
| `authority_effect` | Authority posture, such as `admission_without_implicit_ownership` or `influence_only`. |
| `admitted_material` | Material admitted or referenced by the relation. |
| `evidence_refs` | Inbox, task, command, verification, or trace evidence. |
| `lineage_event_refs` | Site provenance lineage event references. |
| `reciprocal_required` | Whether a reverse active relation must exist. |
| `reciprocal_relation_id` | Optional explicit reverse relation id. |
| `status` | `active`, `superseded`, or `rejected`. |

## CLI Surface

```bash
narada sites relation record \
  --kind absorbed \
  --source-site staccato-service \
  --target-site narada-proper \
  --admitted-material docs,cli-pattern \
  --evidence-ref inbox:env_c929ffef-534e-4bcb-9f43-beee7c26be62 \
  --lineage-event-ref lineage:site.absorbed:001 \
  --reciprocal-required \
  --by architect

narada sites relation list
narada sites relation validate
narada sites relation explain <relation-id>
```

`validate` fails when a relation requiring reciprocal evidence lacks an active reverse relation.

## Relationship To Site Lifecycle

`narada sites lifecycle preflight` names the transformation grammar and required artifacts.

`narada sites relation record` records durable relation evidence before or alongside transformation work.

Future mutating lifecycle commands must write lineage events and may reference relation records, but the relation ledger remains a pre-mutation evidence surface.

## Relationship To Site Provenance Lineage

Site provenance lineage is the append-only continuity substrate.

The relation ledger is a current-state evidence registry over relation edges. It can reference lineage events, but it does not replace them.

Graph views are projections over relation and lineage records. They are not authority.
