# Windows PowerShell Consuming Site

Future Windows PowerShell Narada Sites should consume `@narada2/agent-context-memory` from the Narada repo package or a published package artifact. They should not copy a live Site's agent-context database, checkpoints, sessions, operator-surface bindings, or PC runtime state.

## Package Consumption

```powershell
$RepoRoot = 'D:\code\narada'
pnpm --dir "$RepoRoot\packages\agent-context-memory" build
pnpm --dir "$RepoRoot\packages\agent-context-memory" test
```

The receiving Site may import package APIs from its admitted local CLI/runtime code:

- `buildNamedAgentRegistryFragment`;
- `buildSessionStartContract`;
- `buildCheckpointDescriptor`;
- `buildHydrationRequestDescriptor`;
- `buildAgentContextSchemaInitPlan`;
- `buildMcpRegistrationDescriptor`;
- `buildCapabilityRegistryFragment`;
- `findDeniedSourceImports`.

## Local Admission Required

The receiving Site must admit its own local storage adapter, MCP transport, runtime hydration execution, and checkpoint persistence before any live memory function is claimable. This package only describes contracts and refusal boundaries.

## Do Not Copy

Do not copy:

- `.ai/state/agent-context.sqlite` or equivalent agent-context DBs;
- checkpoint files or session logs from another Site;
- `.ai/agents/roster.json`;
- task or inbox databases/history;
- operator-surface bindings;
- `C:\ProgramData\Narada\sites\pc\...` runtime state;
- secrets, tokens, credentials, private preferences, or identity-specific state.

If such paths appear as source evidence, run refusal guards and treat them as external evidence only.
