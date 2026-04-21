# Live Trial Runbook

> Public trial runbook for the mailbox operational trial (Tasks 297–302). This document defines the operator sequence, evidence format, and redaction policy. Detailed stage mechanics are in [`docs/live-graph-proof.md`](live-graph-proof.md).

---

## Trial Identity

| Field | Value |
|-------|-------|
| **Operation** | `help-global-maxima` |
| **Mailbox** | `help@global-maxima.com` |
| **Private ops repo** | `~/src/narada.sonar` |
| **Config path** | `config/config.json` |
| **Evidence directory** | `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/` |

---

## Operator Sequence (Condensed)

1. **Preflight** — `narada doctor`, `narada ops`, verify no stuck work
2. **Trigger inbound** — Send test email to mailbox
3. **Sync** — `narada sync --mailbox help-global-maxima -c config/config.json`
4. **Verify inbound** — Check work item opened in coordinator DB
5. **Wait for evaluation** — Poll `evaluations` table for charter output
6. **Inspect draft** — Query `outbound_handoffs` + `outbound_versions`
7. **Operator disposition** — Approve, reject, or mark reviewed
8. **Verify send** — If approved, wait for `submitted` status
9. **Verify reconciliation** — Sync again, check `confirmed` status
10. **Shutdown/restart** — Clean stop, verify health, restart

For detailed stage descriptions, pass criteria, and canonical SQL queries, see [`docs/live-graph-proof.md`](live-graph-proof.md).

---

## Evidence Format

Trial evidence is captured in the private ops repo using a structured template.

**Private evidence template:**
`~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/evidence-template.md`

The template records for each stage:
- Timestamp and exit status
- Commands run
- Durable object IDs (work item, evaluation, decision, outbound)
- Operator decision and rationale
- Observed gaps

**Attachments directory:**
`~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/`

Subdirectories:
- `screenshots/` — CLI or UI screenshots
- `sql-dumps/` — Query outputs from coordinator DB
- `decisions/` — Exported decision records

---

## Redaction Policy

Private evidence may contain real mailbox facts. Public repo artifacts must never contain:

| Category | Rule |
|----------|------|
| **Message bodies** | Never include email body text in public artifacts |
| **Email addresses** | Replace with pseudonyms (`customer-a@example.com`) |
| **Graph IDs** | Redact draft IDs, message IDs, internet message IDs |
| **Secrets** | Never include tokens, credentials, or `.env` values |
| **Personal data** | Remove names, titles, or identifying details unless explicitly approved |

**What is safe to include publicly:**
- Status transition chains (`pending → draft_creating → draft_ready`)
- Error classes and codes
- Timing observations
- Structural config observations (not values)
- Work item IDs and evaluation IDs (these are internal Narada identifiers)

**Redaction workflow:**
1. Fill out the full evidence template in the private repo
2. Copy the "Redacted Public Summary" section into a public gap task
3. Review against the table above before posting

---

## Human Approval Requirement

The trial runbook **explicitly requires human approval before send**.

- The config posture for this trial is `draft-only` by default (`allowed_actions` excludes `send_reply`)
- If `send_reply` is added to test live send, `require_human_approval` must remain `true`
- The operator disposition step (Stage 6) is the mandatory approval gate
- The `approve-draft-for-send` command is audited to `operator_action_requests`

---

## Public / Private Boundary

| Artifact | Location |
|----------|----------|
| Proof contract and stage mechanics | [`docs/live-graph-proof.md`](live-graph-proof.md) (public) |
| Trial runbook and evidence format | This document (public) |
| Private operator commands and SQL | `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/TRIAL-RUNBOOK.md` (private) |
| Filled evidence records | `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/evidence-*.md` (private) |
| Trial attachments | `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/screenshots/`, `sql-dumps/`, `decisions/` (private) |

---

## Related Documents

- [`docs/live-graph-proof.md`](live-graph-proof.md) — Detailed proof stages, pass criteria, and state machine
- [`docs/operational-trial-setup-contract.md`](operational-trial-setup-contract.md) — Setup prerequisites and repo layout
- [`docs/first-operation-proof.md`](first-operation-proof.md) — Fixture-backed proof without live credentials
- [`docs/operator-loop.md`](operator-loop.md) — Daily operator rhythm
