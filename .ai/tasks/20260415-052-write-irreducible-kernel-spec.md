# Write Irreducible Kernel Spec

## Context

By this point Narada should have:

- Source as ingress discipline
- Fact as the first canonical durable and replay-stable boundary
- policy/context/work layers generalized enough to avoid mailbox privilege
- Intent as the universal durable effect boundary
- multiple vertical proofs

The remaining task is to state the kernel in the shortest non-arbitrary normative form.

## Goal

Write the irreducible kernel spec that describes Narada without mailbox residue and without surplus vocabulary.

## Required Outcome

After this task:

- the repo contains a compact normative kernel spec
- the spec describes only the irreducible core
- mailbox appears as one vertical, not the kernel essence
- implementation/docs/task language align to the spec

## Required Work

### 1. Write the minimal kernel narrative

The spec must articulate, in shortest stable form:

- Source
- Fact
- Context formation
- Work opening
- Policy/Foreman admission
- Intent emission
- Execution
- Confirmation
- Observation

### 2. State invariants explicitly

At minimum include:
- replay determinism
- durable boundaries
- policy as sole gate to effects
- Intent as universal effect boundary
- observation non-authority
- mailbox as one vertical

### 3. Remove residual mailbox privilege from the spec

No kernel section should require:
- conversation_id
- thread semantics
- Graph-specific concepts
- mailbox-specific action assumptions

### 4. Align docs and terminology

Update architecture docs and AGENTS surfaces as needed so the irreducible spec becomes the canonical formulation.

### 5. Validate against implementation

The spec must describe what the repo actually is, not only aspiration.

If gaps remain, state them honestly.

## Invariants

1. The spec must be minimal and normative.
2. It must not smuggle mailbox semantics into kernel law.
3. It must describe real implementation boundaries.
4. It must be short enough to serve as a lawbook, not a marketing deck.

## Constraints

- do not redesign code except for tiny terminology fixes
- do not write a giant philosophy document
- do not keep multiple competing kernel narratives alive
- do not claim closure where implementation still has gaps

## Deliverables

- irreducible kernel spec
- aligned terminology/docs updates
- concise statement of remaining known gaps, if any

## Acceptance Criteria

- the repo has one compact canonical kernel spec
- mailbox is clearly one vertical
- implementation/docs/task language align to the spec
- no competing architecture narratives remain

## Definition of Done

Narada has a portable lawbook for its generalized deterministic kernel.