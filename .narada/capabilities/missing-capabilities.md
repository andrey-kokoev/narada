# Missing Capabilities

Narada proper now has admitted first-slice Site-local machinery for:

- Site task-lifecycle MCP first slice: `site_task_lifecycle.plan_init`, `site_task_lifecycle.admit_task`, and `site_task_lifecycle.read_task`.
- Windows-native Site package-set self-adoption artifacts for local DB, hydration manifest, empty agent-context memory store, empty inbox/config/lift registries, MCP registration descriptor, and Windows profile binding descriptor.
- Cross-Site Operator Surface delivery from `narada-andrey.Kevin` to `narada.architect` as a request/response delivery capability.

Remaining missing or not-yet-admitted capabilities:

- richer task lifecycle MCP beyond the first slice, including claim, finish, review, close, work-next, list/query, and richer transitions;
- inbox admission/read-path MCP beyond target-local empty substrate descriptors;
- agent-context live hydration execution and checkpoint/resume history;
- native shell policy for Narada proper runtime work;
- live capability grants, credential grants, external Windows profile mutation, operator-surface runtime mutation, and PC-locus mutation;
- source Site import/migration/lift from narada-andrey or any other existing Site.

Until those capabilities are admitted or installed, do not treat narada-andrey MCP surfaces, rosters, inboxes, checkpoints, or task lifecycle databases as Narada proper authority.

Recommended next capability decision: admit a narrow local slice only when it names the target authority, carrier/surface, mutation boundary, verification, rollback, and no-import evidence. Continue to reject runtime database, task-history, inbox-history, checkpoint-history, roster, operator-surface runtime, PC-locus, secrets, credentials, and source-history imports.
