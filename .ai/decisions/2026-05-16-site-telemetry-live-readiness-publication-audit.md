# Site Telemetry Live Readiness Publication Audit

Generated: 2026-05-16

## Verdict

Do not publish or deploy yet.

The Site Telemetry Publication live-readiness bundle is identifiable, but the
worktree is too broad for bulk staging. Repo publication should be split into
intentional commits before any live Cloudflare mutation.

Observed posture:

- branch: `main`;
- upstream: `origin/main`;
- ahead/behind: `10/0`;
- dirty entries from `git status --porcelain=v1`: `839`;
- inbox publish dry run: `publication_pending`;
- inbox dry run would export: `50`;
- uncommitted inbox envelope artifacts: `198`;
- unpushed commits reported by inbox publication: `10`;
- no commit, push, staging, deletion, deploy, or Cloudflare mutation was
  performed during this audit.

## In-Scope Bundle

These paths are in scope for the Site Telemetry Publication / live-readiness
publication bundle, subject to final review before staging.

### Product And Deployment Docs

- `docs/product/site-telemetry-publication.md`
- `docs/product/site-telemetry-publication-outcome-shapes.md`
- `docs/product/site-telemetry-event-contract.v0.md`
- `docs/product/site-telemetry-publication-edge.v0.md`
- `docs/product/site-telemetry-surface-realization.v0.md`
- `docs/product/site-registry-read-model.v0.md`
- `docs/product/remote-candidate-exchange.v0.md`
- `docs/product/site-telemetry-local-tools.v0.md`
- `docs/product/site-telemetry-scheduler-posture.v0.md`
- `docs/product/site-telemetry-readiness.v0.md`
- `docs/product/site-telemetry-operations-posture.v0.md`
- `docs/product/site-telemetry-inquiry-doctrine-feedback.v0.md`
- `docs/product/site-telemetry-doctrine-grounding-mcp.v0.md`
- `docs/product/site-telemetry-first-live-slice.v0.md`
- `docs/product/site-telemetry-hosted-route-storage-contract.v0.md`
- `docs/deployment/cloudflare-hosted-site-registry.md`

### Fixtures

- `docs/product/fixtures/site-telemetry-event-contract/`
- `docs/product/fixtures/site-telemetry-publication-edge/`
- `docs/product/fixtures/site-telemetry-surface-realization/`
- `docs/product/fixtures/site-registry-read-model/`
- `docs/product/fixtures/remote-candidate-exchange/`
- `docs/product/fixtures/user-site-awareness-from-registry/`
- `docs/product/fixtures/site-telemetry-scheduler-posture/`
- `docs/product/fixtures/site-telemetry-operations-posture/`
- `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback/`

### Packages And Tests

- `packages/site-registry-cloudflare/`
- `packages/site-config/README.md`
- `packages/site-config/src/index.ts`
- `packages/site-config/test/site-config.test.ts`
- `packages/site-inbox/README.md`
- `packages/site-inbox/src/index.ts`
- `packages/site-inbox/test/remote-exchange.test.ts`
- `packages/layers/cli/src/commands/site-telemetry.ts`
- `packages/layers/cli/src/commands/site-telemetry-register.ts`
- `packages/layers/cli/test/commands/site-telemetry.test.ts`

### Decisions And Readiness Evidence

- `.ai/decisions/2026-05-16-cloudflare-hosted-site-registry-readiness.md`
- `.ai/decisions/2026-05-16-site-telemetry-live-readiness-publication-audit.md`

### Site Telemetry Task Evidence

