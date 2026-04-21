# Governance Feedback

Rolling inbox for agent feedback about Narada's task-governed development system.

## What This Is

Governance feedback is different from escalation:

| | Escalation | Governance Feedback |
|---|---|---|
| **Timing** | During a task, before proceeding | During or after a task |
| **Blocking?** | Yes — work stops until answered | No — task completes independently |
| **Goal** | Get a decision to unblock the task | Improve the governing system for future tasks |
| **Where** | `## Escalation Needed` in the task file | New entry in this file |

## Rules

- Agents may append governance feedback to this file.
- Agents must not implement governance changes unless assigned a task that authorizes it.
- Governance feedback must not replace escalation. If the issue blocks the task, use `## Escalation Needed` in the task file.
- If the issue does not block the task, finish the task and add feedback separately.
- Feedback must not contain secrets, private mailbox contents, customer data, or operational credentials.
- Feedback should be concrete and actionable, not general sentiment.
- This is a rolling inbox, not a status tracker — do not create one file per feedback item.

## Format

```md
## YYYY-MM-DD / agent-id / task-id

### Observation

What the agent noticed.

### Friction

What slowed, confused, or distorted the work.

### Suggested Change

Concrete improvement to contracts, tasks, docs, tooling, or process.

### Severity

minor | material | blocking

### Scope

local task | chapter | repo governance | USC-level
```

## Entries

<!-- Append new entries above this comment -->

## Triage

### Checklist for Human Review

- [ ] Read all entries above and classify each as **addressed**, **deferred**, or **needs-discussion**.
- [ ] For **blocking** severity: create a task or escalate within 24 hours.
- [ ] For **material** severity: schedule into the next sprint or maintenance window.
- [ ] For **minor** severity: batch and review monthly.
- [ ] Update `config.uscVersion` in root `package.json` if USC-level feedback indicates schema drift.
- [ ] Run `pnpm exec tsx scripts/triage-governance-feedback.ts` after review to update the summary.

### Automated Summary

Run the triage script from the repo root:

```bash
pnpm exec tsx scripts/triage-governance-feedback.ts
```

This prints:
- Total entry count
- Breakdown by severity (blocking / material / minor)
- Breakdown by scope
- Suggested USC schema areas that may need updates

<!-- End of triage section -->
