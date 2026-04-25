# Narada Terminology

This document is a user-facing quick reference. For the complete canonical ontology — including identity lattice, core abstractions, invariant derivations, and all first-class runtime terms — see [`SEMANTICS.md`](SEMANTICS.md).

## Primary User-Facing Term: Operation

An **Operation** is the live configured thing a user sets up and runs.

Users create, configure, preflight, activate, and run **Operations**. Each Operation maps to exactly one internal `scope`.

More precisely: an **Operation** is a configured Zone topology whose external boundary is itself zone-like. Internally, it is composed of authority-homogeneous Zones connected by governed crossings. Externally, enclosing topologies interact with it only through declared governed crossings.

The CLI may continue to use lowercase `operation` as user-facing command language. In canonical ontology prose, use **Operation** for the defined Narada concept.

See [`SEMANTICS.md#operation`](SEMANTICS.md#operation) for the full definition, typed variants, and relationship to `scope`.

## Internal Technical Term: `scope`

A **scope** is the internal runtime/config representation of an Operation.

Users should not need to know the word "scope" to use Narada successfully.

See [`SEMANTICS.md#scope`](SEMANTICS.md#scope) for the full definition.

## Common Distinctions

| Pair | Distinction |
| --- | --- |
| **Evidence / Observation** | Evidence is admitted, durable, and authority-bearing. Observation is a read-only view such as CLI output, dashboard rows, graphs, or bounded excerpts. |
| **Task / WorkItem** | A task is repo-local construction governance for Narada buildout. A `work_item` is a runtime control-plane schedulable unit inside an Operation. |
| **Zone / Crossing Regime / Admission Method** | A Zone has stable authority grammar. A crossing regime is the law on an edge between Zones. An admission method is a concrete check used by a regime, such as review, tests, validation, or operator approval. |
| **Review / Evidence** | Review is an admission method. A review record becomes authority-bearing only when linked to an admissible evidence bundle and accepted by the lifecycle regime. |

## Repo Term: `ops repo`

An **ops repo** (or **operations repo**) is a private repository that contains one or more Operations, plus their knowledge, scenarios, and local configuration.

Created with:

```bash
narada init-repo ~/src/my-ops
```

See [`SEMANTICS.md#ops-repo`](SEMANTICS.md#ops-repo) for the full definition.

## First-Class Runtime Terms

These terms are also defined canonically in [`SEMANTICS.md`](SEMANTICS.md):

| Term | User-Facing? | One-Line Summary |
|------|--------------|------------------|
| [`charter`](SEMANTICS.md#charter) | Yes | Named policy configuration for analyzing a context and proposing actions |
| [`posture`](SEMANTICS.md#posture) | Yes | Safety preset (`observe-only` → `autonomous`) that selects allowed actions |
| [`evaluation`](SEMANTICS.md#evaluation) | No | Structured output envelope produced by charter execution |
| [`decision`](SEMANTICS.md#decision) | No (read-only) | Foreman's authoritative governance outcome for a work item |
| [`outbound handoff`](SEMANTICS.md#outbound-handoff) | No | Durable bridge from foreman decision to executable command |
| [`outbound command`](SEMANTICS.md#outbound-command) | No | Executable command envelope performed by outbound workers |
| [`tool call`](SEMANTICS.md#tool-call) | No | Governed, durable record of a charter's external tool request |
| [`trace`](SEMANTICS.md#trace) | No | Durable charter execution metadata (tokens, latency, model) |
| [`knowledge source`](SEMANTICS.md#knowledge-source) | Yes | Declared reference to external knowledge consumed by a charter |
| [`operator action`](SEMANTICS.md#operator-action) | Yes | Durable request for a human operator to perform a safe mutation |

## Authority Classes

Authority classes distinguish derivation/proposal tools from operator-class actions. See [`SEMANTICS.md`](SEMANTICS.md) for the full policy.

| Class | What it does | Who may use |
|-------|--------------|-------------|
| [`derive`](SEMANTICS.md#authority-derive) | Computes outputs from inputs; no side effects | Any component with inputs |
| [`propose`](SEMANTICS.md#authority-propose) | Produces structured proposals awaiting governance | Charters, domain packs, compilers |
| [`claim`](SEMANTICS.md#authority-claim) | Acquires exclusive rights to a unit | Narada runtime only |
| [`execute`](SEMANTICS.md#authority-execute) | Mutates external state or consumes resources | Narada runtime executors only |
| [`resolve`](SEMANTICS.md#authority-resolve) | Advances lifecycle state | Narada governance only |
| [`confirm`](SEMANTICS.md#authority-confirm) | Acknowledges external effects | Narada confirmation workers only |
| [`admin`](SEMANTICS.md#authority-admin) | Overrides policy or changes structure | Explicit admin posture only |

## What Not to Use

> Canonical version of this table lives in [`SEMANTICS.md#prohibited-terms`](SEMANTICS.md#prohibited-terms).

| Word | Why | Use Instead |
|------|-----|-------------|
| `agent` | Too generic; implies autonomy without governance | `charter` for the policy role, `operation` for the live arrangement |
| `instance` | Implies a running process, not the configured intent | `operation` |
| `deployment` | Implies infrastructure/Ops overhead | `operation` or `ops repo` |
| `workspace` | Too vague; conflicts with editor workspaces | `ops repo` |
| `setup` | A verb, not a noun for the live thing | `operation` |

## Typed Variants

When specificity matters:

- `mailbox operation` — an operation whose source is a mailbox
- `workflow operation` — an operation whose source is a timer/cron schedule
- `webhook operation` — an operation whose source is an inbound HTTP webhook
- `filesystem operation` — an operation whose source is a local filesystem path

See [`SEMANTICS.md#typed-variants`](SEMANTICS.md#typed-variants) for the canonical table.

## Summary

> Users set up and run **operations**. Narada compiles each **operation** into exactly one **scope** and executes them through **charters**, **tool calls**, and effect workers.
