# Governed Crossing

Governed Crossing is the primitive by which an intent, observation, judgment, command, message, signal, artifact, or effect request crosses an authority boundary without collapsing arrival, admission, execution, and truth.

Originating thoughts concept: `/home/andrey/src/thoughts/content/concepts/governed-crossing.md`.

## Rule

```text
Arrival is not admission.
Capability is not authority.
Crossing is governed before consequence.
```

The thing crossing is inert before admission. It may be admitted, rejected, routed, transformed, deferred, quarantined, or recorded as residual.

## Withdrawal Rule

Withdrawal is not deletion.

Once a payload has crossed into a target authority zone, the source no longer owns erasure of that crossing. The source may submit a withdrawal, correction, or replacement request, but that request is itself a new governed crossing. The target authority owns the resulting disposition.

Canonical dispositions include:

| Phase | Withdrawal Meaning |
| --- | --- |
| Before admission | The target may reject, archive, defer, or supersede the original candidate. |
| After admission as durable intent | The target may cancel or supersede the admitted intent only if its lifecycle permits and no irreversible effect has occurred. |
| During execution attempt | The target may cancel only if the executor can still halt safely; otherwise the attempt must complete, fail, or be reconciled. |
| After confirmation | The original crossing remains true history; correction requires a new compensating, reversing, or explanatory crossing. |

Therefore:

```text
Withdrawal is a governed request for disposition.
It is not authority to erase, un-admit, or un-confirm.
```

## Shape

```text
source payload
-> authority boundary
-> crossing law
-> admitted artifact | rejected artifact | route | transform | deferral | quarantine | residual
-> trace
```

The crossing matters because the source and target do not share one authority grammar.

## Relationship To Crossing Regime

Governed Crossing is the primitive act.

Crossing regime is the local law for a particular crossing.

The regime must name what may cross, in what form, under whose authority, what artifact is produced, and how confirmation happens. Governed Crossing explains why that law is needed; crossing regime specifies it.

## Generated Narada Forms

Repeated governed crossings stabilize into Narada machinery:

| Repeated Crossing | Stabilized Form |
| --- | --- |
| External message or observation wants consequence | Canonical Inbox |
| Work intent wants lifecycle state | Task lifecycle |
| Command string wants process execution | Command Execution Intent Zone |
| Test request wants verification evidence | Testing Intent Zone |
| Effect intent wants transport execution | Canonical Outbox / Intent queue |
| Signal wants receiving-locus attention | Site pub/sub |
| Site relation wants continuity evidence | Site relation ledger / provenance lineage |
| Local friction wants reusable doctrine | Inhabited Evolution |

## Minimal Rules

1. Every consequential transition names a target authority.
2. The payload is inert before admission.
3. Authority is not inferred from proximity, executability, visibility, transport, or possession.
4. Admission, rejection, routing, transformation, deferral, quarantine, and residual are explicit outcomes.
5. Evidence sufficient for review or replay accompanies the transition.
6. Execution remains separate from admission unless the authority explicitly combines them.
7. Projection does not confer mutation authority.
8. Repeated friction around a crossing is candidate doctrine or machinery.
9. Lineage records crossings that change authority relationships.
10. The target authority can read back what became true.
11. Withdrawal after crossing is represented as a new governed crossing, not deletion of the original trace.

## Anti-Collapse Examples

| Collapse | Governed Crossing Reading |
| --- | --- |
| Message received = work exists | Message arrives as inert envelope; admission decides work, knowledge, route, rejection, or residual. |
| CLI can run command = command should run | Command string is intent; CEIZ governs risk, capability, execution, and result admission. |
| Published signal = receiving Site trusts it | Pub/sub transports an inert signal; receiving Site governs admission. |
| Folder contains Narada files = folder is authority | Site authority is declared; folder is realization unless admitted otherwise. |
| Agent says done = task complete | Evidence admission decides lifecycle eligibility. |

## Current Narada-Native Uses

- Canonical Inbox: ingress governed crossing from arrival to possible target-zone promotion.
- Task lifecycle: governed crossings over work state.
- CEIZ/TIZ: governed crossings from command/test intent to execution/result/evidence.
- Site factorization: interfaces are admissible crossing surfaces into a Site authority object.
- Site relation ledger and provenance lineage: durable evidence for crossings between Site authority objects.
- Outbox: outbound effect intent before transport-specific crossing.
