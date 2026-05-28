---
status: draft
task: 1484
chapter: 1482-1484
---

# Remaining Coherence Cleanup Audit

Date: 2026-05-17
Operator: narada.architect

## Scope

This audit is bounded to the work surfaced after the Site Registry split and the
follow-on cleanup chapter. It is not a full repository cleanup and does not
stage, commit, push, delete, or revert files.

## Findings

1. Chapter `1475-1481` is semantically coherent and closed with one explicit
   residual: task `1480` remains deferred until registry-owner relation
   publication capability and relation admin credential binding exist.
2. Task `1480` stale wording was repaired in task `1482`; it no longer makes
   live publication depend on unfinished task `1479`.
3. Chapter `1482-1484` has a lifecycle/projection anomaly: `task read 1483`
   finds task `1483` as opened, but `chapter status 1482-1484` reports only two
   tasks in the range. Task `1485` narrowed this: SQLite `task_lifecycle` and
   `task_specs` contain task `1483`, but numeric task lookup is polluted by the
   repair task filename ending in `task-1483`, and full-id claim hits a
   non-null `assignment_intents.task_number` constraint bug.
4. The worktree is broadly dirty from multiple active Narada work families.
   The Site Registry split should not be committed as one global bulk commit.

## Path Classification

### Closed Site Registry Split Evidence

These paths belong together if committing the completed Site Registry split and
dry-run planner work:

- `.ai/decisions/2026-05-17-1475-1481-chapter-closure.md`
- `.ai/decisions/2026-05-17-1475-1481-chapter-closure-draft.md`
- `.ai/do-not-open/tasks/20260517-1475-1481-separate-site-telemetry-from-site-registry.md`
- `.ai/do-not-open/tasks/20260517-1475-define-boundary-between-site-operational-telemetry-and-site-.md`
- `.ai/do-not-open/tasks/20260517-1476-audit-hosted-registry-docs-and-routes-for-telemetry-registry.md`
- `.ai/do-not-open/tasks/20260517-1477-clarify-docs-and-ui-language-for-separate-hosted-service-con.md`
- `.ai/do-not-open/tasks/20260517-1478-specify-site-registry-relation-publication-command-and-mcp-s.md`
- `.ai/do-not-open/tasks/20260517-1479-implement-dry-run-site-registry-relation-publication-planner.md`
- `.ai/do-not-open/tasks/20260517-1481-notify-narada-andrey-of-hosted-telemetry-and-registry-separa.md`
- `docs/product/site-telemetry-registry-boundary.v0.md`
- `docs/product/site-telemetry-registry-boundary-audit-20260517.md`
- `docs/product/site-registry-relation-publication-surface.v0.md`
- `docs/product/site-telemetry-publication.md`
- `docs/product/site-telemetry-publication-outcome-shapes.md`
- `packages/site-registry-cloudflare/README.md`
- `packages/layers/cli/src/commands/site-registry.ts`
- `packages/layers/cli/src/commands/site-registry-register.ts`
- `packages/layers/cli/test/commands/site-registry.test.ts`
- `packages/layers/cli/src/main.ts`
- `packages/narada-proper-mcp/src/server.ts`
- `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts`
- `packages/site-registry-cloudflare/src/index.ts`

### Deferred Live-Publication Evidence

These paths should be kept with the Site Registry split or a small follow-up
coherence commit, but must not be described as live publication completion:

- `.ai/do-not-open/tasks/20260517-1480-plan-live-site-registry-relation-publication-capability-as-a.md`
- `.ai/do-not-open/tasks/20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md`
- `.ai/do-not-open/tasks/20260517-1482-repair-stale-live-publication-deferral-wording.md`
- `.ai/do-not-open/tasks/20260517-1483-refresh-task-lifecycle-snapshot-after-chapter-closure.md`
- `.ai/do-not-open/tasks/20260517-1484-audit-remaining-dirty-worktree-coherence-boundary.md`
- `.ai/tmp/remaining-coherence-cleanup-chapter.json`
- `.ai/decisions/2026-05-17-remaining-coherence-cleanup-audit.md`

### Related But Separate Work Families

These are visible in the dirty tree but should not be bundled into the Site
Registry split without a separate review:

- Agent carrier and startup continuity changes under `tools/agent-start/`,
  `docs/product/agent-carrier-launch-packet.v0.json`, `docs/concepts/agent-carrier.md`,
  and `.narada/agent-carriers/`.
- Narada-native carrier work under `tools/narada-native-carrier/`.
- Task governance and lifecycle machinery changes under `packages/task-governance/`
  and broad `packages/layers/cli/src/commands/task-*` edits.
- Site operational dashboard package under `packages/site-operational-dashboard/`.
- Site communication surface work under `docs/product/site-communication-surface.v0.md`,
  `docs/product/fixtures/site-communication-surface/`, and communication/chat
  files in `packages/site-registry-cloudflare/`.
- Site registry relation capability verifier work under
  `docs/product/site-registry-relation-capability-verifier.v0.md`,
  its fixtures, migrations, and related Cloudflare worker tests.

### Local Or Generated Evidence

These require operator/repo hygiene decision before commit:

- `.ai/task-lifecycle-snapshot.json` should be refreshed through task `1483`.
- `.ai/mutation-evidence/**`, `.ai/handoffs/**`, `.ai/inbox-envelopes/**`,
  `.ai/outbox-items/**`, and `.ai/observations/**` are evidence artifacts; include
  only the bounded subset needed for the commit narrative.
- `packages/site-registry-cloudflare/.wrangler/**` is local Miniflare state and
  should not be committed unless the repository explicitly tracks it. Current
  posture: keep out of a Site Registry split commit.
- `.narada/agent-context-memory/memory-store.json` is local agent memory state;
  do not include in a product/code commit without an explicit memory-evidence
  decision.

## Recommended Commit Grouping

1. Site Registry split and dry-run planner: docs, CLI planner, MCP planner, tests,
   task evidence for `1475-1481`, and the bounded `1480` deferral repair.
2. Site communication surface: message send API/UI/chat and its own task evidence.
3. Site operational dashboard generator: dashboard package and documentation.
4. Agent carrier/Narada-native carrier work: separate by carrier chapter.
5. Task governance/lifecycle machinery: separate infrastructure commit(s), because
   it affects task authority surfaces and should not be hidden inside registry work.

## Required Follow-Up

- Repair or explain why `chapter status 1482-1484` omits task `1483` while
  `task read 1483` succeeds.
- Repair task-governance numeric lookup so filenames mentioning another task
  number do not hijack `findTaskFile(<number>)`; also repair full task-id claim
  so assignment intent recording receives the canonical numeric task number.
- Execute task `1483` or amend/defer it through governed lifecycle if the
  lifecycle projection issue blocks normal execution.
- Refresh `.ai/task-lifecycle-snapshot.json` through sanctioned export before any
  publication bundle that claims current task lifecycle evidence.