- `.ai/do-not-open/tasks/20260516-1372-define-site-telemetry-and-agent-identity-telemetry-config-po.md`
- `.ai/do-not-open/tasks/20260516-1373-lift-remote-site-inbox-message-exchange-contract-into-packag.md`
- `.ai/do-not-open/tasks/20260516-1374-define-site-registry-typed-webhook-projection-surface.md`
- `.ai/do-not-open/tasks/20260516-1377-specify-cloudflare-hosted-site-registry-projection-chapter.md`
- `.ai/do-not-open/tasks/20260516-1378-scaffold-hosted-site-registry-cloudflare-worker-package.md`
- `.ai/do-not-open/tasks/20260516-1379-implement-typed-site-event-receiver-and-projection-storage.md`
- `.ai/do-not-open/tasks/20260516-1380-implement-read-only-site-registry-peek-api-and-human-surface.md`
- `.ai/do-not-open/tasks/20260516-1381-implement-hosted-registry-message-exchange-and-receipts.md`
- `.ai/do-not-open/tasks/20260516-1382-add-site-publisher-and-registry-puller-client-tools.md`
- `.ai/do-not-open/tasks/20260516-1383-add-hosted-registry-deployment-and-smoke-verification-runboo.md`
- `.ai/do-not-open/tasks/20260516-1384-run-hosted-site-registry-readiness-proof-and-close-chapter.md`
- `.ai/do-not-open/tasks/20260516-1385-shape-site-telemetry-publication-uber-chapter-components.md`
- `.ai/do-not-open/tasks/20260516-1386-define-shape-of-outcome-of-telemetry-event-contract.md`
- `.ai/do-not-open/tasks/20260516-1387-define-shape-of-outcome-of-publication-edge-and-capability-p.md`
- `.ai/do-not-open/tasks/20260516-1388-define-shape-of-outcome-of-telemetry-surface-realizations.md`
- `.ai/do-not-open/tasks/20260516-1389-define-shape-of-outcome-of-siteregistry-read-model.md`
- `.ai/do-not-open/tasks/20260516-1390-define-shape-of-outcome-of-remote-candidate-exchange.md`
- `.ai/do-not-open/tasks/20260516-1391-define-shape-of-outcome-of-local-publisher-and-puller-tools.md`
- `.ai/do-not-open/tasks/20260516-1392-define-shape-of-outcome-of-readiness-and-operations.md`
- `.ai/do-not-open/tasks/20260516-1393-define-shape-of-outcome-of-inquiry-doctrine-feedback.md`
- `.ai/do-not-open/tasks/20260516-1394-specify-telemetry-event-contract-schema-and-fixtures.md`
- `.ai/do-not-open/tasks/20260516-1395-implement-telemetry-event-contract-package-surface.md`
- `.ai/do-not-open/tasks/20260516-1396-integrate-telemetry-event-contract-with-hosted-receiver.md`
- `.ai/do-not-open/tasks/20260516-1397-specify-publication-edge-and-capability-policy-schema.md`
- `.ai/do-not-open/tasks/20260516-1398-implement-publication-edge-config-reader-and-preflight.md`
- `.ai/do-not-open/tasks/20260516-1399-wire-publication-edge-policy-into-client-helpers.md`
- `.ai/do-not-open/tasks/20260516-1400-specify-telemetry-surface-realization-contract.md`
- `.ai/do-not-open/tasks/20260516-1401-refactor-cloudflare-package-naming-docs-toward-telemetry-sur.md`
- `.ai/do-not-open/tasks/20260516-1402-add-local-telemetry-surface-fixture-realization.md`
- `.ai/do-not-open/tasks/20260516-1403-specify-siteregistry-read-model-schema.md`
- `.ai/do-not-open/tasks/20260516-1404-implement-siteregistry-read-model-derivation.md`
- `.ai/do-not-open/tasks/20260516-1405-integrate-siteregistry-read-model-with-user-site-awareness-p.md`
- `.ai/do-not-open/tasks/20260516-1406-specify-remote-candidate-exchange-generic-contract.md`
- `.ai/do-not-open/tasks/20260516-1407-align-hosted-message-routes-with-remote-candidate-exchange-c.md`
- `.ai/do-not-open/tasks/20260516-1408-add-receiving-site-admission-fixture-for-remote-candidate-ex.md`
- `.ai/do-not-open/tasks/20260516-1409-specify-local-publisher-and-puller-tool-contract.md`
- `.ai/do-not-open/tasks/20260516-1410-implement-cli-wrappers-for-local-telemetry-publish-and-pull.md`
- `.ai/do-not-open/tasks/20260516-1411-add-scheduler-posture-for-telemetry-publisher-and-puller.md`
- `.ai/do-not-open/tasks/20260516-1412-specify-site-telemetry-readiness-states-and-evidence.md`
- `.ai/do-not-open/tasks/20260516-1413-implement-hosted-telemetry-deploy-wrapper-and-verifier.md`
- `.ai/do-not-open/tasks/20260516-1414-define-monitoring-ownership-and-secret-rotation-posture.md`
- `.ai/do-not-open/tasks/20260516-1415-specify-inquiry-doctrine-feedback-intake-contract.md`
- `.ai/do-not-open/tasks/20260516-1416-implement-doctrine-grounding-mcp-lift-package-for-telemetry-.md`
- `.ai/do-not-open/tasks/20260516-1417-replay-site-telemetry-publication-branch-into-inquiry-space-.md`
- `.ai/do-not-open/tasks/20260516-1418-add-startup-sequence-first-work-onboarding-for-launched-buil.md`
- `.ai/do-not-open/tasks/20260516-1419-repair-site-telemetry-operations-posture-fixture-status-enum.md`
- `.ai/do-not-open/tasks/20260516-1420-1420-site-telemetry-publication-live-readiness.md`
- `.ai/do-not-open/tasks/20260516-1420-create-site-telemetry-publication-live-readiness-chapter-tas.md`
- `.ai/do-not-open/tasks/20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md`
- `.ai/do-not-open/tasks/20260516-1421-define-first-live-slice-authority-and-admission-boundary.md`
- `.ai/do-not-open/tasks/20260516-1422-specify-hosted-route-and-storage-contract-for-the-first-slic.md`
- `.ai/do-not-open/tasks/20260516-1423-audit-repo-publication-bundle-for-site-telemetry-live-readin.md`
- `.ai/do-not-open/tasks/20260516-1424-record-cloudflare-coordinate-and-secret-posture-decision.md`
- `.ai/do-not-open/tasks/20260516-1425-prepare-cloudflare-resource-binding-replacement.md`
- `.ai/do-not-open/tasks/20260516-1426-run-site-telemetry-deploy-preflight-to-green.md`
- `.ai/do-not-open/tasks/20260516-1427-execute-operator-gated-cloudflare-live-deploy.md`
- `.ai/do-not-open/tasks/20260516-1428-run-post-deploy-smoke-verification-and-readiness-update.md`
- `.ai/do-not-open/tasks/20260516-1429-connect-narada-site-config-to-verified-telemetry-surface.md`
- `.ai/do-not-open/tasks/20260516-1430-close-site-telemetry-publication-live-readiness-chapter.md`

