# Narada Terminology

This document is a user-facing quick reference. For the complete canonical ontology — including identity lattice, core abstractions, invariant derivations, and all first-class runtime terms — see [`SEMANTICS.md`](SEMANTICS.md).

## Primary User-Facing Term: `operation`

An **operation** is the live configured thing a user sets up and runs.

Users create, configure, preflight, activate, and run **operations**. Each operation maps to exactly one internal `scope`.

See [`SEMANTICS.md#operation`](SEMANTICS.md#operation) for the full definition, typed variants, and relationship to `scope`.

## Internal Technical Term: `scope`

A **scope** is the internal runtime/config representation of an operation.

Users should not need to know the word "scope" to use Narada successfully.

See [`SEMANTICS.md#scope`](SEMANTICS.md#scope) for the full definition.

## Repo Term: `ops repo`

An **ops repo** (or **operations repo**) is a private repository that contains one or more operations, plus their knowledge, scenarios, and local configuration.

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
