# MCP Injection Loci

Narada launchers distinguish MCP ownership from MCP injection. A surface can be owned by a Host, User Site, or local Site, but a carrier start needs an explicit statement of which loci are injected into that session.

## Loci

- `host`: machine/operator substrate surfaces, such as speech or launcher inspection.
- `user-site`: the operator User Site fabric, such as personal orchestration or cross-site control surfaces.
- `local-site`: the target Site fabric for the agent being started.

## Launch Scope

`McpScope` is the launch-time injection selector. It is not a permission grant and does not change surface ownership. It only decides which loci are made visible to the carrier at startup.

Current admitted launch scopes:

- `all`: default behavior. The launcher intentionally composes available `host`, `user-site`, and `local-site` fabrics and reports any optional missing host/user loci. For Codex this is projected through a generated session-local Codex home; ambient Codex MCP config is not inherited.
- `host`: inject only Host/PC Site fabric. The launcher fails closed if the Host fabric is missing.
- `user-site`: inject only User Site fabric. The launcher fails closed if the User Site fabric is missing.
- `local-site`: inject only the target Site fabric. For Codex this uses a generated session-local Codex home so the user's global Codex MCP config is not inherited.
- `none`: inject no Narada MCP servers. For Codex this uses a generated session-local Codex home with no `mcp_servers` entries.

Registry records may set `McpScope` as a default. Explicit launch arguments override registry defaults.

## Carrier Rule

Carrier adapters must fail closed rather than claim a scope they cannot enforce. If a carrier reads only the launcher-provided MCP fabric by construction, the launch result must say so. If a carrier can otherwise merge ambient user configuration, every scope must use an isolated carrier config/home or equivalent mechanism.

