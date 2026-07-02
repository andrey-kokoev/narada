# Concept Registry

## Objective

Narada needs a first-class way to name, define, bound, relate, own, and evolve its own concepts.

This document defines the target shape with CL > 0.98 for the following semantic split:

- **Concept**: the semantic unit.
- **ConceptRecord**: the stored registry embodiment of one Concept.
- **ConceptRegistry**: the authoritative collection and lookup surface for ConceptRecords.
- **ConceptPromotion**: the governed lifecycle by which an implicit recurring shape becomes an accepted Concept.

The goal is not to add ceremony around every word. The goal is to prevent important Narada meanings from being scattered across task titles, docs, schema names, CLI flags, MCP tool names, implementation details, and operator conversations without one authority record saying what the thing means.

## Problem

Narada repeatedly promotes recurring shapes into named objects:

- `AuthorityGrant`
- `SurfaceAttachment`
- `RuntimeCapabilityProfile`
- `AdmissionPolicy`
- `ProjectionTopology`
- `ObjectLifecyclePolicy`
- `OperatorViewPolicy`
- `EvidencePacket`
- `HostProfile`

Before promotion, these shapes exist as friction:

```text
same ambiguity appears in launcher UX, NARS runtime, MCP policy, task lifecycle, docs, and tests
-> we name it in conversation
-> tasks are created
-> code and docs slowly converge
```

Without a Concept layer, Narada has no canonical place to answer:

- What does this name mean?
- What are its boundaries?
- Which aliases are valid, deprecated, or forbidden?
- Which schemas, docs, tasks, packages, tests, and MCP surfaces embody it?
- Who may change its meaning?
- How does it relate to nearby concepts?
- Is this concept active, draft, deprecated, rejected, or still only observed friction?

A schema alone cannot answer these questions. A schema describes one data representation. A Concept governs the meaning that schemas, docs, code, tests, and tasks should preserve.

## Core Definitions

### Concept

A **Concept** is a Narada semantic unit with identity, definition, boundaries, relations, ownership, and implementation/documentation anchors.

A Concept is not primarily a database row, TypeScript type, JSON schema, task, doc page, or package. Those may be embodiments of the Concept.

A Concept answers:

```text
What is this thing in Narada, what is it not, and what may coherently depend on that meaning?
```

### ConceptRecord

A **ConceptRecord** is the stored registry embodiment of a Concept.

The ConceptRecord is allowed to be structured data. It should carry enough metadata for tools and operators to inspect concept status, ownership, aliases, relations, anchors, and lifecycle without scraping prose.

### ConceptRegistry

A **ConceptRegistry** is the authoritative collection and lookup surface for ConceptRecords.

It should support both human navigation and machine use. It is the semantic registry for Narada concepts, not a generic glossary.

### ConceptPromotion

A **ConceptPromotion** is the governed lifecycle by which an implicit recurring Narada shape becomes an explicit Concept.

Candidate or proposal is only one phase inside ConceptPromotion. The object is the promotion process, not the candidate itself.

## Non-Goals

The Concept Registry must not become:

- a glossary for every ordinary word;
- a replacement for schemas, docs, tests, tasks, or code;
- a bureaucratic gate before small implementation changes;
- a place to hide unresolved design choices behind formal names;
- an authority bypass where naming something grants operational permission;
- an ontology detached from implementation evidence.

A Concept deserves promotion only when the meaning is reused across boundaries or repeated ambiguity is causing real coordination cost.

## ConceptRecord Shape

A ConceptRecord should include at least:

