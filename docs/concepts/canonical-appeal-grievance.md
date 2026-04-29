# Canonical Appeal And Grievance

The Canonical Appeal and Grievance mechanism is the governed path for challenging a Narada decision after that decision exists.

It is not the same as pre-decision escalation, ordinary task review, rejection logging, reopen, supersession, or governance feedback.

## Purpose

Narada decisions should be durable enough to stand, but not immune to challenge.

An appeal or grievance creates a bounded crossing from:

```text
existing decision or refusal
-> challenge artifact
-> independent review
-> durable appeal outcome
```

The original decision remains traceable. If it is overturned, superseded, remanded, or withdrawn, that outcome is recorded as a new governed decision rather than an edit to history.

## What Can Be Appealed

The v0 scope includes:

- task review verdicts;
- task closure, deferral, supersession, or reopen refusal;
- inbox admission, archive, promotion, routing, or refusal;
- admission/rejection ledger decisions;
- capability denial or authority-class refusal;
- command execution refusal where the refusal is a governance decision rather than a mechanical failure;
- Site routing or locus refusal;
- operator-surface identity/binding admission refusal;
- any other durable decision record whose regime declares appealable status.

Mechanical failures are not appeals by default. They should first be reported as blockers, defects, or observations. They become appealable only when a governance decision says the failure is acceptable, terminal, or out of scope.

## Lifecycle

An appeal has its own lifecycle:

| State | Meaning |
| --- | --- |
| `filed` | A principal submitted a challenge artifact. |
| `admitted` | The appeal has standing and enough evidence to review. |
| `refused` | The appeal lacks standing, scope, evidence, or timeliness. |
| `reviewing` | An independent reviewer is evaluating the challenge. |
| `upheld` | The original decision stands. |
| `overturned` | The original decision is replaced by a new decision. |
| `remanded` | The original authority must reconsider with named corrections. |
| `superseded` | A later decision made the appeal unnecessary while preserving trace. |
| `withdrawn` | The filing principal withdrew the appeal before terminal review. |

Terminal outcomes are `refused`, `upheld`, `overturned`, `remanded`, `superseded`, and `withdrawn`.

## Artifact Shape

A v0 appeal artifact should record:

| Field | Meaning |
| --- | --- |
| `appeal_id` | Durable appeal identifier. |
| `filed_by` | Principal filing the appeal. |
| `filed_at` | Filing timestamp. |
| `target_kind` | Kind of decision being challenged. |
| `target_ref` | Stable reference to the target decision, task, envelope, command result, or ledger entry. |
| `claim` | Concise statement of what is being challenged. |
| `grounds` | Reason codes such as `wrong_authority`, `missing_evidence`, `procedural_error`, `new_evidence`, `conflict_of_interest`, `misclassification`, or `proportionality`. |
| `evidence_refs` | Evidence supporting the challenge. |
| `requested_remedy` | Requested outcome: reconsider, overturn, remand, reopen, reroute, admit, restore, compensate, or clarify. |
| `standing` | Why the filing principal is allowed to challenge this decision. |
| `stay_requested` | Whether the filer asks to suspend downstream effects. |
| `status` | Current appeal lifecycle status. |
| `reviewer` | Independent reviewer or authority assigned to decide. |
| `outcome` | Terminal outcome and rationale. |

## Standing

Standing is required. A principal may file when at least one applies:

- they are the Operator or explicitly authorized steward;
- they are the principal directly affected by the decision;
- they authored the appealed work or evidence;
- they own the affected Site, capability, task, inbox item, or locus;
- the appeal is filed by an admitted inspection/review role;
- the governing regime explicitly grants standing.

An appeal can be refused without reviewing merits when standing is absent.

## Independence

The reviewer should not be the same runtime or principal that made the challenged decision when independence is possible.

If independent review is unavailable, the appeal outcome must disclose that limitation. The limitation does not invalidate the mechanism, but it prevents the result from pretending to be independent.

## Effect Posture

Filing an appeal does not automatically suspend the appealed decision.

A stay or suspension requires one of:

- the governing regime grants automatic stay for that decision kind;
- the Operator grants stay;
- the appeal reviewer grants stay;
- executor safety requires pausing downstream effects.

Without a stay, downstream work may continue. If the appeal later overturns the decision, the remedy is a new governed act: reopen, remand, supersede, compensate, reverse, or explain. History is not erased.

## Relationship To Existing Mechanisms

| Mechanism | Timing | Purpose | Difference |
| --- | --- | --- | --- |
| Question escalation | Before disputed action | Avoid arbitrary choice while blocked. | Appeal happens after a decision exists. |
| Task review | Before closure or as closure gate | Validate work against acceptance criteria. | Appeal challenges a review or decision. |
| Rejection ledger | At admission decision | Record admitted/rejected/deferred/superseded candidates. | Appeal may challenge a ledger decision; it is not the ledger itself. |
| Task reopen | After closure | Re-enter work lifecycle. | Reopen may be a remedy, not the appeal mechanism. |
| Supersession | After replacement decision | Replace a prior artifact or path. | Supersession may resolve an appeal but does not substitute for challenge review. |
| Governance feedback | After task completion | Improve the governing system. | Feedback is not a challenge to a specific decision. |
| Operator confirmation | Before privileged effect | Confirm authority or identity. | Confirmation does not decide grievance merits. |

## Relationship To Inbox

An appeal can arrive as a Canonical Inbox envelope, but the envelope is not the appeal outcome.

```text
inbox envelope
-> promoted to appeal artifact
-> appeal admission decision
-> independent review
-> appeal outcome
```

This keeps grievances typed and durable without making every complaint executable work.

## Anti-Collapse Rules

- A complaint in chat is not an appeal until promoted to an appeal artifact.
- An appeal is not an automatic override.
- An appeal is not a second hidden review path.
- A refused appeal must leave a durable reason.
- An overturned decision creates a new governed decision; it does not erase the old trace.
- Appeal review must disclose missing independence, missing evidence, or missing standing.

## V0 Boundary

This document defines doctrine and artifact grammar. It does not yet implement a CLI command, storage table, or automatic enforcement.

Expected future command shape:

```bash
narada appeal file --target <kind:ref> --grounds <codes> --by <principal>
narada appeal admit <appeal-id> --by <principal>
narada appeal review <appeal-id> --verdict upheld|overturned|remanded|refused --by <principal>
narada appeal list
narada appeal show <appeal-id>
```

Implementation must preserve the same rule: appeal creates durable reviewable trace; it does not silently mutate the appealed target.
