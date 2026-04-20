# Task 214: Add Advisory Signals Clan To Semantics And Documentation Hierarchy

## Why

Task 213 identifies **soft routing signals** as a first-class family:

- continuation affinity
- capability affinity
- tool-state affinity
- cost preference
- freshness preference
- trust / de-preference

But that family itself appears to belong to a larger clan.

Narada already has strong **authoritative structures**:

- durable boundaries
- lifecycle states
- authority classes
- scheduler/foreman ownership
- intent and confirmation semantics

What is still undernamed is the parallel space of things that matter operationally without becoming truth or authority.

That broader clan is something like:

- `advisory signals`

This likely includes multiple sibling families:

- routing signals
- timing signals
- review signals
- escalation signals
- confidence signals
- cost signals

Without naming the clan, these families will emerge inconsistently and may leak into lower-level docs as if they were authority-bearing mechanisms.

## Goal

Define **advisory signals** as a canonical semantic clan in Narada, distinguish it sharply from authoritative structures, and place it correctly across the documentation hierarchy.

## Core Distinction

Narada should explicitly distinguish:

### Authoritative Structures

These determine:

- what is true
- what is durable
- what is allowed
- what is committed
- what has happened

Examples:

- facts
- contexts
- work items
- decisions
- intents
- executions
- confirmations
- authority classes
- leases

### Advisory Signals

These influence:

- who should probably do the work
- when it is probably best to act
- who should probably review
- what likely deserves attention
- which lane/provider/tool is preferable

But they do **not** determine:

- truth
- permission
- commitment
- correctness

## Required Outcome

Narada gains a documented semantic split between:

- authoritative structures
- advisory signals

And the advisory side is further decomposed into explicit families.

## Required Families To Position

At minimum, document these as members of the advisory-signals clan:

### 1. Routing Signals

Examples:

- continuation affinity
- capability affinity
- tool-state affinity
- cost preference
- trust / de-preference

### 2. Timing Signals

Examples:

- freshness preference
- quiescence preference
- coalescing preference
- wait-briefly vs act-now preference

### 3. Review Signals

Examples:

- same-lane review preference
- cross-lane review preference
- independence-preferred review
- heightened scrutiny preference

### 4. Escalation / Attention Signals

Examples:

- likely-needs-human-attention
- unusually risky
- probably time-sensitive
- likely policy-sensitive

### 5. Confidence / Cost Signals

Examples:

- low-confidence proposal
- high-confidence repetitive task
- expensive lane avoidable
- cheap acceptable lane preferred

Final grouping can differ if a cleaner decomposition emerges, but the clan and sibling-family structure must be explicit.

## Documentation Hierarchy Requirement

This task must place the concept at the correct levels, not dump everything into one file.

### 1. `SEMANTICS.md`

This is where the canonical semantic split belongs.

Required content:

- define `authoritative structures`
- define `advisory signals`
- define the relationship between them
- enumerate the advisory-signal families
- state the hard rule that advisory signals never override authority/correctness invariants

### 2. `packages/layers/control-plane/docs/00-kernel.md`

This should carry only the kernel-relevant consequences:

- advisory signals are non-authoritative
- they may influence routing/timing/review
- they must not override durable or authority invariants

Do **not** overload the kernel doc with full taxonomy details unless needed.

### 3. `packages/layers/control-plane/docs/02-architecture.md`

This should explain where advisory signals sit in runtime architecture:

- which components may emit them
- which components may consume them
- how they interact with scheduler/foreman/operator surfaces

### 4. `AGENTS.md`

This should carry only the practical navigation/invariant surface:

- where to find advisory-signal semantics
- one or two key invariants preventing misuse

Do not duplicate the whole ontology here.

## Non-Goals

- Do not implement every advisory-signal family here
- Do not create a new authority class for advisory signals
- Do not let advisory language blur durable state semantics
- Do not duplicate full semantic text across all docs

## Suggested Resulting Structure

One coherent outcome could be:

- `SEMANTICS.md`
  - authoritative structures
  - advisory signals
  - advisory families
- `00-kernel.md`
  - advisory-signal invariants
- `02-architecture.md`
  - advisory-signal producers/consumers
- `AGENTS.md`
  - navigation + concise invariants

## Verification

Minimum:

```bash
pnpm verify
```

Focused proof:

- docs are non-contradictory across hierarchy
- semantic split is visible in the canonical docs
- no doc implies advisory signals can override authority or truth

## Definition Of Done

- [x] Narada defines `advisory signals` as a canonical semantic clan.
- [x] The distinction between authoritative structures and advisory signals is explicit.
- [x] Advisory-signal families are enumerated at the semantic level.
- [x] The concept is placed coherently across `SEMANTICS.md`, `00-kernel.md`, `02-architecture.md`, and `AGENTS.md`.
- [x] Documentation duplication is controlled; each layer carries only the right level of detail.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Execution Notes

**What landed:**

- `SEMANTICS.md` §2.12 — Added the canonical "Advisory Signals Clan" section defining:
  - `authoritative structures` vs `advisory signals`
  - Five sibling families: routing, timing, review, escalation/attention, confidence/cost
  - Six invariants (non-authoritative, overrideable, no lifecycle side effect, no truth claim, plus two structural rules)
  - Updated §5 and §6 to reference the new section

- `packages/layers/control-plane/docs/00-kernel.md` §4.9 — Added "Advisory Signals Are Non-Authoritative" with kernel-level invariants. Explicitly marks `continuation_affinity` as the only implemented signal; others are illustrative.

- `packages/layers/control-plane/docs/02-architecture.md` — Added "Advisory Signals in Runtime Architecture" section with producers/consumers tables. Explicitly distinguishes `continuation_affinity` (implemented) from all other signals (prospective/design slots). Added four architectural invariants.

- `AGENTS.md` — Added `advisory signals` and `authoritative structures` to the concept table. Added invariants §35–38 to Critical Invariants.

**Intentionally deferred:**

- No new advisory-signal families were implemented in code. Only `continuation_affinity` (pre-existing from Task 212) is concrete in the runtime.
- The producers/consumers tables in `02-architecture.md` document where signals *would* live when implemented, not what is currently emitted or consumed.
- Charter runtime signal fields (`confidence`, `escalations` in `CharterOutputEnvelope`), tool-runner cost metadata, and observation-plane pattern matching are all future work.

**Follow-up:**

- Task 219 corrected present-tense runtime overclaim in `02-architecture.md` and `00-kernel.md` by marking non-`continuation_affinity` signals as prospective/illustrative.
- Task 224 corrected residual present-tense overclaim in `SEMANTICS.md` §2.12 by adding implementation-status notes and marking unimplemented signals as prospective in the family tables.
- When new advisory-signal families are implemented, update the "Implemented vs. Prospective" subsections in `02-architecture.md` and move signals from "Illustrative" to concrete in `00-kernel.md` and `SEMANTICS.md`.
