---
status: closed
closed: 2026-04-22
depends_on: [384, 385]
---

# Task 397 — Session Attachment Semantics for Sites and Agents

## Execution Mode

Planning mode is required before edits.

The agent must first list:
- Intended write set
- Invariants at risk
- Whether this task is documentation-only or introduces code
- Focused verification scope

Do not run broad test suites unless implementation code is changed and focused verification is insufficient.

## Assignment

Define Narada's canonical session attachment semantics for operator and agent interaction with Sites.

This task is motivated by the useful design shape of `shpool`: persistent named sessions, detach without death, reattach without losing context, single attached client by default, and minimal interference with native terminal/UI idioms. Narada must learn from that shape without becoming a terminal multiplexer or treating session logs as authority.

## Context

Narada now has:
- Sites as runtime loci
- Cycles as bounded execution attempts
- Acts as governed side-effect requests
- Traces as non-authoritative evidence
- An operator console / Site registry
- Mechanical agent roster tracking

What is still underdefined is how a human operator or external agent attaches to ongoing work, disconnects, resumes, or transfers control without confusing session persistence with authority.

The goal is not to implement a terminal session manager. The goal is to define the Narada-level object model and invariants for attachment.

## Required Reading

- `SEMANTICS.md §2.14` — Aim / Site / Cycle / Act / Trace
- `SEMANTICS.md §2.13` — Intelligence-Authority Separation
- `docs/product/operator-loop.md`
- `docs/product/first-operation-proof.md`
- `docs/deployment/cloudflare-site-materialization.md`
- `docs/deployment/windows-site-materialization.md` if present; otherwise inspect `packages/sites/windows/README.md`
- `.ai/tasks/20260421-378-384-operator-console-site-registry.md`
- `.ai/tasks/20260421-385-mechanical-agent-roster-tracking.md`

## Required Work

1. Define the session object vocabulary.

   At minimum decide and document whether Narada needs one or more of:
   - `OperatorSession`
   - `AgentSession`
   - `SiteAttachment`
   - `ControlAttachment`
   - `ResumeContext`

   Use precise names. Do not overload `operation`.

2. Define lifecycle states.

   Cover at least:
   - attached
   - detached
   - stale
   - transferred
   - closed

   State clearly which transitions are authoritative and which are advisory.

3. Define authority rules.

   The design must preserve:
   - Attachment is not authority by itself.
   - At most one active controller may hold mutable control over a given control locus unless an explicit shared-control policy exists.
   - Detach does not fail a Cycle.
   - Disconnect does not abandon work.
   - Reattach reconstructs context from durable state, not from raw terminal scrollback.
   - Trace/log output is evidence, not truth.

4. Define resume context.

   Specify what should be shown when an operator or agent reattaches:
   - Site identity
   - Aim / operation specification
   - latest Cycle state
   - pending Acts
   - failed or stale attention items
   - current claimant/controller if any
   - recent Trace summary

   The summary must be derived from durable state and read-only projections.

5. Define detach/transfer semantics.

   Include:
   - voluntary detach
   - forced detach of stale attachment
   - transfer from one agent/operator to another
   - budget-exhausted continuation handoff
   - crash/disconnect recovery

6. Map to existing surfaces.

   Identify how this relates to:
   - `.ai/agents/roster.json`
   - `.ai/tasks/assignments/`
   - operator console Site registry
   - `continuation_affinity`
   - Site health / Trace records
   - CLI `narada ops` or future attach/resume commands

7. Produce a decision artifact.

   Create:
   - `.ai/decisions/20260422-397-session-attachment-semantics.md`

   The artifact must include:
   - object model
   - lifecycle table
   - authority invariant table
   - resume context fields
   - explicit non-goals
   - implementation recommendations

8. Update canonical docs by reference only.

   Add concise references where appropriate, likely:
   - `SEMANTICS.md`
   - `AGENTS.md`
   - `docs/product/operator-loop.md`

   Do not duplicate the full doctrine across multiple docs.

## Non-Goals

- Do not implement a terminal multiplexer.
- Do not shell out to `shpool`.
- Do not add daemon/session persistence code unless the design proves a tiny change is necessary.
- Do not change task claim/release behavior unless a clear invariant gap is discovered.
- Do not rename existing `AgentSession` fields opportunistically.
- Do not create a generic collaboration framework.

## Acceptance Criteria

- [x] Decision artifact exists at `.ai/decisions/20260422-397-session-attachment-semantics.md`.
- [x] Session vocabulary is precise and does not overload `operation`.
- [x] Attachment, authority, detach, transfer, and resume are distinguished.
- [x] Resume context is defined as a projection from durable state, not scrollback/log authority.
- [x] Single-active-controller default is explicitly stated.
- [x] Existing roster/task assignment/continuation-affinity surfaces are mapped.
- [x] Canonical docs reference the decision without duplicating it.
- [x] No derivative task-status files are created.

## Execution Notes

Task completed prior to Task 474 closure invariant. Decision artifact created at `.ai/decisions/20260422-397-session-attachment-semantics.md` (21512 bytes) containing full object model, lifecycle table, authority invariant table, resume context fields, and implementation recommendations. Session vocabulary uses `AgentSession`, `OperatorSession`, `SiteAttachment`, `ResumeContext` without overloading `operation`. Canonical docs (`SEMANTICS.md`, `AGENTS.md`, `docs/product/operator-loop.md`) updated by reference only.

## Verification

Verified by inspecting `.ai/decisions/20260422-397-session-attachment-semantics.md` and searching canonical docs for session-attachment references.
