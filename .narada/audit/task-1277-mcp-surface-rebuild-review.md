# Task 1277 MCP Surface Rebuild Review

Date: 2026-05-15
Reviewer: narada.architect
Reviewed commits: `2f6446b1`, `45294baf`
Disposition: needs_repair

## Findings

1. High: The current Narada proper MCP package still delegates core live tools through the CLI distribution path while claiming `depends_on_cli_dist=false`.

   Evidence: `packages/narada-proper-mcp/src/commands/process.ts` resolves Windows invocation to `process.execPath` plus `packages/layers/cli/dist/main.js`, and `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts` asserts that behavior. The launcher and capability registry describe the new MCP runtime as not depending on CLI dist. This violates the directive to decouple agent-facing MCP runtime from the monolithic CLI dist path.

2. High: `site_task_lifecycle.admit_task` is a separate ad hoc task admission substrate, not canonical task lifecycle materialization.

   Evidence: `packages/narada-proper-mcp/src/server.ts` defines its own `task_records`, `task_evidence_refs`, and `task_admission_events` schema and writes it through `sqlite3.exe`. Those rows are not canonical task lifecycle rows/specs/assignments and are not claimable by Builder work-next without later materialization. This matches the observed Builder blocker around inert MCP-admitted task rows.

3. Medium: Narada proper agent start writes PC-locus carrier-session records by default without an explicit capability/governed crossing in the launch result.

   Evidence: `tools/agent-start/start-agent.mjs` defaults `NARADA_PC_SITE_ROOT` to `C:/ProgramData/Narada/sites/pc/desktop-sunroom-2` and `materializePcCarrierSession` writes into `runtime/carrier-sessions` on non-dry-run launches. This may be intended, but it is a cross-locus mutation and should be represented as an admitted PC Site crossing, not just launch evidence.

4. Medium: Break-glass native shell can be enabled with no authority reference.

   Evidence: `nativeShellExceptionStatus` reports `enabled_by_break_glass_flag` while `authority_basis` may be `null`. Default-off posture is preserved, but the enabling event is under-evidenced unless `NARADA_NATIVE_SHELL_AUTHORITY_REF` is required or the launcher refuses missing authority basis.

5. Low: The server contains a callable-but-unlisted `narada_ee_run` branch.

   Evidence: `NARADA_MCP_TOOLS` lists only `narada_ee_mcp_doctor`, but `callTool` still has a `narada_ee_run` case. It refuses execution as superseded, but hidden callable vocabulary should be removed or advertised as refused-only diagnostic posture.

## Positive Evidence

- The old `narada-mcp` facade is demoted in capability metadata.
- Launcher-generated Codex config mounts only `narada-proper` and explicitly withholds `narada-andrey` MCP servers.
- Package tests and build pass.
- Startup hydration is exposed as the declared startup affordance.
- Claude Code and Narada-native carrier slices are represented without admitting execution.

## Verification

- `git show --stat --oneline --find-renames 2f6446b1`
- `git show --stat --oneline --find-renames 45294baf`
- `pnpm --filter @narada2/narada-proper-mcp test`
- `pnpm --filter @narada2/narada-proper-mcp build`
- Direct source inspection of `packages/narada-proper-mcp/src/server.ts`, `packages/narada-proper-mcp/src/commands/process.ts`, `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts`, and `tools/agent-start/start-agent.mjs`

## Recommended Repair

- Replace CLI-dist delegation in `packages/narada-proper-mcp` with target-local service/library calls or a declared stable CLI embodiment that does not contradict `depends_on_cli_dist=false`.
- Either make `site_task_lifecycle.admit_task` explicitly inert and expose a governed materialize/route transition, or materialize canonical task lifecycle rows/specs directly through the canonical task-governance service boundary.
- Record PC carrier-session writes as an explicit PC Site crossing or make them dry-run/planned unless a capability grant is present.
- Require a non-null authority reference for `--enable-native-shell`.
- Remove or explicitly advertise/refuse `narada_ee_run`.
