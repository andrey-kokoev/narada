# Narada evidence and confirmation contract

This package owns the cross-domain `EvidencePacket`, correlation audit, and
effect-confirmation contracts. Evidence explains and verifies claims; it does
not grant permission or replace the authority that observes a mutation.

Provider success, transport closure, silence, and projection freshness are
explicitly non-confirming signals. A consequential effect is confirmed only
by an admissible, correlated observation or reconciliation packet.
