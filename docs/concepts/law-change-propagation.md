# Law Change Propagation

Law Change Propagation is the governed path for changes to agent-facing law sources to become visible to active agents without relying on chat memory or fresh prompt luck.

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

## Commands

```bash
narada law change add --issuer operator --summary "..." --files AGENTS.md,SEMANTICS.md --required-roles architect,builder
narada law list
narada law unread --agent builder --role builder
narada law ack <change-id> --agent builder --role builder --operator-surface-identity narada-proper-builder
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
