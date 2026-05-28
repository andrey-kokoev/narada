Implemented task 1498 by closing the Operator Site Communication Relation chapter.

Files changed:

- `.ai/decisions/2026-05-18-1494-1497-chapter-closure-draft.md`
- `.ai/decisions/2026-05-18-1494-1497-chapter-closure.md`
- `.ai/do-not-open/tasks/20260518-1494-1498-operator-site-communication-relation.md`
- `.ai/do-not-open/tasks/20260518-1498-close-operator-site-communication-relation-chapter.md`

Summary:

- Inspected tasks 1494-1497 and confirmed they were closed with governed reports, closure provenance, and all acceptance criteria checked.
- Ran the chapter closure workflow for 1494-1497, generated a closure draft, filled in the gap table and CCC posture, accepted the closure decision, and transitioned 1494-1497 to confirmed.
- Recorded residual implementation work without claiming hosted registry messaging or chat production readiness.
- Updated the chapter projection and task 1498 evidence fields.

Verification:

- `narada task read 1494 --format json`
- `narada task read 1495 --format json`
- `narada task read 1496 --format json`
- `narada task read 1497 --format json`
- `pnpm --filter @narada2/site-registry-cloudflare test -- test/communication-docs.test.ts test/site-scope-chat.test.ts test/worker-boundary.test.ts`
- `Get-ChildItem docs/product/fixtures/operator-site-communication-relation -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null; $_.Name }`
- `rg -n "OperatorSiteCommunicationRelation|governed configuration|projection-only|IncomingMessageIntakeEdge|Canonical Outbox|remote_preserved|transport_delivered|local_admitted|operator_acknowledged|operator_approved|outbound_communication|Site-to-Operator|Operator-to-Site" docs/product/operator-site-communication-relation.v0.md docs/product/site-registry-communication-relation-reconciliation-20260518.md docs/product/site-communication-surface.v0.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-inbox.md docs/concepts/canonical-outbox.md docs/concepts/operator-surface.md docs/product/site-factorization.md`
- `narada task evidence assert-complete 1494-1497 --format json`
- `narada chapter close 1494-1497 --finish --by narada.builder --format json`
- `git diff --check -- .ai/decisions/2026-05-18-1494-1497-chapter-closure-draft.md .ai/decisions/2026-05-18-1494-1497-chapter-closure.md .ai/do-not-open/tasks/20260518-1494-1498-operator-site-communication-relation.md .ai/do-not-open/tasks/20260518-1498-close-operator-site-communication-relation-chapter.md`

Residuals:

- Worker/API responses need relation and inbound-edge coordinates before further UI implementation depends on them.
- UI copy should keep candidate preservation, transport delivery, target admission, acknowledgement, and approval distinct.
- Site-to-Operator outbound notification/Canonical Outbox work remains a future governed chapter.
