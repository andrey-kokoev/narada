# Narada MCP Facade

Narada MCP is a typed agent-facing facade over Narada's canonical application services.

It is not a second authority surface. MCP tools must delegate to the same command/service functions used by CLI operators, return the same canonical identifiers, and preserve mutation evidence whenever a tool mutates durable state.

## Boundary

| Layer | Role |
|------|------|
| CLI | Durable operator/admin surface and shell-facing command grammar. |
| MCP | Typed protocol facade for agents and tools that need schemas instead of shell construction. |
| Application services | Canonical implementation of task, inbox, Site, routing, and execution behavior. |
| Stores/evidence | Authority-bearing state and replayable mutation evidence. |

MCP may improve ergonomics. It may not bypass approval, lifecycle, evidence, or crossing regimes.

## Initial Surface

The v0 server is exposed as:

```bash
narada-mcp
```

It speaks JSON-RPC over stdio and implements:

- `initialize`
- `tools/list`
- `tools/call`

Initial tools:

| Tool | Authority posture |
|------|-------------------|
| `narada_inbox_doctor` | Read-only readiness inspection. |
| `narada_inbox_work_next` | Read-only by default; `claim=true` performs the same claim transition as the inbox command. |
| `narada_inbox_list` | Read-only inbox inspection. |
| `narada_inbox_show` | Read-only envelope inspection. |
| `narada_inbox_submit_observation` | Mutating inbox submission with read-back confirmation and canonical mutation evidence. |

## Expansion Rule

Add MCP tools only when all of these are true:

1. The backing command/service already exists or is introduced in the same change.
2. The tool calls that backing implementation directly.
3. Mutating tools emit the same evidence as CLI.
4. The tool schema preserves dry-run, approval, and execution separation.
5. The tool response includes canonical ids needed for follow-up inspection.

If a desired MCP tool would require inventing new authority behavior, implement that behavior in the canonical service first, then expose it through MCP.
