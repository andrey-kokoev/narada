# Canonical Inbox

Canonical Inbox is Narada's typed-envelope intake zone. It is not an email mailbox; email is one source among chat, diagnostics, agent reports, file drops, CLI submissions, webhooks, and system observations.

Inbox envelopes are inert. Submitting an envelope does not create a task, execute a command, mutate Site configuration, or author knowledge. An envelope can only be inspected or promoted across an explicit governed crossing.

## CLI Surface

```bash
narada inbox submit --source-kind diagnostic --source-ref site-doctor:desktop-sunroom-2 --kind observation --authority-level system_observed --payload '{"hostname":"desktop-sunroom-2","computer_name":"DESKTOP-SUNROOM"}'
narada inbox work-next
narada inbox list
narada inbox show <envelope-id>
narada inbox task <envelope-id> --title "Fix PC Site identity policy" --by operator
narada inbox triage <envelope-id> --action archive --by operator
narada inbox triage <envelope-id> --action pending --target-kind site_config_change --target-ref site:desktop-sunroom-2 --by operator
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

## Promotion Semantics

Promotion is the governed crossing out of the Inbox. It must not imply more than actually happened.

| Target kind | Behavior |
|-------------|----------|
| `task` | Executed for `task_candidate` and `upstream_task_candidate` envelopes by calling the sanctioned task creation command. Prefer `narada inbox task <envelope-id> --by <principal>`; `inbox promote --target-kind task` remains the canonical compatibility path. The envelope records `enactment_status: enacted` and `target_ref: task:<number>`. Repeating the promotion returns the existing promotion and does not create a duplicate task. |
| `archive` | Records the envelope as `archived` with no target-zone mutation. `--target-ref` is optional. |
| `decision`, `operator_action`, `knowledge_entry`, `site_config_change` | Recorded as `enactment_status: pending` and `pending_kind: recorded_pending_crossing` until those target zones have explicit executable promotion operators. |

An unsupported or not-yet-executable target may be recorded as a pending crossing, but it must not be reported as enacted.

For task promotion, CLI overrides take precedence over payload fields:

```bash
narada inbox task <envelope-id> --by operator --title "..." --goal "..." --criteria "First criterion" --criteria "Second criterion"
```

## Work-Next

`narada inbox work-next` is the bounded operator/agent surface for deciding what to do next. It returns the next received envelope plus admissible actions. It does not mutate the Inbox.

```bash
narada inbox work-next --kind task_candidate --format json
```

The normal loop is:

```bash
narada inbox work-next
narada inbox triage <envelope-id> --action task --by operator
narada inbox triage <envelope-id> --action archive --by operator
narada inbox triage <envelope-id> --action pending --target-kind site_config_change --target-ref site:desktop-sunroom-2 --by operator
```