| Field | Meaning |
| --- | --- |
| `concept_id` | Stable machine id, e.g. `surface_attachment`. |
| `canonical_name` | Human canonical name, e.g. `SurfaceAttachment`. |
| `short_definition` | One-sentence meaning. |
| `description` | Longer semantic explanation. |
| `kind` | Entity, relation, policy, protocol, lifecycle, surface, host, artifact, event, capability, or other governed kind. |
| `status` | `observed`, `draft`, `active`, `deprecated`, `rejected`, or `superseded`. |
| `aliases` | Accepted alternate names. |
| `deprecated_aliases` | Names still understood for compatibility but not preferred. |
| `anti_aliases` | Names that must not be treated as equivalent. |
| `boundaries` | What the concept is not. |
| `relations` | Links to other ConceptRecords with relation kinds. |
| `owner_surface` | Package, authority surface, or governance locus that owns semantic changes. |
| `authority` | Who may redefine, deprecate, or promote the concept. |
| `schemas` | Machine schema refs that embody the concept. |
| `docs` | Documentation anchors. |
| `tasks` | Task ids/chapters that implement or change the concept. |
| `code_refs` | Packages/modules that realize the concept. |
| `tests` | Tests or E2E scenarios that prove behavior matches meaning. |
| `examples` | Concrete valid examples. |
| `counterexamples` | Things that look similar but are outside the boundary. |
| `open_questions` | Known unresolved semantic choices. |
| `confidence` | Current confidence level and evidence basis. |
| `reviewed_at` | Last semantic review timestamp. |

## Concept Kinds

Initial concept kinds should be broad and composable:

| Kind | Description |
| --- | --- |
| `entity` | A durable thing with identity, such as an Agent or Site. |
| `relation` | A typed relation between entities, such as SurfaceAttachment. |
| `policy` | A governed rule set, such as AdmissionPolicy or OperatorViewPolicy. |
| `protocol` | A request/event contract or transport-invariant interaction shape. |
| `lifecycle` | State and transition semantics for an object family. |
| `surface` | A user, operator, MCP, or machine-facing interface. |
| `host` | A runtime or deployment locus. |
| `artifact` | Durable evidence/content object semantics. |
| `event` | Event meaning, ordering, and visibility semantics. |
| `capability` | Declared ability of a runtime, surface, or host. |

These kinds should remain small until implementation pressure proves a need for more.

## ConceptPromotion Lifecycle

ConceptPromotion should use a lightweight lifecycle:

```text
observed
-> proposed
-> bounded
-> accepted
-> embodied
-> validated
-> active
```

Terminal or side states:

```text
rejected
superseded
deprecated
```

### Observed

A recurring friction or implicit pattern is noticed.

Evidence examples:

- repeated operator confusion;
- duplicated code classifiers;
- inconsistent docs;
- multiple tasks with the same hidden object;
- launch/runtime/projection failures caused by unclear boundaries.

### Proposed

A name and rough definition are proposed.

The proposal must include why the shape should be promoted instead of staying as a field, helper, or local implementation detail.

### Bounded

The concept is tested against nearby concepts.

This phase must identify:

- what it is;
- what it is not;
- aliases and anti-aliases;
- at least one counterexample;
- known relations.

### Accepted

The meaning is accepted as a Narada concept worth preserving.

Acceptance does not imply full implementation. It means the semantic target is stable enough to write tasks, docs, schemas, and tests against.

### Embodied

The concept has one or more concrete embodiments: docs, schema, code, tests, task chapter, MCP tool, CLI command, UI surface, or runtime behavior.

### Validated

Focused checks prove at least one embodiment follows the concept boundaries.

Validation evidence should cite tests, review, or explicit operator acceptance. A plausible doc is not enough.

### Active

The concept is authoritative for new work. New implementation should use its canonical name and respect its boundaries.

## Promotion Criteria

A shape should be promoted to Concept only when at least one of these is true:

1. It crosses package, runtime, surface, host, or authority boundaries.
2. It affects operator-facing behavior or failure recovery.
3. It changes admission, authority, or mutation semantics.
4. It is already named in multiple tasks/docs/code paths with inconsistent meaning.
5. It determines compatibility or migration posture.
6. It is needed to explain a symmetric topology, such as local/Cloudflare runtime and surface relationships.
7. It provides testable invariants that would prevent recurring regressions.

A shape should not be promoted when:

- it is local to one function or module;
- it is only a convenient implementation type;
- it has no stable boundary yet;
- it is better represented as a field on an existing Concept;
- it has no expected consumers beyond one immediate change.

## Relation To Schemas

A schema is an embodiment of a Concept, not the Concept itself.

Example:

