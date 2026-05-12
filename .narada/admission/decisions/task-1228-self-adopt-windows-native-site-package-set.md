# Task 1228 Self-Adoption Decision

Decision: admit and apply the Windows-native Site package/live-carrier set to Narada proper's existing `.narada` Site as target-local substrate.

Target locus:

- Site id: `narada-proper`
- Repo root: `D:\code\narada`
- Site root: `D:\code\narada\.narada`

Authority basis: `narada_proper_self_adoption_task_1228`.

Admitted carrier sequence:

- `site_local_db_init`
- `site_local_storage_hydration`
- `agent_context_memory_local_storage`
- `site_inbox_local_substrate`
- `site_config_local_registry`
- `site_lift_local_adoption`
- `site_mcp_registration_transport`
- `windows_profile_site_binding`

Result: all carriers planned, applied, and verified against Narada proper's local Site root.

Evidence:

- `.narada/admission/live-carrier-audit.jsonl`
- `.narada/audit/task-1228-self-adopt-windows-native-site-package-set.json`
- `.narada/capabilities/self-adopted-windows-native-site-package-set.json`

No-import posture:

- No narada-andrey/User Site runtime DB, task history, inbox history, checkpoint history, roster state, operator-surface state, PC state, secrets, credentials, or identity-specific runtime state was imported.
- `@narada2/agent-context-memory` remains descriptor/local-store oriented here; runtime hydration is not executed.
- `@narada2/site-inbox` local substrate is present; publication and task promotion are not executed.
- `@narada2/site-config` local registry substrate is present; external probe execution and trust mutation are not executed.
- `@narada2/site-lift` local adoption catalog is present and empty; file copy, package installation, bootstrap, and source Site migration are not executed.
- MCP registration is target-local manifest evidence only; private MCP client config mutation remains not claimed.
- Windows profile binding is a target-local artifact only; external profile mutation remains not claimed.

Terminal claim: Narada proper now uses the Windows-native package/live-carrier set as its own `.narada` Site substrate, bounded to target-local files and audit evidence.
