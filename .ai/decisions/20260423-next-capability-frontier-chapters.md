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
```

The chapters may overlap in planning. The live-proof line informs the second-operation selection, but the operator-gated execution of `403–405` must not deadlock chapter shaping.

The local self-build runtime chapter depends on the self-governance and agent-runtime chapters already being shaped, but it does not need to wait on a fully landed supervised live proof.

The Workbench v0 Build chapter depends on the local self-build runtime chapter being closed, because it is the concrete implementation of the bounded line named there.