```text
Concept: SurfaceAttachment
Schema: narada.surface_attachment.v1
Docs: docs/concepts/surface-attachment.md
Code: launcher attach path, NARS session index, agent-web-ui attach command
Tests: attach/detach/stale/multi-surface scenarios
Tasks: task 1705
```

Changing a schema may or may not change the Concept. Changing a Concept may require updates to schemas, docs, code, tests, and tasks.

The ConceptRecord should link to schemas but should not be reduced to them.

## Relation To Tasks

Tasks are work orders against concepts; they are not the concepts.

A task may:

- propose a Concept;
- implement a ConceptRecord;
- add a schema embodiment;
- validate an embodiment;
- deprecate an alias;
- migrate code to the active concept.

Task chapters can group concept work, but the ConceptRegistry should remain the semantic authority once concepts are accepted.

## Relation To NARS And Launcher Work

NARS, launcher, operator surfaces, MCP fabric, and Cloudflare projection have been the main pressure surfaces for this document.

Relevant current concept/task chapters include:

- `first-class-system-objects` for system object candidates/tasks 1686-1703;
- `first-class-relationship-policy-objects` for relationship/policy candidates/tasks 1704-1713;
- `launcher-first-class-objects` for launcher-specific first-classization tasks 1664-1673.

These chapters are not the registry. They are work queues that should either create ConceptRecords or update existing ConceptRecords.

## Storage And Authority Target

The first durable step is this architecture document. The target implementation should then introduce a structured ConceptRegistry owned by Narada proper.

Candidate storage shape:

```text
docs/concepts/concept-registry.md        # doctrine and operating rules
concepts/*.concept.json                  # future machine-readable records, if warranted
packages/...                             # future typed schema/loader, if warranted
```

Exact storage should be decided by implementation pressure. The invariant is that ConceptRecords must be inspectable without searching arbitrary prose and must link back to their authority docs and embodiments.

## Example: SurfaceAttachment ConceptRecord

```json
{
  "concept_id": "surface_attachment",
  "canonical_name": "SurfaceAttachment",
  "short_definition": "The relationship between an operator surface instance and an authority runtime session.",
  "kind": "relation",
  "status": "draft",
  "aliases": ["surface attach", "operator surface attachment"],
  "deprecated_aliases": [],
  "anti_aliases": ["runtime session", "browser tab", "operator message"],
  "boundaries": [
    "Not the runtime session itself.",
    "Not the UI process alone.",
    "Not an operator message or admission event."
  ],
  "relations": [
    { "kind": "attaches_to", "concept_id": "authority_runtime_session" },
    { "kind": "uses", "concept_id": "operator_view_policy" },
    { "kind": "observes", "concept_id": "nars_event_subscription" }
  ],
  "owner_surface": "Narada proper launcher/NARS architecture",
  "tasks": [1705],
  "confidence": { "cl": 0.95, "basis": "Repeated attach ambiguity across agent-cli, agent-web-ui, and session index work." }
}
```

## Review Rules

Concept changes should be reviewed differently from ordinary code changes.

A concept review should ask:

1. Is the name canonical and non-misleading?
2. Are boundaries and counterexamples strong enough?
3. Are aliases and deprecated aliases explicit?
4. Does this duplicate an existing Concept?
5. Are relations to nearby Concepts correct?
6. Is authority ownership clear?
7. Are implementation anchors sufficient for the current stage?
8. Is the confidence level supported by evidence?

## Confidence Posture

CL > 0.98 for this document's target shape:

- `Concept` is the correct domain term.
- `ConceptRecord` is the correct stored-registry embodiment term.
- `ConceptRegistry` is the correct authoritative collection term.
- `ConceptPromotion` is the correct lifecycle/process term.
- The Concept layer is not equivalent to schemas plus documentation.

Residual uncertainty is implementation detail, not semantics:

- exact storage format;
- whether machine-readable records should live under `docs/concepts`, `concepts/`, or a package-owned registry directory;
- which package should eventually expose ConceptRegistry validation and query APIs.

Those choices can be made in implementation tasks without changing the semantic split defined here.
