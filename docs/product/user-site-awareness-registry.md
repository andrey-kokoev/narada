# User Site Awareness Registry

The User Site awareness registry is the user-locus directory and coordination surface for Sites relevant to one operator profile.

It lets a top-level Narada architect know which Narada-capable loci exist without making the User Site the owner of those loci.

## Rule

```text
The User Site may know, route, propose, subscribe, and navigate.
It does not gain mutation authority over another Site by knowing it.
```

## Registry Entry Shape

Each known Site entry should record:

| Field | Meaning |
| --- | --- |
| `site_id` | Stable Site identifier. |
| `locus_type` | User, PC, project, client service, data, ELT, Narada proper, or other declared locus. |
| `roots` | Known filesystem, repo, cloud, or runtime roots. |
| `authority_boundaries` | Mutation classes owned locally, remotely, forwarded, refused, or read-only. |
| `sync_posture` | Local-only, git-backed, hybrid, cloud-synced, projected, or unknown. |
| `capabilities` | Readable, proposable, forwardable, mutable, executable, subscribable. |
| `inbox_endpoint` | How to submit inert proposals or observations to that Site. |
| `subscription_topics` | Typed signal topics the User Site receives or may receive. |
| `lineage_refs` | Provenance lineage events connecting this Site to others. |
| `freshness` | Last observed revision, health check, import, or status read. |
| `health` | Last-known health posture and diagnostics. |

## Authority Separation

Awareness is not authority.

The User Site can:

- list known Sites;
- inspect health and freshness;
- route proposals to the correct locus;
- subscribe to typed signals;
- submit inbox envelopes;
- maintain navigation and continuity hints;
- remember which loci exist and how they relate.

The User Site cannot, by awareness alone:

- mutate another Site's task lifecycle;
- edit another Site's config;
- admit knowledge into another Site;
- execute effects in another Site;
- transfer authority;
- treat linked roots as owned state.

Any such mutation must cross through the target Site's authority surface or an explicitly configured forwarding route.

## Relationship To Other Doctrine

- Plural Embodiment, Singular Authority prevents a convenient User Site shell or clone from becoming mutation authority.
- Governed Locus Federation gives the broader model: the User Site federates awareness and routes proposals while each locus governs admission.
- Site Provenance Lineage records where Sites came from and how they relate.
- Site pub/sub can feed the awareness registry with typed signals, but subscribed signals remain inert until admitted.

For Site pub/sub doctrine, see [`site-pubsub-signal-exchange.md`](site-pubsub-signal-exchange.md).

## Current Boundary

This document defines registry semantics. It does not yet implement storage, discovery, subscription management, or mutation routing.

Until a first-class command exists, manual `linked_sites` maps in User Site config are provisional authoring surfaces. They should be treated as awareness hints, not authority grants.
