# Task 124: Comprehensive Semantic Architecture Audit

## Why

Narada has advanced quickly in implementation depth and architectural ambition. As a result, there are increasing signs of **semantic cavities** across the system.

By "semantic cavities" we mean places where Narada lacks one or more of the following:

- a precise canonical object
- a stable name for that object
- a clear boundary between adjacent objects
- a crisp atomicity/composition rule
- a clear authority owner for that object
- a coherent mapping between user-facing and internal concepts

These cavities are now appearing across multiple layers:

- user-facing language
- operational model
- control-plane ontology
- runtime responsibility boundaries
- repository / artifact model
- package and public surface naming

Point-fixing them one by one without a full audit would likely create semantic drift rather than coherence.

## Goal

Perform a comprehensive semantic architecture audit of Narada, producing:

1. a canonical inventory of objects and terms across the system
2. an explicit list of semantic cavities
3. a classification of those cavities by area
4. a proposed authoritative resolution for each cavity
5. a concrete follow-up task split by area

## Scope

This task must inspect the full semantic stack of Narada.

### 1. User-Facing Ontology

Examples of candidate objects/terms:

- Narada
- ops repo / operations repo
- operation
- posture
- readiness
- activation
- status
- health
- demo
- trial
- example
- scenario

Questions to answer:

- what are the canonical user-facing objects?
- which words are canonical vs deprecated vs internal-only?
- which user concepts are currently missing precise names?

### 2. Operational Ontology

Examples:

- mailbox operation
- workflow operation
- webhook operation
- atomic vs composite operation
- multi-operation repos

Questions:

- what is the atomic unit of operation?
- what composition is allowed or disallowed?
- what higher-level grouping concepts, if any, exist?

### 3. Lifecycle Semantics

Examples:

- shape
- setup
- preflight
- readiness
- activation
- running
- quiescence
- status
- health

Questions:

- what is the exact relation between these states/concepts?
- which are user-facing, which are operational, which are internal?
- where is the lifecycle model incomplete or overlapping?

### 4. Control-Plane Ontology

Examples:

- context
- revision
- work item
- execution attempt
- evaluation
- session
- trace
- intent / outbound handoff / outbound command
- lease

Questions:

- what are the canonical control-plane objects?
- where do names overlap or drift?
- which control-plane objects are not yet well integrated into user/operator language?

### 5. Runtime Authority Semantics

Examples:

- daemon
- foreman
- scheduler
- charter runner
- tool runner
- executor
- reconciler
- worker registry

Questions:

- which component owns what?
- where do responsibilities drift?
- where is a boundary implemented but not semantically settled?

### 6. Artifact / Repository Ontology

Examples:

- public source repo
- ops repo
- examples repo
- config
- schema
- tasks/specs
- knowledge sources
- scenarios
- notes

Questions:

- what is each artifact class for?
- what belongs in which repo?
- where are artifact roles still semantically muddy?

### 7. Package / Public Surface Semantics

Examples:

- kernel
- cli
- daemon
- search
- charters
- verticals
- layers
- domains

Questions:

- do package names match conceptual ownership?
- where are compatibility surfaces or internal/public distinctions still semantically unclear?
- where does package structure still fail to teach the right model?

## Required Outputs

### 1. Canonical Object Inventory

Produce a structured inventory of Narada's canonical objects and terms, grouped by area.

For each object/term, identify:

- canonical name
- layer/area
- definition
- user-facing or internal
- atomic or composite (if applicable)
- current authority owner

### 2. Semantic Cavities List

Produce an explicit list of semantic cavities.

Each cavity should state:

- what is missing or conflicting
- why it matters
- which parts of the system it affects

### 3. Resolution Proposal Per Cavity

For each cavity, propose one authoritative resolution.

Avoid open-ended brainstorming lists. The point is to dearbitrize the ontology.

### 4. Follow-Up Task Split

From the audit, derive concrete follow-up tasks grouped by area.

These tasks should be implementation- or documentation-driving, not abstract restatements.

## Non-Goals

- Do not immediately perform all fixes in this task
- Do not collapse into vague philosophical prose
- Do not produce an unbounded taxonomy document with no operational consequence
- Do not rewrite the whole repo during the audit itself

## Deliverables

- comprehensive semantic audit document
- canonical inventory of objects and terms
- explicit cavity list with proposed resolutions
- ordered follow-up tasks by area

## Definition Of Done

- [ ] Narada's semantic stack has been audited across user, operational, control-plane, runtime, artifact, and package layers
- [ ] canonical objects and terms are explicitly enumerated
- [ ] semantic cavities are explicitly named rather than only felt intuitively
- [ ] each cavity has a proposed authoritative resolution
- [ ] follow-up corrective tasks are derived by area

## Notes

This task should precede additional piecemeal terminology or ontology fixes. The purpose is to make semantic coherence a first-class engineering concern across all of Narada.
