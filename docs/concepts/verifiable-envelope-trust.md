# Verifiable Envelope Trust

Verifiable Envelope Trust is the Narada doctrine for authenticity, integrity, confidentiality posture, and provenance of messages that cross loci.

It applies to:

- canonical inbox envelopes;
- future Site pub/sub signals;
- Site provenance lineage events;
- authority-transfer proposals;
- task, knowledge, tool, template, and config-change candidates;
- forwarded messages between embodiments or Sites.

Secret management is adjacent but distinct: envelope trust verifies message provenance and integrity; secret management governs protected capabilities used to authenticate, decrypt, sign, fetch, execute, or mutate.

Capability metadata inside an inbox envelope remains inert even when the envelope is signed. See [`canonical-inbox.md`](canonical-inbox.md#capability-metadata).

## Doctrine

```text
Signatures and encryption can provide evidence.
They do not grant mutation authority.
The receiving locus still governs admission.
```

## Requirements

| Requirement | Meaning |
| --- | --- |
| Authenticity | The claimed sender principal or Site can be verified. |
| Payload integrity | The payload has not changed since signing or sealing. |
| Optional confidentiality | Payloads that require privacy can be encrypted for intended recipients. |
| Sender principal identity | Human, agent, daemon, or Site principal is explicit and not conflated. |
| Site identity | The source Site or locus is explicit when applicable. |
| Forwarding provenance | Relays record what they forwarded without becoming original authors. |
| Key rotation | Trust material can change without losing historical verification. |
| Revocation | Compromised or retired keys can be distrusted from a declared point. |
| Trust policy | Each receiving locus decides which signatures, keys, and authorities it accepts. |
| Verification status | Inspection surfaces expose verified, unverified, failed, expired, revoked, or unknown posture. |

## Trust Is Evidence, Not Authority

A valid signature can prove that a principal authored or forwarded an envelope. It cannot prove that the receiving Site should admit, execute, promote, or trust the payload.

Examples:

- An agent-signed task proposal remains a proposal.
- A Site-signed pub/sub signal remains an inert incoming signal until admitted.
- A human-signed authority-transfer request still requires the target crossing regime.
- An encrypted payload protects content but does not change mutation authority.

## Candidate Substrates

Narada should evaluate cryptographic substrates against portability, offline operation, Windows/WSL/Linux support, browser/cloud compatibility, key rotation, revocation, agent-principal support, and Git-friendly artifact storage.

Candidate families include:

- PGP/GPG;
- age;
- minisign/signify;
- SSH signatures;
- Sigstore;
- JWS/JWT-style signatures;
- future Narada-native envelope signatures.

This doctrine does not select one. Selection is a future implementation decision after the requirements are forced by operating cases.

## Envelope Trust Fields

Future signed or sealed envelopes should be able to carry:

| Field | Meaning |
| --- | --- |
| `trust.envelope_digest` | Stable digest over the canonical envelope body. |
| `trust.signature` | Detached or embedded signature material. |
| `trust.signing_principal` | Principal that signed. |
| `trust.signing_site` | Site/locus associated with the signing context. |
| `trust.signed_at` | Signing time. |
| `trust.forwarding_chain` | Ordered forwarding records, each separately attributable. |
| `trust.encryption` | Optional confidentiality metadata. |
| `trust.verification_status` | Current local verification result. |
| `trust.verification_evidence` | Key, policy, and verification references. |

## Inspection Surfaces

Inbox, pub/sub, lineage, doctor, and preflight surfaces should eventually show trust posture without dumping cryptographic material by default.

Useful statuses:

- `verified`;
- `unverified`;
- `failed`;
- `expired`;
- `revoked`;
- `unknown`;
- `not_signed`;
- `encrypted_unreadable`;
- `decrypted_verified`.

For incoming intake attachment points across intake edges, remote candidates,
Canonical Inbox envelopes, and Admission Rejection Ledger entries, see
[`Incoming Intake Trust And Provenance Projection`](../product/incoming-intake-trust-provenance-projection.md).

## Boundary

This document defines doctrine and requirements only. It does not add signing, encryption, key storage, trust policy evaluation, or verification commands.

Those are future implementation tasks.

For protected capability handling, see [`capability-governed-secret-management.md`](capability-governed-secret-management.md).
