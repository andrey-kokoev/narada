# Canonical Admission Rejection Ledger

The Canonical Admission Rejection Ledger is the Site-local authority record for candidate admission decisions. It records what was considered, admitted, rejected, deferred, or superseded.

Rejection is evidence, not silence. A candidate that is rejected should leave a durable trace with reason codes and evidence references so it does not disappear, re-enter unnoticed, or get reinterpreted later without context.

## Command Surface

```bash
narada admission record \
  --candidate-id <id> \
  --source-kind file_drop \
  --source-ref .ai/inbox-drop/001.md \
  --candidate-kind envelope \
  --decision rejected \
  --reasons duplicate,out_of_scope \
  --evidence-refs inbox-dry-run:123 \
  --by operator

narada admission list --decision rejected
narada admission explain <decision-id>
```

The v0 ledger persists at:

```text
.ai/admission-rejection-ledger.json
```

## Decision Shape

Each ledger entry records:

| Field | Meaning |
| --- | --- |
| `decision_id` | Durable decision identifier |
| `candidate_id` | Stable id for the considered candidate |
| `source_kind`, `source_ref` | Where the candidate came from |
| `candidate_kind` | What kind of thing was considered |
| `decision` | `admitted`, `rejected`, `deferred`, or `superseded` |
| `reason_codes` | Machine-readable reasons |
| `evidence_refs` | Evidence used for the decision |
| `decided_by` | Principal or system actor recording the decision |
| `system_rule` | Optional rule that made or assisted the decision |
| `authority_level` | Authority level of the decision |
| `resulting_envelope_id` | Envelope id when admitted |
| `supersedes`, `retry_of` | Links to prior candidates or decisions |
| `observed_at`, `decided_at` | Candidate and decision timestamps |

## Relationship To Canonical Inbox

Canonical Inbox stores typed envelopes after admission. The ledger stores candidate decisions before or around admission. This keeps rejected file-drop items, rejected mailbox candidates, deferred Site absorption material, and superseded proposals visible without forcing all of them into the inbox as active work.

## Relationship To Appeal And Grievance

The ledger records candidate admission decisions. [`Canonical Appeal And Grievance`](canonical-appeal-grievance.md) defines the governed path for challenging those decisions after they exist.

A rejected, deferred, or superseded candidate may be appealed when the filing principal has standing and can name grounds such as missing evidence, wrong authority, procedural error, new evidence, or misclassification. The appeal does not erase or edit the ledger entry. If successful, it creates a new governed outcome such as admitted, remanded, superseded, or clarified.

## V0 Boundary

This v0 provides the durable ledger and CLI. Intake adapters should be migrated incrementally to write ledger decisions during dry-run/admit flows. The first expected integrations are human file-drop intake and mailbox participant-domain filtering.
