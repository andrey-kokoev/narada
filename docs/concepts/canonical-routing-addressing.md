# Canonical Routing And Addressing

Canonical Routing and Addressing is the Site-local registry for target identity and address resolution. It answers: when Narada needs to deliver, notify, forward, or hand off something, which target is meant, which authority locus owns it, which address is used, which transport is admissible, and which capability kind execution must hold.

Routing is not Inbox. Inbox admits incoming typed envelopes.

Routing is not Outbox. Outbox governs outbound effects.

Routing is not Capability Consent. A route may name the capability kind required for execution, but it does not grant that capability.

## Command Surface

```bash
narada routing add \
  --target-kind site \
  --target-ref utz-client-service \
  --authority-locus client_service \
  --address-kind file_drop \
  --address-ref /path/to/Utz/.narada/.ai/inbox-drop \
  --transport filesystem \
  --capability-kind filesystem.write \
  --priority 10 \
  --by operator

narada routing list --target-kind site
narada routing resolve --target-kind site --target-ref utz-client-service
narada routing explain <route-id>
```

The v0 registry persists at:

```text
.ai/routing-addressing-registry.json
```

## Route Shape

Each route records:

| Field | Meaning |
| --- | --- |
| `route_id` | Durable route identifier |
| `target_kind`, `target_ref` | What is being addressed |
| `authority_locus` | Authority locus of the target |
| `address_kind`, `address_ref` | Address type and concrete address reference |
| `transport` | Delivery/notification transport |
| `capability_kind` | Capability kind required for execution |
| `priority` | Lower values resolve first |
| `active` | Whether the route may be selected |
| `fallback_target` | Optional fallback target |
| `evidence_ref` | Evidence for the route |
| `created_by`, `created_at`, `updated_at` | Provenance metadata |

## Resolution Rule

Route resolution is read-only. It selects the active route with the lowest priority for a target and returns alternatives. Execution still needs a matching capability grant and the destination crossing law.

This prevents broadcast-by-default and prevents address knowledge from becoming authority.

## Agent Address Resolution

Agent-facing command surfaces may accept a concrete agent id or a role-shaped address.

Concrete agent ids remain authoritative when present in the target Site roster. Role-shaped addresses such as `narada-andrey.builder` are routing requests, not identities. They may resolve only when the active roster contains exactly one matching agent for the requested role and Site prefix. Zero matches and multiple matches fail closed with the competing candidates or repair command.

When a command resolves a role-shaped address, its output and mutation evidence must preserve both `requested_agent` and `resolved_agent`. The resolved concrete agent id is the only identity used for task claims, roster mutation, Operator Surface sends, and downstream lifecycle evidence.
