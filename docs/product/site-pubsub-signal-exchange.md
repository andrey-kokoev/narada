# Site Pub/Sub Signal Exchange

Site pub/sub is Narada's doctrine for typed signal exchange among Sites.

It is not automatic replication, shared ownership, or remote mutation.

In the Site factorization, pub/sub is an interface and crossing family between Site authority objects. Delivery creates an inert signal, not admission. See [`site-factorization.md`](site-factorization.md).

This is a direct instance of Governed Crossing: transported signal arrival is not receiving-Site admission. See [`../concepts/governed-crossing.md`](../concepts/governed-crossing.md).

## Rule

```text
Publishing sends an inert signal.
Subscribing receives an inert signal.
The receiving Site governs admission.
```

## Signal Kinds

Sites may publish typed signals such as:

- observations;
- proposals;
- health signals;
- task reports;
- doctrine updates;
- template releases;
- knowledge candidates;
- tool candidates;
- Site lifecycle events;
- lineage events;
- authority migration proposals;
- verification or trust posture changes.

## Subscription Semantics

A subscription says that one Site wants to hear about a class of signals from another locus. It does not say the receiving Site accepts, trusts, promotes, executes, or stores the payload as canonical truth.

Subscribed signals should enter an inert intake boundary, preferably Canonical Inbox with scale-relative crossing coordinates. A sibling typed signal projection may exist, but it is a derived view, not a second inbox authority. From there, normal governed actions apply:

- archive;
- task candidate;
- knowledge candidate;
- tool candidate;
- Site config change proposal;
- template update proposal;
- authority migration proposal;
- lineage event candidate.

## Routing Policies

Useful routing policies include:

| Policy | Meaning |
| --- | --- |
| `explicit` | Only named source/target Site pairs. |
| `topic` | Subscribe by topic or signal kind. |
| `locus` | Subscribe by locus type such as PC, User, ELT, Data, Client Service. |
| `authority_class` | Subscribe to signals relevant to a mutation/admission authority class. |
| `all_relevant` | Deliver to Sites whose declared authority or awareness registry says the signal is relevant. |

`all_relevant` is still governed. It expands delivery, not admission.

## Relationship To Lineage

Pub/sub edges are influence-only lineage edges:

- `site.published` records a signal publication;
- `site.subscribed` records subscription posture;
- neither transfers mutation authority;
- receiving admission, if any, is a separate event.

## Relationship To User Site Awareness

The User Site awareness registry can list subscriptions, pending subscribed signals, stale upstreams, and reachable inbox endpoints.

This gives the operator a coordination surface without making the User Site the owner of project, client, data, ELT, PC, or Narada proper Sites.

## Doctor And Preflight Expectations

Future doctor/preflight surfaces should report:

- subscription health;
- last received signal per topic;
- pending unadmitted signals;
- stale or unreachable publishers;
- unknown sender trust posture;
- unsafe auto-admission attempts;
- mismatched authority expectations.

## Boundary

This document defines pub/sub doctrine. It does not implement subscriptions, delivery, storage, fanout, trust verification, or admission commands.

Future implementation must preserve the rule that subscribed signals are inert until the receiving locus admits them.
