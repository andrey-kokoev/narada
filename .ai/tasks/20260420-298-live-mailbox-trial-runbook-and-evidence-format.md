# Task 298 — Live Mailbox Trial Runbook and Evidence Format

status: closed

Depends on: 297

## Context

The operational trial needs a repeatable runbook and evidence format before agents touch the live mailbox. Evidence must be useful for debugging and review while remaining private.

## Goal

Create the live mailbox trial runbook and private evidence schema for `help@global-maxima.com`.

## Required Work

1. Define the operator run sequence:
   - preflight/doctor
   - initial sync or daemon startup
   - operation status inspection
   - work/evaluation/decision inspection
   - draft inspection
   - approval/rejection path
   - send/reconciliation path
   - shutdown/restart check
2. Define private evidence files under the `narada.sonar` trial directory shape from Task 297.
3. Define redaction rules for any public summary:
   - no message body
   - no access tokens or secrets
   - no raw Graph payloads
   - no private personal data unless explicitly approved
4. Define what evidence must be captured for each stage:
   - command run
   - timestamp
   - exit status
   - redacted observation output
   - durable object ids when safe to keep private
   - operator decision
   - observed gap, if any
5. Add a public runbook or public task notes that point to the private evidence shape without exposing private evidence.

## Deliverables

- Public runbook for how to execute and review the live mailbox trial.
- Private evidence schema/template path shape.
- Redaction policy for converting private evidence into public gap tasks.

## Non-Goals

- Do not execute send.
- Do not implement new product behavior unless the runbook cannot be expressed without it.
- Do not publish private evidence.

## Acceptance Criteria

- [x] A controlled operator can follow the runbook without inventing command order.
- [x] Evidence format is sufficient to debug sync, draft, approval, send, and reconciliation.
- [x] Public/private evidence split is mechanically clear.
- [x] The runbook explicitly requires human approval before send.
- [x] No private live mailbox data is added to the public repo.

## Execution Notes

### Deliverables

1. **Public trial runbook** — `docs/live-trial-runbook.md` (new):
   - Condensed 10-step operator sequence
   - References `docs/live-graph-proof.md` for detailed stage mechanics
   - Defines evidence format and private template location
   - Defines redaction policy with explicit keep/redact table
   - States human approval requirement before send
   - Public/private boundary table

2. **Updated public proof doc** — `docs/live-graph-proof.md`:
   - Cross-references to `docs/live-trial-runbook.md` added in intro and Related Documents sections

3. **Private evidence template** — `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/evidence-template.md`:
   - Structured markdown template with stages 0–6 + shutdown
   - Each stage captures: timestamp, exit code, commands, durable IDs, operator decision, pass criterion
   - Includes "Redacted Public Summary" section for gap tasks
   - Includes attachment checklist

4. **Private trial runbook** — `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/TRIAL-RUNBOOK.md`:
   - Exact commands for each stage
   - References `docs/live-graph-proof.md` for pass criteria
   - Redaction rules repeated for operator convenience
   - Evidence checklist

### Alignment with `docs/live-graph-proof.md`

- Private runbook mirrors the 6 proof stages from live-graph-proof.md without contradiction
- Stage numbering and state machine references are consistent
- SQL query shapes match those in live-graph-proof.md
- No duplicate detailed mechanics; private runbook adds exact commands and evidence capture

### Boundary Preservation

- No private message bodies, Graph IDs, or credentials in public repo
- No real mailbox data in public artifacts
- Evidence template and filled records live only in `narada.sonar`
- Redaction policy explicitly forbids message bodies, email addresses, Graph IDs, secrets, and personal data in public artifacts
