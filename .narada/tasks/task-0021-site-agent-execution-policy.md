# narada-proper.task-0021

Title: Add Narada proper MCP-only agent execution policy

Source:
- Envelope: `env_caffd9c1-aa39-4154-ba8b-73808ead35d9`
- Payload ref: `mcp_payload:p_4452d59440f14193a6f9ac84@v1`
- Source ref: `codex-chat:2026-05-11:operator-send-narada-proper-site-config-gap`

Authority basis:
- Operator-confirmed observation targeted at `narada-proper`.
- Narada proper mutation authority is limited to `.narada` Site authority/evidence files for this task.

Problem:
- `.narada/site.json` was a minimal seed and did not declare an MCP-only `agent_execution_policy`.
- Startup did not require agents/carriers to observe MCP-only posture, native-shell denial, allowed MCP entrypoints, or stop-on-missing-MCP-capability behavior.

Goal:
- Add explicit Narada proper `agent_execution_policy` to `.narada/site.json`.
- Add startup verification for MCP-only posture.
- Record durable task/audit/ledger evidence.

Scope:
- `.narada/site.json`
- `.narada/bootstrap/startup.md`
- `.narada/bootstrap/agent-execution-policy-startup.md`
- `.narada/tasks/task-0021-site-agent-execution-policy.md`
- `.narada/audit/task-0021-site-agent-execution-policy-audit.json`
- `.narada/admission/admission-ledger.jsonl`

Acceptance:
- `agent_execution_policy.default_posture` is `mcp_only`.
- Native shell is denied by default except recorded break-glass operator authorization.
- Shell-like operations must route through admitted audited MCP surfaces.
- Missing MCP capability behavior is to stop and report, not fall back.
- Startup verification names the checks.

Non-goals:
- No carrier implementation.
- No live MCP registration.
- No native shell grant.
- No import of User Site runtime state.
