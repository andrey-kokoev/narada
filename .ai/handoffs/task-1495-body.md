Implemented task 1495 as communication doctrine terminology cleanup.

Files changed:

- `docs/product/site-communication-surface.v0.md`
- `docs/product/incoming-message-intake-edge.md`
- `docs/concepts/canonical-inbox.md`

Relevant prior 1494 cross-links preserved:

- `docs/concepts/canonical-outbox.md`
- `docs/concepts/operator-surface.md`
- `docs/product/site-factorization.md`
- `docs/product/operator-site-communication-relation.v0.md`

Summary:

- Updated Site Communication Surface product shape to route through `OperatorSiteCommunicationRelation` projection before message composer/chat and inbound crossing.
- Clarified that Site Communication Surface cannot mutate `OperatorSiteCommunicationRelation` lifecycle.
- Clarified that `IncomingMessageIntakeEdge` is only the inbound Operator-to-Site directional component when used inside the bidirectional relation.
- Clarified that Canonical Inbox is the possible local inbound artifact, not the communication relation, UI projection, outbound reply path, or operator approval authority.
- Searched for ambiguous edge-only terminology and found no product/concept doc uses requiring replacement.

Verification:

- `git diff --check -- docs/product/site-communication-surface.v0.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-inbox.md docs/concepts/canonical-outbox.md docs/concepts/operator-surface.md docs/product/site-factorization.md docs/product/operator-site-communication-relation.v0.md`
- `rg -n "OperatorSiteCommunicationEdge|Operator Site Communication Edge|site communication edge|communication edge|relation authority|UI delivery is local admission|UI delivery is.*approval" docs/product docs/concepts -g "*.md"`
- `rg -n "OperatorSiteCommunicationRelation|operator-site-communication-relation|directional component|inbound artifact|projection-only|local admission|operator approval|Canonical Outbox|IncomingMessageIntakeEdge" docs/product/site-communication-surface.v0.md docs/product/incoming-message-intake-edge.md docs/concepts/canonical-inbox.md docs/concepts/canonical-outbox.md docs/concepts/operator-surface.md docs/product/site-factorization.md`

No CLI behavior, Worker routes, public API names, registry-wide chat posture, or Site Communication Surface terminology were changed.
