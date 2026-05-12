# narada-proper.task-0015

Status: completed by `narada-proper.task-0024`.

Evidence:
- Carrier: `tools/site-init/site-live-carriers.mjs`
- Test: `tools/site-init/site-live-carriers.test.mjs`
- Audit: `.narada/audit/task-0024-create-site-live-carriers-implementation-audit.json`

Title: Admit and execute local task-lifecycle DB init from create-site config

Goal:
- Add an explicit local setup path that initializes Site-local task lifecycle storage through an admitted adapter boundary.

Acceptance:
- Create-site can request a separate admitted `task_lifecycle_db_init` execution.
- Mutation evidence and rollback evidence are written locally.
- No arbitrary SQL, no source task DB/history import, no cross-Site mutation.

Former blocker resolved:
- Concrete target-Site local DB init/mutation carrier implemented as `site_local_db_init`.
