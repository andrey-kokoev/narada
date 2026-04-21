# Task 306 — Document Intelligence-Authority Separation in Narada

Status: opened

## Chapter

Mailbox Operational Trial / Product Identity Closure

## Context

The concept **Intelligence-Authority Separation** has been articulated outside Narada as a general systems concept:

`~/src/thoughts/content/concepts/intelligence-authority-separation.md`

Narada is an instantiation of this concept. Its core operational structure is that AI charter runners may contribute judgment, but they do not own truth, lifecycle, permission, effects, or confirmation.

This insight should be reflected in Narada's internal documentation so new readers understand why the system has facts, work items, evaluations, foreman decisions, intents, workers, and reconciliation instead of a simpler "agent reads mailbox and sends reply" shape.

## Goal

Update Narada documentation to explain Narada as an instantiation of Intelligence-Authority Separation, without turning the docs into branding copy or duplicating long theory text.

## Required Work

1. Add a concise "What Narada Is" or equivalent section near the top of `README.md`.
   - State that Narada is a control plane for AI-operated work.
   - Explain that intelligence contributes judgment while Narada owns authority and consequence.
   - Include the end-to-end boundary sequence:
     `observe -> normalize -> fact -> context -> work -> evaluation -> decision -> intent -> execution -> reconciliation -> observation`

2. Update `SEMANTICS.md` with the canonical internal formulation.
   - Define the separation between `evaluation` and `decision`.
   - State explicitly that model output is evidence, not authority.
   - Connect the concept to existing authority classes and durable boundaries.
   - Avoid importing external concept prose wholesale; summarize the invariant in Narada terms.

3. Update `docs/system.md` with an operational explanation or diagram.
   - Show how Narada prevents collapse between judgment and consequence.
   - Identify which component owns each boundary:
     source/fact admission, context/work formation, charter evaluation, foreman decision, intent/outbound handoff, worker execution, reconciliation, observation.

4. Update `AGENTS.md` documentation index if needed.
   - Add or adjust references so future agents can find the canonical identity/authority explanation.

5. Keep public/private boundaries intact.
   - Do not mention private mailbox addresses, ops repo evidence, Graph IDs, or live trial content.

## Non-Goals

- Do not add code.
- Do not create a new package or concept module.
- Do not rename Narada or rewrite all docs.
- Do not claim Narada is complete or universally applicable.
- Do not copy the entire external concept document into Narada.

## Acceptance Criteria

- [x] `README.md` has a clear first-reader explanation of Narada's identity using Intelligence-Authority Separation.
- [x] `SEMANTICS.md` records the canonical internal invariant: intelligence output is evaluation/evidence, not authority.
- [x] `docs/system.md` explains the boundary sequence and ownership of each transition.
- [x] `AGENTS.md` points agents to the updated canonical docs.
- [x] No private operational data is added.
- [x] No derivative status files are created.

## Execution Notes

- `README.md` — Enhanced "What this is" section with IAS framing, the boundary sequence diagram, and the prevented-collapse table. Kept concise; did not duplicate the external concept document.
- `SEMANTICS.md` — Added §2.13 "Intelligence-Authority Separation" with core invariant, boundary ownership table, authority class connection, evaluation authority definition, and failure modes with Narada defenses.
- `docs/system.md` — Added "Intelligence-Authority Separation" subsection under "Authority Boundaries" with a component ownership table and the structural guarantee that charter runtime is read-only.
- `AGENTS.md` — Added `SEMANTICS.md §2.13` to the documentation index table.
- No private operational data added. No code changes. No derivative status files created.
- `pnpm typecheck` passes across all packages.
