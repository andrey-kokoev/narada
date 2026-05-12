# narada-proper.task-0017

Status: completed by `narada-proper.task-0024`.

Evidence:
- Carrier: `tools/site-init/site-live-carriers.mjs`
- Test: `tools/site-init/site-live-carriers.test.mjs`
- Audit: `.narada/audit/task-0024-create-site-live-carriers-implementation-audit.json`

Title: Admit and execute create-site MCP registration setup

Goal:
- Add explicit local MCP registration execution for selected Site capabilities after package descriptors and storage setup are admitted.

Acceptance:
- MCP registration is request/response and authority-checked.
- Registered surfaces are visible through capability status.
- No implicit live capability grants or operator-surface/PC mutation.

Former blocker resolved:
- Target-local MCP registration manifest carrier implemented as `site_mcp_registration_transport`.
- Private MCP client config mutation remains outside this carrier and requires separate runtime authority.
