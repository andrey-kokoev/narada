Implemented task 1497 with a bounded reconciliation note for Site Registry communication UI/API work against the Operator Site Communication Relation contract.

Files changed:

- `docs/product/site-registry-communication-relation-reconciliation-20260518.md`
- `docs/product/operator-site-communication-relation.v0.md`
- `.ai/do-not-open/tasks/20260518-1497-reconcile-site-registry-communication-ui-plan-with-relation-.md`

Summary:

- Mapped existing message, chat, `/api/site-communications/*`, `/api/messages/*`, relation transition, receipt, and future notification surfaces to relation, inbound edge, outbound edge, remote candidate, receipt, and projection components.
- Reviewed admission, approval, acknowledgement, delivery, remote preservation, and relation lifecycle labels.
- Named required implementation follow-up candidates with ownership: Worker/API relation coordinates, UI label alignment, chat projection relation refs, compatibility documentation, and future Site-to-Operator outbound edge work.
- Preserved route compatibility while documenting that `outbound_communication` schema/table names are registry-perspective compatibility labels, not the relation's Site-to-Operator outbound edge.

Verification:

- `rg -n "SiteCommunication|site_communication|site-communications|outbound_communication|delivery_receipt|admission_receipt|recorded_not_delivered|local_admission|remote_preserved|acknowledge|approval|operator" packages/site-registry-cloudflare/src/index.ts packages/site-registry-cloudflare/src/site-scope-chat.ts packages/site-registry-cloudflare/test -g "*.ts"`
- `rg -n "relation|inbound edge|outbound edge|receipt|operator acknowledgement|operator approval|remote candidate|local admission|site communication" docs/product/operator-site-communication-relation.v0.md docs/product/site-communication-surface.v0.md docs/product/hosted-message-local-admission-boundary.md docs/product/site-telemetry-hosted-route-storage-contract.v0.md -g "*.md"`
- `git diff --check -- docs/product/site-registry-communication-relation-reconciliation-20260518.md docs/product/operator-site-communication-relation.v0.md .ai/do-not-open/tasks/20260518-1497-reconcile-site-registry-communication-ui-plan-with-relation-.md`
- `rg -n "Operator-to-Site|Site-to-Operator|remote_preserved|transport_delivered|local_admitted|operator_acknowledged|operator_approved|outbound_communication|Required Implementation Adjustments|follow-up candidates" docs/product/site-registry-communication-relation-reconciliation-20260518.md`
- `rg -n "site-registry-communication-relation-reconciliation" docs/product/operator-site-communication-relation.v0.md`

No Worker/UI implementation, Cloudflare deployment, or external Site configuration mutation was performed.
