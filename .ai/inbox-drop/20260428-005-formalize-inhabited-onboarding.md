# Formalize Inhabited Onboarding

Kind: task_candidate
Source: codex-user-site
Authority: operator_confirmed
Principal: andrey

## Trigger

While onboarding the Staccato Narada Site, it became clear that we were doing more than setup. We were walking real operational situations through the Site and letting the Site discover its boundaries, routing rules, runtime dependencies, and upstream machinery gaps.

This should be a formal Narada lifecycle phase, not an ad hoc conversation.

## Proposed Concept

Define **Inhabited Onboarding** as a canonical Site lifecycle phase:

```text
bootstrap -> inhabited onboarding -> operational steady state
```

Meaning:

> A Site is created, but not considered mature until real or representative operations have passed through it and its authority boundaries, intake routes, runtime dependencies, and effect policies have been observed and recorded.

## Proposed Process Shape

1. Declare Site Aim
   - What the Site is for.
   - What authority it owns.
   - What it must not own.

2. Declare Loci
   - User/client/data/ELT/PC/runtime/subordinate operations.
   - Which locus owns which mutation classes.

3. Install Minimum Substrate
   - AGENTS.
   - config.
   - inbox.
   - KB.
   - tasks/chapters.
   - runtime state policy.
   - credential references.

4. Run First Real Situations
   - Actual incoming mail, files, tasks, data questions, runtime errors, or representative fixtures.

5. Observe Friction
   - Each stumble becomes a Site-local fix, upstream Narada proposal, or deliberate residual.

6. Classify Boundaries
   - Intake routes.
   - authority limits.
   - effect permissions.
   - privacy/credential rules.
   - sync/runtime state locations.

7. Create Operation Charters
   - Recurring work becomes an Operation or subordinate Site candidate.

8. Prove First Loops
   - Example: message admitted -> classified -> charter invoked -> draft/brief created -> human review.

9. Publish Readiness State
   - What is live.
   - What is pending router/tooling.
   - What remains manual bridge.

10. Exit Criteria
   - Common first workflows are routable, observable, and safe.

## Staccato Evidence

The Staccato onboarding revealed that mailbox sync proof was insufficient. We also needed:

- mailbox runtime proof,
- delegated CLI embodiment health,
- operation placement,
- operation-intake routing,
- missing-information draft behavior,
- no-send/no-Klaviyo/no-list-import boundary,
- identity rule for replies (`Staccato Narada`, not `Global Maxima Support Team`).

## Execution Request

Create and execute Narada proper work to document and, where appropriate, scaffold Inhabited Onboarding as a Site lifecycle process with checklist, artifacts, commands or templates, and exit criteria.

This should be generic to Sites, but Staccato can serve as the first concrete example.
