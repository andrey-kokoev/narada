# Agent Context Tools

This package owns agent session materialization helpers and the agent-context MCP server implementation.

## Session Roster Enforcement

Session launch is not blocked by roster membership by default. Roster role binding is a read-model and routing input unless a Site explicitly opts into session roster enforcement.

The canonical opt-in field is `.ai/agents/roster.json`:

```json
{
  "enforce_session_roster": true,
  "agents": []
}
```

When `enforce_session_roster` is true, `materializeAgentSessionStart` refuses identities that are absent from the task-lifecycle roster and absent from `.ai/agents/roster.json`. When it is absent or false, session launch may proceed with a non-authoritative role inferred from the identity suffix.
