# Site Operating Loop

## Decision

Narada should treat an **Operating Loop** as a first-class Site object for governed recurring or reactive control.

An operating loop is not an agent, carrier, daemon, prompt, task, or directive. It is the Site-owned routine that observes Site state over bounded runs and may emit first-class Site objects.

## Definition

A **Site Operating Loop** is a governed Site-local control routine, continuous or event-triggered, that evaluates Site state against declared policy and records resulting observations, decisions, emissions, and receipts.

The loop may be hosted by a daemon, scheduled task, worker, CLI process, or carrier-adjacent supervisor. That host is substrate. The loop is the semantic object.

## Vocabulary

- **Operating Loop**: abstract first-class object for recurring or reactive Site control.
- **Site Operating Loop**: an operating loop scoped to one Site authority locus.
- **Loop Run**: one bounded execution unit of a loop.
- **Loop Trigger**: why a run occurred, such as a timer, inbox arrival, task transition, operator request, startup event, webhook, or blocking watch wakeup.
- **Loop Observation**: Site state read by the run.
- **Loop Decision**: admitted or refused conclusion that determines whether the loop emits anything.
- **Loop Emission**: first-class object produced by the run, such as a directive, task candidate, task, report, health event, inbox envelope, or trace.
- **Loop Policy**: cadence, trigger mode, authority limits, target agents or roles, permitted observations, permitted emissions, and failure posture.
- **Loop Lease**: coordination object preventing duplicate concurrent runs.
- **Loop Cursor**: remembered progress, such as the latest mailbox message, task transition, webhook sequence, or checkpoint.
- **Loop Receipt**: evidence that an emitted object was delivered, acknowledged, refused, or otherwise consumed by its target boundary.

## Trigger Modes

Trigger mode is an attribute of the loop. It is not the identity of the loop.

| Mode | Meaning |
| --- | --- |
| `continuous` | Long-running loop that wakes on interval, blocking wait, or internal cadence. |
| `triggered` | Discrete run caused by a specific event or operator action. |
| `scheduled` | Timer or cron creates bounded runs. |
| `hybrid` | Event wakeups plus periodic reconciliation. |

A continuous loop still records bounded Loop Runs. The durable run may represent one tick, one handled event, one reconciliation pass, or one bounded batch.

Continuous execution is substrate behavior. Loop Run evidence is the auditable unit.

## Relation To Governed Transduction

A Site Operating Loop normally runs one or more **Governed Transduction Chains**.

The loop is the recurring control routine. The transduction chain is the semantic transformation grammar inside the loop: source items become candidates, candidates cross admission boundaries, and admitted downstream objects preserve lineage.

```text
Site Operating Loop
-> Loop Run
-> Governed Transduction Chain
-> Governed Transduction Step
-> Emissions and receipts
```

See [`governed-transduction.md`](governed-transduction.md).

## Relation To Adjacent Objects

| Object | Meaning | Not the same as an Operating Loop because |
| --- | --- | --- |
| Task | Durable work obligation. | A loop may create or route tasks, but is not itself the work obligation. |
| Directive | Situated instruction, attention, routing, or constraint for a target. | A loop may emit directives, but directives are not the recurring control routine. |
| Agent | Reasoning actor that interprets tasks and directives. | A loop may target or summon agents, but is not an agent. |
| Carrier | Runtime substrate for an agent, such as NARS, Codex, Pi, or Claude Code. | A loop may deliver through a carrier, but is not defined by that carrier or by an operator surface. |
| Daemon | Host process capable of running one or many loops. | A daemon is execution substrate; the loop is Site-governed control semantics. |
| Prompt | Runtime-specific rendered text. | A loop may ultimately cause prompt delivery, but the governed object is upstream of prompt rendering. |
| Cycle | Generic bounded execution pass. | A Loop Run is a kind of cycle tied to a declared Operating Loop. |
| Governed Transduction Chain | Ordered grammar of source item transformation through admission boundaries. | A loop runs chains; the chain is not itself the recurring control routine. |

## Shape

```json
{
  "schema": "narada.site_operating_loop.v1",
  "loop_id": "smart-scheduling.email-intake-loop",
  "site_id": "smart-scheduling",
  "authority_locus": "smart_scheduling",
  "mode": "hybrid",
  "policy": {
    "observes": ["mailbox", "task_lifecycle"],
    "emits": ["directive", "health_event"],
    "targets": [{ "kind": "role", "id": "resident" }],
    "carrier_preferences": ["narada-agent-runtime-server"],
    "max_batch": 25
  }
}
```

```json
{
  "schema": "narada.site_operating_loop_run.v1",
  "run_id": "looprun_...",
  "loop_id": "smart-scheduling.email-intake-loop",
  "trigger": {
    "kind": "mailbox_message_materialized",
    "ref": "inbox_envelope:..."
  },
  "observations": [],
  "decisions": [],
  "emissions": [
    {
      "kind": "directive",
      "directive_id": "dir_..."
    }
  ],
  "receipts": []
}
```

## Example: Email Intake Resident Loop

```text
mailbox sync or inbox bridge
-> task materialized/admitted
-> Site Operating Loop run records observation
-> loop emits system directive for role:resident or agent:site.resident
-> NARS control transport carries directive
-> carrier records directive_receipt_recorded
-> loop receipt reconciliation updates delivery posture
```

This is coherent even when the loop is continuously running. The continuous process is merely waiting and reconciling; the Site evidence remains discrete runs and emissions.

## Authority Rules

- The Site owns the loop policy.
- The loop may only observe surfaces named by policy.
- The loop may only emit object kinds admitted by policy.
- The loop must record bounded Loop Runs, even when implemented by a continuous process.
- The loop must not collapse carrier availability into authority. A live NARS session is delivery capacity, not permission.
- The loop must not treat append-to-transport as receipt. Receipt requires target evidence.
- The loop must use leases or equivalent coordination before performing non-idempotent emissions.
- Triggered and continuous modes must share the same admission and evidence rules.

## Naming

Use noun names that describe the Site control routine, not the carrier or implementation:

- `smart-scheduling.email-intake-loop`
- `sonar.resident-task-dispatch-loop`
- `narada-proper.checkpoint-maintenance-loop`

Avoid:

- `agent-cli-loop`
- `daemon-loop`
- `prompt-loop`

Those names describe substrate or rendering, not the governed Site object.

## Coherence With Directives

Operating loops and directives complement each other:

- Operating loop: mechanism that notices and decides whether to emit.
- Directive: admitted situated intent emitted by a source for a target.
- Agent/carrier: consumer path that receives and interprets the directive.

For autonomous NARS-backed resident operations, the coherent statement is:

```text
Site Operating Loop emits a directive targeted to a resident role.
NARS is the carrier runtime used to deliver that directive; agent-cli may be one attached operator surface.
```

Not:

```text
agent-cli became autonomous.
```

Autonomy belongs to the Site-governed loop policy and evidence trail, not to the carrier.
