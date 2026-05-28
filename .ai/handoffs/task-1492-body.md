Implemented task 1492 as doctrine-only crystallization.

Files changed:

- `docs/product/incoming-intake-trust-provenance-projection.md`
- `docs/product/incoming-message-intake-edge.md`
- `docs/product/remote-candidate-exchange.v0.md`
- `docs/concepts/canonical-inbox.md`
- `docs/concepts/canonical-admission-rejection-ledger.md`
- `docs/product/hosted-message-local-admission-boundary.md`
- `docs/concepts/verifiable-envelope-trust.md`

Summary:

- Added Incoming Intake Trust And Provenance Projection doctrine.
- Defined trust/provenance as evidence and projection, not admission,
  lifecycle, capability, task, operator, knowledge, Site relation, or effect
  authority.
- Carried the Verifiable Envelope Trust vocabulary exactly:
  `verified`, `unverified`, `failed`, `expired`, `revoked`, `unknown`,
  `not_signed`, `encrypted_unreadable`, `decrypted_verified`.
- Specified attachment points for Incoming Message Intake Edge, Remote
  Candidate Exchange, Canonical Inbox envelopes, and Admission Rejection Ledger
  entries.
- Defined default-display posture for inbox, remote candidate, intake edge,
  ledger, doctor, and work-next surfaces while excluding raw cryptographic
  material by default.
- Cross-linked the projection doctrine from affected intake/trust docs.

Verification:

- `git diff --check -- docs/product/incoming-intake-trust-provenance-projection.md docs/product/incoming-message-intake-edge.md docs/product/remote-candidate-exchange.v0.md docs/concepts/canonical-inbox.md docs/concepts/canonical-admission-rejection-ledger.md docs/product/hosted-message-local-admission-boundary.md docs/concepts/verifiable-envelope-trust.md`
- `rg "verified|unverified|failed|expired|revoked|unknown|not_signed|encrypted_unreadable|decrypted_verified|Incoming Intake Trust" docs/product/incoming-intake-trust-provenance-projection.md docs/product/incoming-message-intake-edge.md docs/product/remote-candidate-exchange.v0.md docs/concepts/canonical-inbox.md docs/concepts/canonical-admission-rejection-ledger.md docs/product/hosted-message-local-admission-boundary.md docs/concepts/verifiable-envelope-trust.md`

Notes:

- No cryptographic substrate, signing, encryption, key storage, or verification
  commands were introduced.
- Current unsigned local envelopes remain valid routine posture under
  `unknown` or `not_signed`.
