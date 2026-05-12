# Site Factor Profile Hypothesis

Status: provisional concept proposal.

This note records a candidate lift exposed by comparing Operation, Site, agent lifecycle, User Site, PC Site, and operator-surface runtime pressure.

In the terms of [`inquiry-topology.md`](inquiry-topology.md), this note represents one explored branch from the broader inquiry junction "agent lifecycle as authority-zone topology." It does not close the sibling branch concerning the agent lifecycle authority substrate itself.

It is not yet canonical terminology. Canonical vocabulary remains in [`../../SEMANTICS.md`](../../SEMANTICS.md), where Narada is a composed topology of authority-homogeneous zones connected by governed crossings, and an Operation is a configured Zone topology. This note should become canonical only if the originating cases can be re-instantiated through the factor-profile reading without losing their current behavior.

## Hypothesis

A Site is not best treated as a class hierarchy. A Site is a bounded authority locus with a declared factor profile.

In this reading, Site kinds are not inheritance levels. They are earned profiles over one authority locus: which governance factors the locus actually needs, which crossings it admits, which durable stores it owns, which projections it emits, and which pending claims it can preserve over time.

A compact form:

```text
Site = authority locus + boundary grammar + earned governance factors
Site kind = declared factor profile, not superclass/subclass position
```

## Pressure That Earned The Hypothesis

A hierarchy such as `Operation -> Site -> Agentic Site -> Federated Site` creates false promotion pressure. Current cases do not line up along one ladder:

- A mechanical Operation needs authority, policy, ledger, and projections, but may not need an Inbox.
- A User Site is inbox/task/agent/coordination heavy.
- A PC Site is operator-surface, diagnostics, and repair heavy.
- A federated Site may need peer crossings without resident agents.
- Agent lifecycle wants authority zones, guard transitions, path-whitelist policy, evidence, and a ledger, but does not automatically need every Site surface.
- An inbox-bearing Operation differs from a mechanical Operation by preserving unresolved pending crossings over time, not by becoming an entirely different ontological class.

The factor-profile reading avoids treating optional governance surfaces as inherited obligations.

## Candidate Factors

| Factor | Meaning | Earned When |
| --- | --- | --- |
| Authority locus | The bounded object that owns truth for declared state and transition classes. | Any durable governed state exists. |
| Boundary grammar | Declares what may enter or leave, in what form, under which authority. | Crossings can affect consequence. |
| Ledger | Append-only evidence of admitted crossings, transitions, authority basis, and confirmation. | Consequence must be audited or replayed. |
| Projection surface | Read-only/advisory views derived from authority state. | Other actors need to inspect state without owning it. |
| Policy surface | Local rules for roles, capabilities, paths, admissibility, scopes, and exceptions. | More than one action class or actor posture exists. |
| Inbox | Durable pending-intake surface for crossings not resolved in the initiating transaction. | Claims, proposals, CAPAs, or requests must wait for admission. |
| Task surface | Governed decomposition and lifecycle for assigned, reviewed, or continued work. | Work cannot be completed as one immediate transition. |
| Agent embodiment surface | Durable identities, sessions, checkpoints, and capability bindings. | AI or automated embodiments need continuity and governed action. |
| Operator surface | Human-facing presentation, action requests, labels, activity, and confirmations. | Operator attention or confirmation becomes part of governance. |
| Federation surface | Governed crossings with peer, enclosing, or enclosed authority loci. | The locus exchanges durable claims with other loci. |
| Repair/maintenance surface | Diagnostics, CAPAs, health, and recovery protocols. | The locus must preserve and repair its own operating posture. |

## Provisional Site Kinds As Profiles

These are not classes. They are names for recurring profiles.

