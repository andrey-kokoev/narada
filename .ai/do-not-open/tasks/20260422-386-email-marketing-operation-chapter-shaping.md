---
status: closed
closed: 2026-04-22
depends_on: [377, 384]
---

# Task 386 — Email Marketing Operation Chapter Shaping

## Assignment

Create the chapter plan for Narada's first non-helpdesk Operation: an email-marketing operation that turns inbound colleague/customer requests into governed campaign work.

This is a planning/chapter-shaping task. Do not implement Klaviyo, mailbox sync, or Windows runtime behavior in this task.

## Read First

- `SEMANTICS.md`
- `docs/product/operator-console-site-registry.md`
- `docs/product/operator-loop.md`
- `docs/deployment/windows-site-materialization.md`
- `docs/deployment/windows-site-boundary-contract.md`
- `.ai/do-not-open/tasks/20260421-371-377-windows-site-materialization.md`
- `.ai/do-not-open/tasks/20260421-378-384-operator-console-site-registry.md`

## Context

Narada has proven a helpdesk/mailbox vertical and has now materialized Site substrates (Cloudflare, Windows/WSL) plus the beginning of a cross-Site operator console.

The next non-helpdesk target is an **email marketing operation**:

> Watch inbound requests from designated colleagues or sources, understand requests for Klaviyo email campaigns, extract campaign requirements, draft campaign briefs or safe follow-up responses, and route any Klaviyo mutation through durable intents and approval gates.

This must be shaped as a Narada **Operation**, not as an ad-hoc script, chatbot, or direct Klaviyo automation.

## Goal

Produce a coherent chapter DAG that can drive Narada toward a Windows 11-capable email-marketing Operation without violating core invariants.

The chapter should define what has to exist before the Operation is useful:

- operation contract;
- source/fact model;
- charter and knowledge binding;
- Klaviyo intent boundary;
- Windows Site real-cycle wiring;
- operator console fit;
- credential-required handling.

## Required Work

1. Produce a decision/inventory document under `.ai/decisions/`.

   It must answer:

   - What is the Operation's Aim?
   - What are the source facts?
   - What durable boundaries are needed?
   - What actions are allowed only as drafts/intents?
   - What actions are forbidden in v0?
   - Which existing Narada components are reused?
   - Which new vertical/domain components are required?
   - Which parts belong in public Narada vs private ops repositories?

2. Define the chapter DAG.

   Create `.ai/do-not-open/tasks/20260422-387-392-email-marketing-operation.md` or the smallest correct range.

   The DAG must include only executable tasks, not decorative categories.

3. Create self-standing follow-up tasks.

   Expected task families:

   - **Operation Contract**: define the email-marketing Operation boundary, posture, and non-goals.
   - **Campaign Request Fact Model**: define canonical facts extracted from inbound email.
   - **Campaign Charter + Knowledge Binding**: define charter behavior, required knowledge sources, and missing-info escalation.
   - **Klaviyo Intent Boundary**: define durable intents for draft campaign work and forbid publish/send in v0.
   - **Windows Site Real-Cycle Wiring**: identify what must be wired for Windows to run the operation end-to-end.
   - **Operator Console Fit**: ensure pending campaign drafts, missing credentials, and missing campaign info surface correctly.

4. Preserve authority boundaries.

   The chapter must explicitly preserve:

   - Intelligence does not publish or send marketing campaigns.
   - Klaviyo mutations must be durable intents before execution.
   - Any publish/send action is out of scope for v0 unless separately approved by operator policy.
   - Missing credentials and missing campaign data become operator attention items.
   - Private brand/customer knowledge belongs in ops repos or configured knowledge sources, not public Narada package code.

5. Define Windows 11 posture.

   The chapter must say what is required for Windows 11:

   - Site root and credential binding;
   - scheduled Cycle execution;
   - mailbox source access;
   - Klaviyo API credential access;
   - operator console/CLI inspection.

6. Do not over-generalize.

   This is the first non-helpdesk Operation. Do not extract a universal marketing automation framework or generic SaaS connector abstraction unless evidence forces it.

## Non-Goals

- Do not implement Klaviyo API calls.
- Do not implement real Windows Site cycle wiring.
- Do not create private customer/brand data.
- Do not add examples containing private operational data.
- Do not rename existing Narada ontology.
- Do not create derivative task-status files.

## Execution Notes

### Decision/Inventory Document

Created `.ai/decisions/20260422-386-email-marketing-operation-shaping.md` covering:
- Aim statement in crystallized vocabulary
- Source facts (`mail.message.discovered` + `campaign.request.discovered`)
- Durable boundaries (reuse vs. new)
- Allowed/forbidden actions table
- Authority boundaries
- Reused components inventory
- New components required
- Public/private data boundary
- Windows 11 requirements
- Risk acknowledgments

### Chapter DAG

Created `.ai/do-not-open/tasks/20260422-387-394-email-marketing-operation.md` with 8-task DAG:
- 387 Operation Contract
- 388 Campaign Request Fact Model
- 389 Campaign Charter + Knowledge Binding
- 390 Klaviyo Intent Boundary
- 391 Windows Site Real-Cycle Wiring
- 392 Operator Console Fit
- 393 Integration Proof
- 394 Chapter Closure

### Follow-Up Tasks

Created 8 self-standing task files (387–394). Each contains:
- Assignment, context, goal
- Required work with concrete deliverables
- Non-goals
- Acceptance criteria

### Vocabulary Discipline

Used SEMANTICS.md §2.14 throughout:
- Aim: "Turn inbound colleague campaign requests into governed Klaviyo campaign work"
- Site: Windows 11 native or WSL
- Cycle: bounded sync-evaluate-govern-handoff-reconcile pass
- Act: campaign draft (candidate) or confirmed Klaviyo mutation
- Trace: evaluation, decision, execution attempt, operator action

No `operation` smear. No "marketing automation framework" abstraction.

### Verification

Document-only task. Verified:
- DAG is acyclic
- Task numbers are sequential and unused
- Each task file is self-standing (executable from `execute <number>` alone)
- Authority boundaries are explicit in all task files
- Klaviyo publish/send is forbidden in v0 in contract doc and task 390

## Execution Mode

Start in planning mode before editing. The plan must name:

- intended write set;
- invariants at risk;
- dependency assumptions;
- focused verification scope.

## Acceptance Criteria

- [x] Decision/inventory document exists under `.ai/decisions/`.
- [x] A chapter DAG file exists for the email-marketing Operation tasks.
- [x] Follow-up tasks are self-standing and executable by number alone.
- [x] The Operation boundary explicitly distinguishes facts, work, evaluation, decision, intent, execution, and observation.
- [x] Klaviyo publish/send is forbidden or explicitly residualized for v0.
- [x] Windows 11 requirements are concrete and not hand-waved.
- [x] Public/private data boundary is explicit.
- [x] No implementation code is added in this task.
- [x] No derivative task-status files are created.
