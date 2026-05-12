# narada-proper.task-0016

Status: completed by `narada-proper.task-0024`.

Evidence:
- Carrier: `tools/site-init/site-live-carriers.mjs`
- Test: `tools/site-init/site-live-carriers.test.mjs`
- Audit: `.narada/audit/task-0024-create-site-live-carriers-implementation-audit.json`

Title: Admit and execute local agent-context memory storage init

Goal:
- Add a separate admitted local setup path for agent-context checkpoint memory storage and hydration contracts.

Acceptance:
- Named-agent registry fragments, session/checkpoint contracts, and local storage descriptors can be materialized.
- Runtime hydration remains gated by explicit local admission.
- No source checkpoint history, agent-context DB, secrets, or identity smear import.

Former blocker resolved:
- Concrete local storage/hydration carrier implemented as `site_local_storage_hydration`.
