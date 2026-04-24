# Next Capability Frontier Chapters

> Backlog decision that turns the missing-capabilities frontier into governed chapter programs.

**Date:** 2026-04-23

**Primary input:** `.ai/decisions/20260423-narada-missing-capabilities-frontier.md`

## Decision

The next chapter backlog after the crossing-regime / taxonomy tranches is:

1. **Self-Governance Extraction** (`510–513`)
2. **Agent Runtime First-Class Modeling** (`514–517`)
3. **Second Traveling Operation Selection And Proof** (`518–521`)
4. **Local Self-Build Runtime And Workbench** (`522–525`)
5. **Workbench v0 Build** (`526–529`)
6. **Mail Connectivity Generalization And Provider Boundary** (`531–535`)
7. **Operator Console Substrate Completion** (`536–540`)
8. **Messaging Connectivity Family Boundary** (`541–545`)
9. **Task Lifecycle State Authority Migration** (`546–550`)
10. **Assignment Recommendation Zone And Promotion Crossing** (`552–556`)
11. **Task Lifecycle SQLite Implementation v0** (`562–565`)
12. **Task Lifecycle SQLite Implementation v1** (`566–569`)
13. **Assignment Dispatch And Agent Work Pickup** (`570–573`)
14. **Local Dispatch And Kimi Session Targeting v0** (`575–578`)

## Active Parallel Lines (Not New Chapters)

The following remain active parallel lines, not new chapter definitions:

- `399–405` supervised live proof / email-marketing live dry run
- `431` macOS root contract repair
- `437` Linux root contract repair

These are existing open lines and should be completed or explicitly superseded, not duplicated by new chapter shaping.

They are **inputs to the frontier**, but they do not all block later chapter shaping equally:

- `399–405` remains the supervised live-proof line and should continue in parallel.
- `431` and `437` were root-contract repair lines and are now closed.

The second traveling-operation chapter must remain informed by the live-proof line, but it should not be frozen by the operator-gated execution of Task 403.

## Why These Three

### 1. Self-Governance Extraction

Narada still relies too much on the human operator as the hidden scheduler. This chapter extracts the governed promotion path from recommendation to assignment and reduces hidden manual control.

### 2. Agent Runtime First-Class Modeling

Narada still does not fully model the architect-operator + agent swarm pattern actually used to build it. This chapter makes that runtime legible as a Narada-governed object.

### 3. Second Traveling Operation

Narada needs one more real operation family to prove the topology travels beyond mailbox/email-marketing. This chapter does not assume the operation in advance; it selects one and shapes the first proof.

### 4. Local Self-Build Runtime And Workbench

Narada still uses the human operator and chat transcript as the medium between architect intent and agent execution. This chapter should replace that hidden transport with a bounded local runtime and browser workbench backed by Narada's own governed state.

### 5. Workbench v0 Build

The self-build runtime chapter closed with a concrete bounded implementation line: HTTP adapter, static browser page, control wiring, and fixture-backed verification. This chapter is that implementation line.

### 6. Mail Connectivity Generalization And Provider Boundary

Narada's first mail vertical is anchored in Microsoft Graph / Exchange. To travel across the bulk of real-world operator environments, Narada needs a bounded mail-connectivity family that can admit Gmail / Google Workspace and generic mail providers without smearing adjacent systems like GitHub into "email transport."

### 7. Operator Console Substrate Completion

Narada already has a generic Operator Console layer, but its substrate parity is uneven: Windows is strongest, Cloudflare lacks deep observation parity, and Linux remains read-mostly with no real control path. This chapter completes the existing Operator Console across those substrates.

### 8. Messaging Connectivity Family Boundary

Narada also needs a connectivity family parallel to mail: messaging systems such as Telegram should be modeled as conversational event-stream providers with their own intent and confirmation semantics, not squeezed into the mail boundary.

### 9. Task Lifecycle State Authority Migration

Narada still suffers from raw markdown task mutation bypassing governed lifecycle operators. The principled fix is to move task lifecycle authority into SQLite while preventing duplication between SQLite state and markdown task representations.

### 10. Assignment Recommendation Zone And Promotion Crossing

