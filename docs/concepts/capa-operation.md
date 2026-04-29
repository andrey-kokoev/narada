# CAPA Operation

CAPA means Corrective and Preventive Action. In Narada, a CAPA Operation is the governed response to an incident that exposes recurrence risk.

It is not an ordinary observation, proposal, task, chapter, review, or retrospective. Those artifacts may trigger or support CAPA, but CAPA exists when Narada must prevent the same failure mode from recurring across future Cycles, Sites, agents, or operator surfaces.

CAPA is an Operation because it has its own Aim, Site locus, Control Cycle, Acts, and Evidence Trace:

| Element | CAPA Reading |
| --- | --- |
| Aim | Remove or reduce a recurrence-risk failure mode. |
| Site | The locus where the failure occurred or where prevention must be installed. |
| Cycle | Detect, contain, diagnose, correct, prevent, verify, disseminate, close. |
| Act | A bounded corrective/preventive mutation, doctrine amendment, tooling change, or process handoff. |
| Trace | Incident evidence, containment record, root cause, changed artifacts, verification, residual risk, and dissemination evidence. |

## Trigger

CAPA is warranted when an event is not merely a local defect but a recurrence-risk signal.

Common triggers:

- repeated agent or tool behavior after prior correction;
- raw or oversized output crossing into chat, task evidence, or review where a bounded artifact reference was required;
- failed Builder-to-Architect, Builder-to-Operator, or agent-to-agent handoff crossing;
- lifecycle mutation without durable evidence;
- doctrine/tooling mismatch that causes multiple Sites or agents to repeat the same wrong path;
- operator correction showing that an existing rule is too weak, invisible, or not operationalized.

CAPA should not be opened for every small bug. Ordinary bugs belong in tasks. CAPA begins when the prevention question is part of the work.

## Record Shape

A CAPA record should include:

| Field | Meaning |
| --- | --- |
| `capa_id` | Durable CAPA identity. |
| `trigger` | Concrete event, envelope, task, command, review, or Operator correction that opened CAPA. |
| `impact` | What was harmed: tokens, authority discipline, evidence quality, trust, Site state, runtime safety, user attention, or delivery. |
| `containment` | Immediate action that stops further harm before the root fix. |
| `root_cause` | The smallest authority/tooling/doctrine/process reason the event could recur. |
| `corrective_action` | The change that fixes the observed case. |
| `preventive_action` | The change that makes recurrence less likely elsewhere. |
| `owner` | Principal responsible for completing the CAPA Operation. |
| `affected_surfaces` | Doctrine, CLI, tests, AGENTS, task contract, agent bootstrap, Site config, or other surfaces touched. |
| `verification_method` | How Narada proves the corrective and preventive actions work. |
| `closure_evidence` | Links to commits, tests, task evidence, review handoff, or replayed originating case. |
| `residual_risk` | What can still recur and why it is accepted or deferred. |
| `dissemination_targets` | Sites, docs, bootstrap contracts, agent roles, or operator surfaces that must learn the change. |
| `review_state` | `open`, `contained`, `corrected`, `prevented`, `verified`, `disseminated`, or `closed`. |

The record is durable evidence, not a chat apology. A CAPA without containment, prevention, and verification is only an incident note.

## Lifecycle

```text
triggered
  -> contained
  -> diagnosed
  -> corrective_action_complete
  -> preventive_action_complete
  -> verified
  -> disseminated
  -> closed
```

The lifecycle may loop from verification back to diagnosis if the originating case cannot run through the corrected form.

Closure requires:

- the triggering event is linked;
- containment is recorded;
- root cause is named;
- corrective action is complete;
- preventive action is complete or explicitly deferred with residual risk;
- the originating case has been replayed or otherwise verified through the lifted form;
- dissemination targets are updated or explicitly out of scope.

## Raw Output Incidents

Large diagnostic output is a CAPA trigger when it crosses into an attention surface that did not request raw output.

The preventive discipline is artifact-first:

- complete raw output goes to a retained artifact with path, digest, and command/run reference;
- chat, task evidence, reviews, and inbox summaries receive bounded excerpts only;
- the default summary names count, status, key anomalies, and artifact pointer;
- raw output is admitted inline only when the Operator explicitly requests raw output for that surface.

This follows CEIZ output-admission law: output creation and output admission are separate. A tool may produce thousands of lines; Narada should not force the Operator to read them unless that crossing is admitted.

## Review Handoff Incidents

Builder completion that expects Architect or Operator review must produce an explicit handoff artifact.

Acceptable handoff artifacts include:

- `review_request` envelope;
- task report with review requested and changed files;
- inbox envelope routed to the Architect;
- command result or publication evidence that names the reviewer and requested admission;
- Site-local handoff artifact governed by that Site's AGENTS contract.

The minimum handoff content is:

| Field | Meaning |
| --- | --- |
| `requester` | Builder or agent asking for admission. |
| `reviewer` | Architect, Operator, Inspector, or other admitted reviewer. |
| `scope` | Task, chapter, commit, files, Site, or runtime surface to inspect. |
| `evidence` | Tests, command results, artifacts, diffs, screenshots, or residuals. |
| `decision_needed` | What admission decision is requested. |
| `residuals` | Known blockers, risks, or intentionally deferred work. |

If the reviewer must infer completion by reading git history, task folders, or chat context, the handoff crossing failed. That can be contained locally, but recurrence belongs in CAPA.

## Relationship To Existing Surfaces

| Surface | CAPA Relationship |
| --- | --- |
| Observation | May trigger CAPA but does not itself require action. |
| Proposal | May propose CAPA or a CAPA action. |
| Task | Implements bounded corrective or preventive work. |
| Chapter | Groups related CAPA tasks when a larger arc is needed. |
| Review | Admits or rejects an artifact; may expose CAPA trigger if handoff/admission failed. |
| Coherence loop | May detect CAPA candidates; must not repair automatically. |
| Inbox | Receives CAPA proposals or handoff artifacts before promotion. |

CAPA must not become an autoimmune loop. It is opened by traceable pressure and closed by evidence. It does not grant the system permission to continuously self-modify.

## Practical Rule

When an agent sees a repeated or high-impact process failure, it should ask:

```text
Is this only a task defect, or is there recurrence risk that requires containment, prevention, verification, and dissemination?
```

If recurrence risk is present, create or route to CAPA rather than apologizing, relying on memory, or silently adding another local workaround.
