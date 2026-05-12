# Site Init Live Carriers

This directory contains Narada proper helper carriers for greenfield Site creation after the descriptor-only `narada sites create` seed path.

The live carriers are explicit, authority-gated surfaces. They default to `plan`, require `--mutation-authorized` for `apply`, and emit target-local audit evidence at `.narada/admission/live-carrier-audit.jsonl`.

## Carriers

- `site_local_db_init`
- `site_local_storage_hydration`
- `agent_context_memory_local_storage`
- `site_inbox_local_substrate`
- `site_config_local_registry`
- `site_lift_local_adoption`
- `site_mcp_registration_transport`
- `windows_profile_site_binding`

## Examples

```powershell
node tools/site-init/site-live-carriers.mjs --carrier site_local_db_init --mode plan --target-site-root <root> --site-id <site-id> --authority-basis <basis>
node tools/site-init/site-live-carriers.mjs --carrier site_local_db_init --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier site_local_storage_hydration --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-init-verified --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier agent_context_memory_local_storage --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-verified --storage-verified --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier site_inbox_local_substrate --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-verified --storage-verified --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier site_config_local_registry --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-verified --storage-verified --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier site_lift_local_adoption --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-verified --storage-verified --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier site_mcp_registration_transport --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --db-verified --storage-verified --runtime-target codex --mcp-server-json '[{"name":"site-task-lifecycle","transport":"stdio","command":"node","args":["server.mjs"]}]' --mutation-authorized
node tools/site-init/site-live-carriers.mjs --carrier windows_profile_site_binding --mode apply --target-site-root <root> --site-id <site-id> --authority-basis <basis> --mcp-registration-verified --mutation-authorized
```

## Boundaries

These carriers do not import source Site runtime state, `.ai` databases, task or inbox history, checkpoint history, roster state, operator-surface runtime state, PC-locus state, secrets, credentials, or source MCP registrations as target authority.

Agent-context memory local storage writes target-local empty memory store and hydration policy artifacts. It does not copy checkpoint history, execute runtime hydration, own a SQLite dependency for `@narada2/agent-context-memory`, or persist secrets.

Site inbox local substrate writes target-local empty inbox index and publication policy artifacts. It does not import source inbox history, write portable envelope files, promote tasks, publish Git artifacts, or register MCP.

Site config local registry writes target-local empty known-Site registry and probe policy artifacts. It does not scan external roots, mutate another Site, admit trust records, or import target task/inbox DB state.

Site-lift local adoption writes target-local empty adoption catalog and materialization policy artifacts. It does not copy files, install packages, import source runtime state, mutate MCP registrations, or publish catalogs.

MCP registration writes a target-local manifest and stale-live restart evidence. Applying that manifest to a private MCP client remains a separate runtime authority action unless a receiving Site explicitly admits that transport.

Windows profile binding writes a target-local profile binding artifact. It does not mutate real Windows profile files unless a future PC/profile carrier admits that external path.
