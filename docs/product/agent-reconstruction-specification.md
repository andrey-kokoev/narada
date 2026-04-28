# Agent Reconstruction Specification

This specification is for readers who cannot run Narada packages directly but can ask an internal agent to reconstruct a Narada-compatible local kernel from principles and documentation.

The goal is not to copy package names, file layout, or implementation internals. The goal is to preserve Narada's authority invariants.

## Scope

An internal agent may build a local, minimal Narada-compatible kernel that:

- admits external observations as inert payloads;
- compiles admitted observations into durable facts;
- derives bounded work candidates;
- separates evaluation from decision authority;
- records effect intent before execution;
- confirms or reconciles execution after the fact;
- leaves durable evidence for every consequential crossing.

## Non-Goals

Do not claim compatibility because names match.

Do not import runnable Narada code if the environment prohibits it.

Do not bypass local corporate policy, credential rules, approval processes, or network boundaries.

Do not collapse inbox arrival, task creation, command execution, and confirmation into one implicit step.

## Required Invariants

| Invariant | Requirement |
| --- | --- |
| Governed Crossing | Arrival is not admission; capability is not authority; crossing is governed before consequence. |
| Zone authority | Each zone has one authority grammar for truth, transition, artifact, and confirmation. |
| Intelligence-Authority Separation | Model judgment can propose; the control plane decides what counts and what may mutate. |
| Explicit admission | Incoming observations, work candidates, commands, knowledge, and effects are inert until admitted. |
| Durable evidence | Every consequential crossing leaves replayable evidence. |
| Intent before execution | Effects are represented as durable intents before external mutation. |
| Confirmation after execution | Execution success is not assumed truth; confirmation or reconciliation is required. |
| Projection is not authority | Dashboards, registries, clones, and summaries are read/projection surfaces unless explicitly admitted. |
| Capability/secret separation | A credential value is not itself permission; store references and grants separately. |
| Site factorization | Site is authority object plus realization/interface/projection/crossing/lineage, not just a folder or process. |

## Minimal Data Model

A minimal reconstruction should define durable records for:

| Record | Purpose |
| --- | --- |
| `SourceObservation` | Raw observed input with source identity and capture time. |
| `Fact` | Canonical admitted observation with deterministic identity. |
| `Context` | Bounded selected facts for evaluation. |
| `WorkItem` | Admitted unit of attention. |
| `Evaluation` | Fallible judgment or proposal. |
| `Decision` | Authority-owned admission, rejection, routing, or approval. |
| `Intent` | Durable effect request before execution. |
| `ExecutionAttempt` | Bounded attempt to perform an effect or command. |
| `Confirmation` | Evidence that external or downstream state matches intended consequence. |
| `Trace` | Durable explanation and replay evidence for crossings. |
| `CapabilityGrant` | Permission envelope referencing credentials without storing raw secret values. |

## Minimal Control Cycle

```text
Source Read
-> Fact Admission
-> Context Formation
-> Evaluation
-> Governance / Decision
-> Intent or Handoff
-> Execution Attempt
-> Confirmation / Reconciliation
-> Evidence Trace
```

Each arrow is a governed crossing. If your local implementation cannot name the crossing artifact and confirmation rule, the implementation is not Narada-compatible yet.

## Copy-Paste Agent Prompt

```text
You are reconstructing a Narada-compatible local kernel inside a constrained environment.

Do not copy Narada package names as proof of compatibility.
Preserve the invariants:
- arrival is not admission;
- capability is not authority;
- model judgment is not permission;
- effects require durable intent before execution;
- execution requires confirmation or reconciliation;
- projections do not mutate authority;
- every consequential crossing leaves durable evidence.

Read these documents first:
1. README.md
2. AGENTS.md
3. SEMANTICS.md
4. packages/layers/control-plane/docs/00-kernel.md
5. docs/concepts/governed-crossing.md
6. docs/concepts/command-execution-intent-zone.md
7. docs/product/bootstrap-contract.md
8. docs/product/site-factorization.md

Build the smallest local kernel that can:
1. ingest an inert observation;
2. admit it as a fact;
3. derive one bounded work item;
4. evaluate it without granting authority to the evaluator;
5. create a durable decision;
6. create an intent before any effect;
7. execute only through an explicit execution record;
8. reconcile or confirm the effect;
9. emit a trace that can be reviewed later.

When you diverge from these documents, report the divergence as a proposal or residual. Do not claim compatibility by silence.
```

## Validation Checks

A reconstructed kernel is minimally valid only if:

- a received payload can remain inert without becoming work;
- a rejected payload leaves a durable rejection reason;
- a model-generated recommendation cannot execute an effect directly;
- an approved effect can be traced from decision to intent to execution attempt to confirmation;
- a failed execution does not become assumed truth;
- a read-only projection cannot mutate canonical state;
- credential values are never stored as ordinary config knowledge;
- a Site can be described independently from its filesystem root.

## Divergence Reporting

If the internal build cannot preserve an invariant, record:

| Field | Meaning |
| --- | --- |
| `divergence_id` | Stable local identifier. |
| `invariant` | Which invariant could not be preserved. |
| `reason` | Environment, policy, platform, or design reason. |
| `risk` | What collapse can happen. |
| `local_mitigation` | Temporary local mitigation. |
| `proposal` | Proposed change to Narada docs, doctrine, or implementation. |

Send divergence reports back as proposals or observations. Do not present a divergent build as Narada-compatible without naming the divergence.
