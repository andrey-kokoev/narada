# Missing Capabilities

Narada proper now has admitted first-slice Site-local machinery for:

- Site task-lifecycle MCP first slice: `site_task_lifecycle.plan_init`, `site_task_lifecycle.admit_task`, and `site_task_lifecycle.read_task`.
- Windows-native Site package-set self-adoption artifacts for local DB, hydration manifest, empty agent-context memory store, empty inbox/config/lift registries, MCP registration descriptor, and Windows profile binding descriptor.
- Cross-Site Operator Surface delivery from `narada-andrey.Kevin` to `narada.architect` as a request/response delivery capability.

## Adopted Descriptor And Policy Postures 2026-05-13

- Richer task lifecycle MCP is represented by `.narada/capabilities/task-lifecycle-expanded-mcp.json` as a descriptor-only candidate. Only `site_task_lifecycle.plan_init`, `site_task_lifecycle.admit_task`, and `site_task_lifecycle.read_task` are live.
- Site-local inbox MCP is represented by `.narada/capabilities/site-inbox-mcp.json` as a descriptor-only candidate. Live inbox DB mutation and source inbox import remain not admitted.
- Agent-context checkpoint/hydration MCP is represented by `.narada/capabilities/agent-context-memory-mcp.json` as a descriptor-only candidate. Live hydration execution and checkpoint history import remain not admitted.
- Live authority grants and external mutation powers are represented by `.narada/capabilities/live-authority-grants.json` as denied-by-default policy.
- Source Site import/migration/lift is represented by `.narada/capabilities/source-site-import-migration.json` as a refusal policy distinct from greenfield template/catalog Site creation.

## Remaining Live Capability Gaps

- live richer task lifecycle MCP beyond the first slice, including claim, finish, review, close, work-next, list/query, and richer transitions;
- live inbox admission/read-path MCP execution beyond descriptor posture;
- live agent-context hydration execution and checkpoint/resume writes beyond descriptor posture;
- admitted native shell carrier for Narada proper runtime work, if ever explicitly needed;
- live capability grants, credential grants, external Windows profile mutation, operator-surface runtime mutation, and PC-locus mutation;

## Separate Non-Live Design Gaps

- separately designed source Site import/migration/lift from narada-andrey or any other existing Site.

Until those capabilities are admitted or installed, do not treat narada-andrey MCP surfaces, rosters, inboxes, checkpoints, or task lifecycle databases as Narada proper authority.

Recommended next capability decision: admit a narrow local slice only when it names the target authority, carrier/surface, mutation boundary, verification, rollback, and no-import evidence. Continue to reject runtime database, task-history, inbox-history, checkpoint-history, roster, operator-surface runtime, PC-locus, secrets, credentials, and source-history imports.
