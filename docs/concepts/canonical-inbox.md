# Canonical Inbox

Canonical Inbox is Narada's typed-envelope intake zone. It is not an email mailbox; email is one source among chat, diagnostics, agent reports, file drops, CLI submissions, webhooks, and system observations.

Inbox envelopes are inert. Submitting an envelope does not create a task, execute a command, mutate Site configuration, or author knowledge. An envelope can only be inspected or promoted across an explicit governed crossing.

## CLI Surface

```bash
narada inbox submit --source-kind diagnostic --source-ref site-doctor:desktop-sunroom-2 --kind observation --authority-level system_observed --payload '{"hostname":"desktop-sunroom-2","computer_name":"DESKTOP-SUNROOM"}'
narada inbox list
narada inbox show <envelope-id>
narada inbox promote <envelope-id> --target-kind task --target-ref task:pc-site-identity-policy --by operator
```

## Envelope Axes

| Axis | Purpose |
|------|---------|
| `source` | Where the item arrived from |
| `kind` | What the item means |
| `authority` | What force the item has |
| `status` | Intake lifecycle state |
| `promotion` | Optional target after governed promotion |

## Example

The Windows PC-locus friction where `hostname` reports `desktop-sunroom-2` while `%COMPUTERNAME%` reports `DESKTOP-SUNROOM` should enter as an observation envelope first. It can later be promoted to a task or site configuration policy only after the operator accepts that crossing.