Narada already has recommendation and promotion machinery, but it is still mostly understood as command behavior rather than as a first-class governed zone. This chapter makes assignment recommendation explicit as its own zone with deterministic input admissibility and deterministic output validation, while preserving the separate governed crossing from recommendation to assignment.

### 11. Task Lifecycle SQLite Implementation v0

The boundary, schema, migration plan, and anti-duplication rules are now defined. The next line is implementation: introduce the SQLite-backed lifecycle store and move the first read/write surfaces onto it without collapsing markdown specification or breaking governed operators.

### 12. Task Lifecycle SQLite Implementation v1

The v0 line established the bounded SQLite lifecycle store, one projection-backed read surface, and one first migrated writer. The next line should extend that implementation deeper into the real operator path so task governance stops depending on markdown lifecycle authority in more than one isolated surface.

### 13. Assignment Dispatch And Agent Work Pickup

Narada can now recommend and promote assignments coherently, but assignment still does not cause agents to start work. The missing runtime boundary is assignment dispatch: the assignee runtime must receive, admit, and pick up work through its own governed zone rather than through chat/manual relay.

### 14. Local Dispatch And Kimi Session Targeting v0

The dispatch and pickup doctrine is now shaped, and principal-to-`kimi-cli` session binding is explicit. The next line is implementation: make local dispatch target the correct principal session and expose a bounded pickup/execution-start path so assignment can begin to cause work without human relay.

## Sequencing

```text
Active parallel proof line:
  399–405 supervised live proof

Backlog chapters:
  510–513 Self-Governance Extraction
  514–517 Agent Runtime First-Class Modeling
  518–521 Second Traveling Operation
  522–525 Local Self-Build Runtime And Workbench
  526–529 Workbench v0 Build
  531–535 Mail Connectivity Generalization
  536–540 Operator Console Substrate Completion
  541–545 Messaging Connectivity Family Boundary
  546–550 Task Lifecycle State Authority Migration
  552–556 Assignment Recommendation Zone And Promotion Crossing
  562–565 Task Lifecycle SQLite Implementation v0
  566–569 Task Lifecycle SQLite Implementation v1
  570–573 Assignment Dispatch And Agent Work Pickup
  575–578 Local Dispatch And Kimi Session Targeting v0
```

The chapters may overlap in planning. The live-proof line informs the second-operation selection, but the operator-gated execution of `403–405` must not deadlock chapter shaping.

The local self-build runtime chapter depends on the self-governance and agent-runtime chapters already being shaped, but it does not need to wait on a fully landed supervised live proof.

The Workbench v0 Build chapter depends on the local self-build runtime chapter being closed, because it is the concrete implementation of the bounded line named there.

The mail-connectivity chapter can proceed in parallel with other implementation lines because it is a boundary/generalization chapter over an already-proven vertical rather than a live execution proof.

The Operator Console substrate-completion chapter can also proceed in parallel: it strengthens an already-existing operator surface rather than inventing a new one.

The messaging-connectivity chapter can proceed in parallel with the mail-connectivity chapter because its main purpose is anti-smear boundary definition and provider fit, not immediate live execution.

The task-lifecycle state-authority chapter can proceed in parallel with the other boundary and implementation lines because it addresses Narada's own governance substrate rather than any one vertical.

The assignment-recommendation chapter can proceed in parallel with those lines because it sharpens Narada's self-governance substrate without forcing immediate runtime automation. Its purpose is to make recommendation a first-class zone and to preserve the governed crossing into assignment.

The Task Lifecycle SQLite Implementation v0 chapter follows the completed 546–550 doctrine line. It is the first concrete implementation chapter for that migration and should be treated as fresh executable work rather than more planning doctrine.

The Task Lifecycle SQLite Implementation v1 chapter follows directly from v0. It is not a new doctrine line. It is the next implementation slice that broadens SQLite-backed task authority into additional read and write surfaces.

The Assignment Dispatch And Agent Work Pickup chapter follows the now-working bounded autoassignment path. It makes assignment actionable by introducing the next runtime zone between assignment and execution.

The Local Dispatch And Kimi Session Targeting v0 chapter follows directly from the shaped dispatch zone and the principal session-binding contract. It is the first bounded implementation slice that should let assignment target a real local agent session instead of stopping at durable assignment state.
