# Capability-Governed Secret Management

Capability-Governed Secret Management is the Narada doctrine for treating secrets as authority-bearing capabilities, not ordinary configuration or knowledge.

Knowledge can be copied when policy allows. A secret confers power: authenticate, decrypt, sign, fetch, execute, mutate, or impersonate within an external authority domain.

## Core Rule

```text
Site artifacts may carry secret references and capability policy.
Raw secret values live in the authority-bearing secret store for the relevant locus.
```

Canonical Inbox envelopes may carry secret references or capability metadata, but not raw secret values. See [`canonical-inbox.md`](canonical-inbox.md#capability-metadata).

## Secret Reference Shape

A Site config, task, inbox envelope, or tool binding may reference a secret by metadata:

| Field | Meaning |
| --- | --- |
| `secret_ref` | Stable reference name, not a raw value. |
| `capability` | What power the secret grants. |
| `authority_locus` | User, PC, project, client, data, ELT, cloud, or external owner that governs access. |
| `store_kind` | Credential Manager, keychain, env, `.env`, cloud secret store, client vault, GitHub Actions secret, or future adapter. |
| `allowed_principals` | Principals that may request the capability. |
| `retrieval_policy` | Conditions under which the secret may be retrieved or used. |
| `use_policy` | Allowed command, tool, effect, or signing context. |
| `rotation_policy` | How stale material is replaced. |
| `revocation_policy` | How access is removed or marked unsafe. |
| `audit_policy` | What evidence is recorded for discovery, retrieval, use, rotation, and revocation. |

## Lifecycle Transitions

Secret management has distinct transitions:

| Transition | Meaning |
| --- | --- |
| Discovery | A Site learns that a capability is needed or present. |
| Authorization | A principal is allowed to request or use that capability. |
| Binding | A local store receives or locates the raw secret. |
| Retrieval | A runtime obtains the value or handle from the store. |
| Use | A tool or adapter consumes the capability. |
| Rotation | The underlying secret changes. |
| Revocation | The capability is removed or distrusted. |
| Audit | Evidence records who requested, retrieved, used, rotated, or revoked. |

These transitions must not be collapsed. Knowing a `secret_ref` is not authorization. Authorization is not retrieval. Retrieval is not permission to use outside the declared purpose.

## Locus-Aware Stores

| Locus | Appropriate Store Posture |
| --- | --- |
| User Site | User keychain, Credential Manager, pass/Secret Service, or local development env fallback. |
| PC Site | Machine or session credential store appropriate to the host authority. |
| Project Site | Secret references and local developer bindings; raw values stay out of Git. |
| Client Service Site | Client-owned vault or deployment secret store where possible. |
| Data Site | Minimal capability access; credentials scoped to data residency and access policy. |
| ELT Site | Pipeline runner secret store with audit and rotation posture. |
| Cloud Site | Cloud provider secret bindings. |
| Agent Principal | Capability request by reference and purpose; raw disclosure only by explicit governed exception. |

`.env` is a local development fallback, not a portable Site knowledge substrate.

## Site Lifecycle Rules

Site cloning, splitting, migration, archiving, and re-instantiation must carry secret references and policies, not secret material.

- A cloned Site may know that a capability is required.
- A re-instantiated Site must bind secrets locally before use.
- A migrated Site must prove the old locus no longer has unintended access if authority moved.
- An archived Site must preserve references only as safe audit metadata.
- A Site pub/sub signal must not publish raw secret values.

## Agent Rule

Agents request capabilities by reference and purpose.

Raw secret disclosure to an agent is exceptional. It must be explicit, bounded, auditable, and tied to a tool or command authority class. An agent having intelligence about a task does not grant secret authority.

## Doctor And Preflight Expectations

Future doctor/preflight surfaces should detect:

- raw secret values in Git-tracked files;
- missing local bindings;
- wrong-locus secret references;
- stale or rotated material;
- revoked secret use;
- unsafe cloud-sync or Git inclusion;
- agents requesting broad or unexplained raw access;
- capability references whose authority locus is ambiguous.

## Boundary

This doctrine does not implement a new vault. It defines the authority model future credential resolvers, Site lifecycle commands, doctor checks, and agent tooling must obey.
