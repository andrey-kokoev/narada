# Agent CLI Package Authority

`D:\code\narada` is the source authority for the Narada agent CLI carrier.

## Hard Rule

Narada agent-cli is package-owned by Narada proper.

No User Site, client Site, project Site, or PC runtime surface may vendor a mutable
`tools\agent-cli` implementation copy. If a Site needs `agent-cli`, it must launch
the packaged Narada proper binary.

## Canonical Paths

Executable entrypoint:

```text
package: @narada2/agent-cli
bin:     narada-agent-cli
```

Provider metadata:

```text
package: @narada2/agent-cli
export:  ./intelligence-providers
```

User sites and client sites may declare identities, roles, MCP fabric, policies,
prompts, directives, and runtime state. They must not own carrier implementation,
provider resolution, streaming behavior, slash commands, or directive sideband
semantics.

`C:\Users\Andrey\Narada` is the operator/user-site control surface. It may contain launchers, registry configuration, and operator affordances, but it delegates carrier execution to Narada proper's packaged `narada-agent-cli`.

Site-local `start-agent.mjs` files are no longer admitted compatibility shims. Agent startup authority is the packaged `@narada2/agent-start` TypeScript entrypoint, reached through the site PowerShell surface or package bin metadata.

## Wrapper Contract

`Start-AgentCliSession.ps1` is the standard Windows interactive wrapper. It may:

- resolve the target Site root and workspace root;
- pass launch identity, session, model, provider, and control JSONL path;
- render operator-facing launch status;
- choose the packaged `narada-agent-cli` binary.

It must not:

- call a Site-local `tools\agent-cli`;
- require an API key for `codex-subscription`;
- fork provider metadata or provider resolution;
- bypass the package-owned carrier queue, directive sideband, or MCP fabric loading.

## Dry-Run Invariant

Workspace launch dry-run is non-executing.

`Start-NaradaWorkspace.ps1 -DryRun` must never open Windows Terminal, spawn carrier
sessions, or wait for operator input. Its result must include
`windows_terminal_invoked: false`.

## Verification

Run the package and cutover checks after changing carrier launch code:

```powershell
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-cli typecheck
pwsh -NoProfile -File C:\Users\Andrey\Narada\tools\agent-start\Test-AgentCliPackageCutover.ps1
```