### Lifecycle Snapshot

- `.ai/task-lifecycle-snapshot.json`

This file is in scope only as the portable lifecycle snapshot for the task
mutations. It should be reviewed with the task bundle, not committed as an
unexamined incidental change.

## Requires Operator Review Before Inclusion

These paths may be relevant but should not be automatically included in a Site
Telemetry publication bundle without a separate review decision.

- `.ai/inbox-envelopes/`
- `.ai/mutation-evidence/task_lifecycle/`
- `.ai/tmp/`
- `.narada/agent-context-memory/memory-store.json`
- `AGENTS.md`
- `pnpm-lock.yaml`

Rationale:

- inbox publication is pending, but publishing envelopes is a separate
  Repository Publication Intent Zone crossing;
- mutation evidence is numerous and cross-cutting;
- `.ai/tmp/` contains useful commissioning/report inputs, but temporary working
  files may not all be intended publication evidence;
- memory and law files can contain broader session/state changes;
- lockfile inclusion should be tied to package changes after review.

## Out Of Scope For This Bundle

The current dirty tree also includes substantial non-Site-Telemetry work. Do
not include these in a Site Telemetry live-readiness commit unless a separate
publication audit admits them:

- Narada-native carrier chapters and code under `.narada/agent-carriers/`,
  `tools/narada-native-carrier/`, and related task ranges `1280-1371`;
- Claude Code carrier tools under `tools/agent-start/claude-code-*`;
- broad MCP facade changes under `packages/narada-proper-mcp/`;
- broad CLI/task lifecycle/review/publication changes under
  `packages/layers/cli/` except the Site Telemetry command files listed above;
- mailbox/control-plane runtime changes under `packages/layers/control-plane/`
  and `packages/layers/daemon/`;
- `kb/`;
- older unrelated task files and closure decisions not in the Site Telemetry
  ranges above.

## Recommended Commit Grouping

1. Site Telemetry contracts and fixtures:
   product docs, fixture directories, `packages/site-config`, and
   `packages/site-inbox` remote exchange changes.
2. Hosted Cloudflare realization:
   `packages/site-registry-cloudflare/`,
   `docs/deployment/cloudflare-hosted-site-registry.md`, and readiness decision.
3. Local tools and CLI:
   Site Telemetry CLI command files and tests.
4. Task/chapter evidence:
   Site Telemetry task files for ranges `1372-1430`, lifecycle snapshot, and
   selected task lifecycle mutation evidence if reviewed.
5. Inbox envelope publication:
   run `narada inbox publish --execute` only after deciding whether all pending
   envelope artifacts should be committed together; push remains separate.

## Publication Blockers

- The repo has `839` dirty entries, so bulk staging would mix unrelated work.
- Inbox publication is pending with `198` uncommitted envelope artifacts.
- There are `10` unpushed commits already on `main` relative to `origin/main`.
- Cloudflare live deployment is still blocked until later tasks settle coordinate
  and secret posture, binding replacement, green preflight, explicit operator
  grant, and post-deploy smoke evidence.

## Verification Commands

- `git status --short`
- `git status --porcelain=v1 | Measure-Object | Select-Object -ExpandProperty Count`
- `git status --short docs/product packages/site-registry-cloudflare packages/site-config packages/site-inbox packages/layers/cli/src/commands/site-telemetry.ts packages/layers/cli/src/commands/site-telemetry-register.ts packages/layers/cli/test/commands/site-telemetry.test.ts docs/deployment/cloudflare-hosted-site-registry.md .ai/decisions/2026-05-16-cloudflare-hosted-site-registry-readiness.md`
- `git status --short .ai/do-not-open/tasks/20260516-1372*.md ... .ai/do-not-open/tasks/20260516-1430*.md`
- `narada inbox publish --format json`
- `git branch --show-current`
- `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'`
- `git rev-list --left-right --count 'HEAD...@{u}'`
