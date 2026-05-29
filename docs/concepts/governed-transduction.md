# Governed Transduction

## Decision

Narada should name the repeating pattern of Site-local processing as **Governed Transduction**.

The pattern is not merely a pipeline, queue, filter, or daemon loop. It is the Site-governed transformation of lineage-bearing items from one semantic state into another through explicit boundaries.

## Definition

**Governed Transduction** is the transformation of an item from one representation or authority state into another under Site policy, with preserved lineage, admission posture, evidence, and receipts.

A **Governed Transduction Chain** is an ordered set of transduction steps.

A **Governed Transduction Step** receives one or more source items, evaluates them under policy, and emits zero or more downstream items.

## Abstract Pattern

```text
source item
-> governed transduction step
-> downstream item
-> next governed transduction step
```

The item may change identity at each step. What persists is lineage, not object identity.

```text
remote email
-> mailbox record
-> inbox envelope
-> admission recommendation
-> task
-> directive
-> carrier-visible input
-> receipt/report/transition
```

## Why Not Pipeline

`pipeline` is too mechanical. It suggests a sequence of transformations, but not the authority change that Narada must govern.

Every meaningful Narada step may include:

- a source projection,
- candidate formation,
- policy and capability checks,
- intelligent or deterministic evaluation,
- admission, refusal, or deferral,
- materialization of a new first-class object,
- idempotency and duplicate protection,
- evidence and lineage preservation,
- dispatch or downstream signaling,
- receipt and reconciliation.

That grammar is stronger than ordinary dataflow.

## Vocabulary

- **Source Item**: the item observed by a step in its source state.
- **Candidate**: a source item made eligible for evaluation but not yet admitted downstream.
- **Evaluation**: deterministic or intelligent judgment over the candidate.
- **Admission Decision**: promote, refuse, defer, park, or escalate.
- **Materialization**: creation of the downstream first-class object.
- **Downstream Item**: emitted object in the next semantic state.
- **Lineage**: preserved references proving where the downstream item came from.
- **Cursor**: remembered progress through the source space.
- **Lease**: coordination preventing duplicate non-idempotent processing.
- **Receipt**: evidence that a downstream boundary consumed, acknowledged, refused, or otherwise observed the emitted item.
- **Reconciliation**: later pass that compares expected downstream state with actual evidence.

## Step Shape

```json
{
  "schema": "narada.governed_transduction_step.v1",
  "step_id": "sonar.email-to-task.admission-evaluation",
  "source_space": "mailbox_record",
  "candidate_kind": "inbox_envelope",
  "policy_ref": "sonar.mailbox_intake_policy",
  "emits": ["task_candidate", "refusal_event"],
  "lineage_required": true,
  "idempotency_key_fields": ["source_message_id", "thread_id"],
  "receipt_required": false
}
```

## Chain Shape

```json
{
  "schema": "narada.governed_transduction_chain.v1",
  "chain_id": "sonar.email-intake-chain",
  "site_id": "sonar",
  "steps": [
    "mailbox-sync",
    "envelope-staging",
    "admission-evaluation",
    "task-materialization",
    "resident-dispatch",
    "receipt-reconciliation"
  ]
}
```

## Sonar Example

The Sonar email flow is a governed transduction chain:

| Step | Source Item | Boundary | Downstream Item |
| --- | --- | --- | --- |
| Mailbox sync | remote mailbox message | sync/filter policy | local mailbox record |
| Envelope staging | mailbox record | inbox intake rules | inbox envelope or staged candidate |
| Admission evaluation | envelope | evaluator/policy boundary | recommendation |
| Task materialization | recommendation | task lifecycle admission | task |
| Resident dispatch | task or directive candidate | directive delivery policy | directive/control frame |
| Agent work | directive/task | carrier and tool admission | report, task transition, draft, or new candidate |
| Receipt reconciliation | expected delivery | evidence boundary | receipt or recovery action |

## Relation To Site Operating Loop

A Site Operating Loop runs one or more Governed Transduction Chains.

```text
Site Operating Loop
-> Loop Run
-> Governed Transduction Chain
-> Governed Transduction Step
-> Emissions and receipts
```

The loop is the recurring control routine. The transduction chain is the semantic transformation grammar inside the loop.

## Authority Rules

- Authority may increase only at an explicit admission boundary.
- A downstream object must preserve lineage to its source item or explain why lineage is unavailable.
- Refusal and deferral are valid outcomes, not failures.
- Intelligent evaluation is advisory until admitted by the owning Site boundary.
- Dispatch is not receipt.
- Receipt is not task completion.
- A cursor proves where observation reached; it does not prove downstream admission.
- A lease prevents duplicate processing; it does not grant authority.
- Reconciliation must be possible without trusting the carrier's memory alone.

## Naming

Use names that identify semantic movement:

- `email-to-envelope`
- `envelope-to-task-candidate`
- `task-to-resident-directive`
- `directive-to-carrier-input`
- `carrier-output-to-report`

Avoid names that identify only substrate:

- `agent-cli-step`
- `daemon-step`
- `jsonl-step`
- `prompt-step`

Substrate is recorded in execution evidence, not in the semantic name.
