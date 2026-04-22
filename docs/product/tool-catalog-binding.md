# Tool Catalog Binding

> How operations bind to tools owned by the systems they support.

Narada uses the **Tool Locality Doctrine** from [`SEMANTICS.md`](../../SEMANTICS.md):

```text
System repo owns tool implementation.
Operation repo owns tool binding and permission.
Narada runtime owns mediation, audit, timeout, and authority enforcement.
```

## Roles

| Layer | Owns | Must Not Own |
|-------|------|--------------|
| System repo | Diagnostic scripts, safe query wrappers, schema assumptions, `.env` naming, local runbooks | Operation permission |
| Operation repo | Tool catalog references, charter permissions, authority class binding, timeouts, approval requirements | System-local diagnostics or copied secrets |
| Narada runtime | Tool-call validation, subprocess/HTTP execution, timeout, audit, result classification | Domain-specific interpretation beyond the tool contract |

## System Repo Shape

A supported system should expose Narada-compatible tools near the code and environment they inspect:

```text
~/src/sonar.cloud/
  .env
  .narada/
    tool-catalog.json
    tools/
      git-read.sh
      git-write.sh
      psql-readonly.sh
      sentry-search.sh
    README.md
```

Example catalog:

```json
{
  "version": 1,
  "tools": [
    {
      "tool_id": "sonar.git.read",
      "command": "./tools/git-read.sh",
      "authority_class": "derive",
      "read_only": true
    },
    {
      "tool_id": "sonar.git.write",
      "command": "./tools/git-write.sh",
      "authority_class": "execute",
      "read_only": false,
      "requires_approval": true
    },
    {
      "tool_id": "sonar.db.query_readonly",
      "command": "./tools/psql-readonly.sh",
      "authority_class": "derive",
      "read_only": true
    },
    {
      "tool_id": "sonar.sentry.search",
      "command": "./tools/sentry-search.sh",
      "authority_class": "derive",
      "read_only": true
    }
  ]
}
```

## Operation Repo Binding

An operation repo references catalogs and grants a bounded subset to charters:

```json
{
  "tool_catalogs": [
    {
      "type": "local_path",
      "path": "/home/andrey/src/sonar.cloud/.narada/tool-catalog.json"
    }
  ],
  "policy": {
    "allowed_actions": ["draft_reply", "tool_request", "no_action"],
    "allowed_tools": [
      "sonar.git.read",
      "sonar.db.query_readonly",
      "sonar.sentry.search",
      "sonar.git.write"
    ],
    "require_human_approval": true
  }
}
```

The catalog says what is technically available. The operation policy says what is permitted.

## Invariants

- Tool implementation belongs with the system being diagnosed or acted upon.
- Tool permission belongs with the Narada operation.
- Tool execution must pass through Narada runtime mediation.
- A tool catalog is not an authority grant.
- Read-only diagnostic tools should use `authority_class: "derive"`.
- Mutating tools require `authority_class: "execute"`, `requires_approval: true`, and an operation policy that requires human approval.
- Email-originated requests for mutating tools are only proposals. They must become pending `operator_action_requests`, pass identity-provider confirmation, and execute through the canonical operator-action path.
- Ops repos must not copy `.env`, DB wrappers, Sentry wrappers, or source-tree assumptions from system repos.

## Sonar Example

For `narada.sonar`, Sonar-specific capabilities should live in `~/src/sonar.cloud/.narada/`. The `narada.sonar` operation should reference that catalog and grant selected tools to support charters. Read-only tools can be used for diagnostics; mutating tools such as `sonar.git.write` must remain approval-gated.

This lets the support mailbox answer product incidents with system-local diagnostics while preserving Narada's authority boundary.

If a user emails "commit and push this fix", the email can create an inert request or draft explanation. It cannot run `sonar.git.write`. The write becomes possible only after a configured operator contact confirms through Microsoft/Entra and Narada executes the safelisted action through `executeOperatorAction()`.
