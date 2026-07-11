# Agent CLI Package Authority

`D:\code\narada` is the source authority for the Narada agent CLI carrier and the Narada Agent Runtime Server package.

## Hard Rule

Narada agent-cli and Narada Agent Runtime Server entrypoints are package-owned by Narada proper.

No User Site, client Site, project Site, or PC runtime surface may vendor a mutable
`tools\agent-cli` implementation copy. If a Site needs `agent-cli`, it must launch
the packaged Narada proper binary.

## Canonical Paths

Executable entrypoint:

```text
package: @narada2/agent-cli
bin:     narada-agent-cli
```

Agent Runtime Server entrypoint:

```text
package: @narada2/agent-runtime-server
bin:     narada-agent-runtime-server
```

Launch/materialization code must resolve `narada-agent-runtime-server` from
`@narada2/agent-runtime-server`. The unqualified `agent-runtime-server` alias is
not an admitted package bin.

Provider metadata:

```text
package: @narada2/carrier-provider-contract
export:  ./provider-registry
```

User sites and client sites may declare identities, roles, MCP fabric, policies,
prompts, directives, and runtime state. They must not own carrier implementation,
provider resolution, streaming behavior, slash commands, or directive sideband
semantics.

`C:\Users\Andrey\Narada` is the operator/user-site control surface. It may contain launchers, registry configuration, and operator affordances, but machine-addressable carrier execution delegates to Narada proper's packaged `narada-agent-runtime-server` entrypoint. The runtime server uses `@narada2/carrier-runtime` only for stateless turn adaptation and constructs session control through `@narada2/nars-session-core`; `agent-cli` remains a client/projection package rather than a runtime helper source.

Site-local `start-agent.mjs` files are no longer admitted compatibility shims. Agent startup authority is the packaged `@narada2/agent-start` TypeScript entrypoint, reached through the site PowerShell surface or package bin metadata.

## Client Wrapper Boundary

`Start-AgentCliSession.ps1` is a generated Windows client utility wrapper for
agent-cli inspection/projection commands. It is not the carrier launch path for
`Carrier=agent-cli`; machine-addressable carrier execution goes through
packaged `narada-agent-runtime-server` directly.

The wrapper may:

- resolve the target Site root and workspace root;
- pass launch identity, session, model, provider, and control JSONL path;
- render operator-facing launch status;
- attach `narada-agent-cli` as a client/projection when the operator requests terminal interaction with an existing NARS session;
- read existing NARS session state and recovery summaries through packaged agent-cli commands.

It must not:

- call a Site-local `tools\agent-cli`;
- require an API key for `codex-subscription`;
- fork provider metadata or provider resolution;
- bypass the package-owned carrier queue, directive sideband, or MCP fabric loading.
- start or substitute the `Carrier=agent-cli` runtime server path;
- resolve the runtime server from `@narada2/agent-cli` or any agent-cli compatibility shim.

## Dry-Run Invariant

Workspace launch dry-run is non-executing.

`Start-NaradaWorkspace.ps1 -DryRun` must never open Windows Terminal, spawn carrier
sessions, or wait for operator input. Its result must include
`windows_terminal_invoked: false`.

## Verification

Run the package and cutover checks after changing carrier launch code. For the
registered fleet verifier, use record shards so each command remains bounded;
increase `--record-offset` by the chosen `--record-limit` until the prior shard
reports no more selected records. The verifier also bounds each launch dry-run
with `--launch-timeout-ms`, defaulting to 8500 ms.

```powershell
pnpm --filter @narada2/agent-start test
pnpm --filter @narada2/cli run test:launcher
pnpm --filter @narada2/cli build
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-cli typecheck
pnpm --filter @narada2/agent-runtime-server test
node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy default-only --record-offset 0 --record-limit 1
node packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy agent-tui-only --record-offset 0 --record-limit 1
```
