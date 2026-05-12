# Windows PowerShell Consuming Site

This guide describes how a future Windows PowerShell Narada Site should consume the reusable first-slice package from the Narada repo. The package is source/contracts/docs/tests; it is not a live Site state export.

## Consume From Repo Package

A future Site should depend on the package artifact or workspace package:

```powershell
pnpm --dir D:\code\narada\packages\site-task-lifecycle build
pnpm --dir D:\code\narada\packages\site-task-lifecycle test
```

The receiving Site then imports descriptor/contract APIs such as:

- `planSiteTaskLifecyclePaths`;
- `initializeSiteTaskLifecycle`;
- `buildReceivingSiteSetupPlan`;
- `decideTaskDbAdapterBoundary`;
- `buildTaskDbAdapterConformanceContract`;
- `buildTaskDbAdapterExecutionRequest`;
- `buildTaskAdmissionWriteRequest`;
- `buildMcpRuntimeBindingRequest`;
- `findDeniedSourceImports`.

## Admit Local Runtime Separately

The receiving Site must create and admit its own local runtime state:

- local initializer execution;
- local concrete adapter outside `@narada2/site-task-lifecycle`;
- local DB mutation through that admitted adapter;
- local MCP registration or transport.

The package can describe requests and conformance checks, but it does not execute SQLite, register live MCP, or carry adapter admission authority.

## Do Not Copy Live Site State

Do not copy these from Narada proper, narada-andrey, or any other source Site:

- `.ai/task-lifecycle.db` or SQLite sidecars;
- `.ai/site-task-lifecycle-admission.json`;
- `.ai/mutation-evidence/task_lifecycle/*`;
- task rows, task history, or inbox history;
- live MCP registration state;
- adapter admission records;
- roster, checkpoint, operator-surface, PC-locus, secret, or identity-specific state.

If any of those appear as inputs, treat them as external evidence only and run the package refusal guards before admission.

## Minimal PowerShell Host Shape

A Windows PowerShell host can keep the package boundary explicit:

```powershell
$RepoRoot = 'D:\code\narada'
$SiteRoot = 'D:\Sites\site-alpha'

pnpm --dir "$RepoRoot\packages\site-task-lifecycle" build

# The Site-specific runtime chooses and admits its own adapter.
# The package remains adapter-interface-only and source-state-refusing.
node "$RepoRoot\packages\site-task-lifecycle\dist\index.js"
```

The final command only proves the built package is addressable. A real Site should call the exported APIs from its admitted CLI/runtime code and record local admission, mutation evidence, DB readback, and MCP smoke evidence under that Site's authority.

## Terminal Claim Boundaries

Reusable package consumption can claim only that the first-slice contracts are available for a future Site to use. It cannot claim live setup until the receiving Site admits and verifies its own initializer, adapter, DB mutation, MCP transport, and evidence readback.
