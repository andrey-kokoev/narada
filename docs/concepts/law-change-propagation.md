# Law Change Propagation

Law Change Propagation is the governed path for changes to agent-facing law sources to become visible to active agents without relying on chat memory or fresh prompt luck.

Operator law changes travel as durable law records and, when propagation must reach active agents or sibling embodiments, as Canonical Inbox notices. OSM, terminal text, chat, or voice notification may point to the notice, but they are not the authority medium.

Law sources include:

- `AGENTS.md`
- `SEMANTICS.md`
- role doctrine and role bootstrap docs
- `.ai/task-contracts`
- Site governance coordinates
- configured Site-local law sources

## Records

A law change record lives at `.ai/law/changes/<change-id>.json` and contains:

- `change_id`
- changed `files`
- source `commit` when known
- `summary`
- `scope`
- `required_roles`
- `affected_agents`
- `effective_scope`
- `supersedes`
- `references`
- `notice_envelope_id`
- `issuer`
- `issued_at`
- affected `law_sources`

An agent law receipt lives at `.ai/law/receipts/<agent>__<change-id>.json` and contains:

- `agent_id`
- `role`
- `session_id` or `operator_surface_identity` when available
- `change_id`
- `read_at`
- `acknowledged_at`
- `status`
- optional `questions_or_blockers`

The receipt proves only that the agent acknowledged reading the law change. It does not grant authority, admit evidence, bind a runtime handle, bypass role/locus/capability rules, or prove that the agent understood correctly.

When a law change affects governed work admission, the receipt becomes one input to [Site Qualification Policy](../product/site-qualification-policy.md). Qualification decides whether the receipt plus competence evidence is enough to keep admitting a principal for a specific Site work class.

## Receipt State Machine

Law propagation uses one explicit receipt state machine:

| State | Meaning |
| --- | --- |
| `issued` | A law change exists and applies to the role or agent, but no receipt exists yet. |
| `seen` | The agent has seen the notice but has not acknowledged or absorbed it. Legacy `read` is normalized to `seen`. |
| `acknowledged` | The agent acknowledges receipt and may continue if no blocker exists. |
| `absorbed` | The agent records that the law has been incorporated into current operating posture. |
| `blocked` | The agent records a question or blocker. Legacy `question` is normalized to `blocked`. |
| `expired` | A mandatory applicable notice has no clearing receipt past the local timeout posture. |
| `escalated` | The timeout/blocker has been routed through a governed escalation path. |

`issued`, `blocked`, `expired`, and `escalated` block ordinary agent work admission. `seen`, `acknowledged`, and `absorbed` clear the unread gate. Expired or blocked notices surface an escalation proposal command; they do not silently disappear.

## Commands

```bash
narada law change add --issuer operator --summary "..." --files AGENTS.md,SEMANTICS.md --required-roles architect,builder
narada law change add --issuer operator --summary "..." --required-roles architect,builder --notice
narada law list
narada law unread --agent builder --role builder
narada law ack <change-id> --agent builder --role builder --status seen --operator-surface-identity builder
narada law ack <change-id> --agent builder --role builder --status absorbed
narada law status --agent builder --role builder
```

`law change add --dry-run` previews the record without mutation.

## Admission

Affected work-admission commands must check unread mandatory law changes before mutation. In the first implementation, `task claim` and `task finish` block with `law_update_required` when an agent has unread changes applicable to its role.

The startup or normal duty loop for an agent is:

```bash
narada law status --agent <agent-id> --role <role>
narada law unread --agent <agent-id> --role <role>
narada law ack <change-id> --agent <agent-id> --role <role>
```

Architect, Builder, and Observer use the same receipt mechanism. Operator may issue changes and may inspect receipt state, but Operator acknowledgement is not substituted for agent receipt.

Receipt and absorption are separate:

- `seen`: the agent has seen the notice but has not accepted absorption.
- `acknowledged`: the agent acknowledges receipt and may continue if no blocker exists.
- `absorbed`: the agent records that the law has been incorporated into its current operating posture.
- `blocked`: the agent records uncertainty or a blocker; this does not clear admission.

Unread mandatory notices must appear in duty-loop surfaces before ordinary task recommendations. If a notice remains unacknowledged past the local timeout posture, the correct result is an explicit inbox observation/proposal for escalation, not silent drift.