| Kind | Factor Profile | Boundary Test |
| --- | --- | --- |
| Mechanical Site / Operation | Authority locus, boundary grammar, ledger, projection, policy. No standing Inbox required. | Can every admitted crossing resolve mechanically within the transition regime? |
| Deliberative Site | Mechanical profile plus Inbox. | Must unresolved claims persist for later admission, review, or rejection? |
| Work Site | Deliberative profile plus Task surface. | Must work be assigned, continued, reviewed, or closed separately from intake? |
| Agentic Site | Work profile plus Agent embodiment surface. | Must embodied agents preserve identity, checkpoints, and capability policy across sessions? |
| Operator Site | Any profile plus Operator surface. | Does human attention, labeling, action request, or confirmation participate in governance? |
| Federated Site | Any profile plus Federation surface. | Does it exchange governed crossings with peer/enclosing/enclosed loci? |
| Self-maintaining Site | Any profile plus Repair/maintenance surface. | Does it diagnose, repair, and CAPA its own operating posture? |

## Re-instantiation Table

| Originating Case | Current Reading | Factor-profile Reading | What Must Still Work |
| --- | --- | --- | --- |
| Mechanical Operation | Operation is the configured thing a user sets up and runs. | Mechanical Site profile: authority locus, boundary grammar, ledger, projection, policy; no Inbox if all crossings resolve mechanically. | Operation bootstrap, preflight, run, evidence append, and projection remain usable without forcing Inbox. |
| Inbox-bearing Operation | Operation with async intake or unresolved claims. | Deliberative Site profile over the same authority locus. | Incoming proposals/CAPAs remain inert until admitted; pending claims survive across time. |
| User Site | Portable operator memory and coordination locus. | Agentic/Work/Deliberative Site profile with User-locus authority. | Tasks, inbox, preferences, chapters, checkpoints, and cross-machine continuity remain User-owned. |
| PC Site | Machine-local diagnostics, repair, display/runtime state. | Operator/Self-maintaining Site profile with PC-locus authority. | Live repair and diagnostics stay PC-owned; portable lessons cross to User Site only through governed routing. |
| Agent lifecycle | Startup/action/close-out transition grammar for embodied agents. | Candidate Site-like authority topology or sub-Site profile: policy, ledger, guards, evidence, path whitelist, checkpoints. | Agent actions remain governed across hydrate, orient, inspect, act, verify, close-out, checkpoint without JSON becoming authority. |
| Operator surface runtime | HWND/surface observations, bindings, labels, projections. | Operator Site factor over PC/User authority split, with runtime events and projections. | SQLite remains authority; JSON labels/bindings remain projections; direct bindings use governed MCP crossings. |
| Narada proper Operation semantics | Operation is a configured Zone topology with zone-like external boundary. | Operation may be understood as the Mechanical Site profile when its boundary grammar is fully mechanical. | `SEMANTICS.md` remains true; this proposal does not collapse Operation and Site until re-instantiation proves the lift. |

## Admission Criteria For Canonical Lift

This hypothesis should not be promoted to `SEMANTICS.md` until these criteria are met:

- Each originating case above can be described by factor profile without losing existing obligations or authority boundaries.
- Mechanical Operations do not inherit Inbox, Task, Agent, or Operator surfaces unless pressure earns them.
- Existing Site factorization remains valid: folder, runtime, registry row, and projection do not become authority by convenience.
- Operation remains user-facing and usable; any internal Site-like reading does not burden first-time operator language.
- The proposal reduces hidden arbitrariness compared with the hierarchy reading.
- The proposal preserves migration paths for current configs, docs, ledgers, and MCP surfaces.
- A future implementation can store authoritative lifecycle/factor state in SQLite or another declared authority substrate, with JSON only as projection.

## Residuals

- Decide whether `Mechanical Site` should become a canonical term or remain an explanatory alias for Operation.
- Decide whether factor profiles belong in Site config, Operation config, a Site registry authority DB, or an Operation ledger.
- Define how append-only ledgers are partitioned: one physical store per Operation/Site, one Site-level store partitioned by authority locus, or domain-specific ledgers with a common event grammar.
- Define whether agent lifecycle is a Site-like authority topology, a factor attached to User Site, or a separate governed Operation.
- Define path whitelist policy as part of agent capability settings: all paths outside explicit per-agent allowlists should be disallowed by default.
