# Startup Sequence Contract

An admitted launcher-known Site must expose enough MCP surface for a carrier to hydrate identity, read startup posture, and dereference large startup output.

Minimum startup tools:

- `startup_sequence`
- `agent_context_hydrate_current`
- `mcp_output_show`

These tools are read-only startup posture tools. They do not grant mutation authority.

If a carrier cannot see these tools, it must report a launch-affordance defect instead of guessing state or bypassing through native shell.

The adjacent coherence gate checks declared startup contract presence from Site-local MCP surface registries:

```powershell
node tools\mcp-fabric\adjacent-coherence-gate.mjs --pretty
```

Generated conservative registries may include these read-only tools for `agent-context` surfaces because startup hydration is part of the carrier contract, not a task or mailbox mutation.

This is declaration evidence only. Runtime proof still requires an MCP handshake/tool-list or launch smoke against the carrier session.
