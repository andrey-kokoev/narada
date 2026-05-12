# External Handoff Protocol v0

This is Narada proper's manual v0 intake path for external handoff packets from narada-andrey.

## Boundary

narada-andrey may prepare handoff packets, but it does not gain mutation authority in Narada proper. Incoming packets are external evidence until Narada proper records an admission, defer, or reject decision.

Do not copy narada-andrey `.ai` databases, task history, inbox history, checkpoints, rosters, operator-surface bindings, PC-locus state, secrets, tokens, credentials, or private operator preferences.

## Intake Location

Place copied handoff packet files under:

```text
.narada/inbox/external-handoffs/
```

If copying the full packet is not appropriate, record a reference to the external packet path in `.narada/admission/pending-handoffs.json` instead. A path reference is still pending evidence, not Narada proper truth.

## Manual Protocol

1. narada-andrey prepares a handoff packet.
2. The operator or an admitted carrier copies the packet into `.narada/inbox/external-handoffs/` or records an external `source_ref`.
3. Narada proper appends a `handoff_received` event to `.narada/admission/admission-ledger.jsonl`.
4. Narada proper lists or updates the packet in `.narada/admission/pending-handoffs.json`.
5. A later Narada proper review records one of:
   - `handoff_admitted`
   - `handoff_deferred`
   - `handoff_rejected`

## Pending Handoff Shape

Each pending handoff entry uses:

```json
{
  "source_site": "narada-andrey",
  "source_ref": "path-or-local-copy",
  "received_at": "YYYY-MM-DD",
  "status": "pending_review",
  "summary": "Short human-readable description"
}
```

Allowed v0 statuses:

- `external_orientation_pending_admission`
- `pending_review`
- `admitted_orientation_only`
- `admitted_requirement`
- `deferred`
- `rejected`

## Decision Ledger

`.narada/admission/admission-ledger.jsonl` is the local append-only decision record for v0. Supported decision events include:

- `seed_created`
- `handoff_received`
- `handoff_admitted`
- `handoff_deferred`
- `handoff_rejected`

MCP is intentionally out of scope for v0. The manual path is enough until repeated intake work earns automation.
