# Agent Execution Policy Startup Verification

This checklist is part of Narada proper startup/hydration posture.

Required checks:

1. Read `.narada/site.json`.
2. Confirm `agent_execution_policy.schema` is `narada.agent_execution_policy.v0`.
3. Confirm `agent_execution_policy.default_posture` is `mcp_only`.
4. Confirm `agent_execution_policy.native_shell.granted` is `false`.
5. Confirm `agent_execution_policy.shell_like_operations.required_route` is `admitted_audited_mcp_surface`.
6. Confirm `agent_execution_policy.shell_like_operations.missing_capability_behavior` is `stop_and_report_missing_mcp_capability`.
7. Confirm allowed MCP entrypoints are derived from `.narada/capabilities/mcp-surfaces.json` or admitted Narada proper surface records.

Startup refusal:

- If a requested action requires shell-like execution and no admitted audited MCP surface exists, stop and report the missing MCP capability.
- Do not fall back to native shell, raw scripts, raw SQL, or cross-Site mutation.

Break-glass posture:

- Native shell may be used only under explicit operator break-glass authorization and must be recorded as evidence.
- Break-glass use does not amend the default Site policy.
