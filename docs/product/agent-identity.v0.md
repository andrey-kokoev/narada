# Agent Identity Object

## Purpose

The Agent Identity object is the Site-scoped durable identity record for an agent such as `narada.architect` or `narada.builder`.

It answers:

```text
Which durable Agent is this, what roles and governance records are bound to it, and which sessions or carriers have embodied it?
```

It is not a live session, carrier runtime, model substrate, operator surface, control channel, transcript, route, capability channel, credential reference, or task assignment. Those may refer to an Agent Identity; they do not become it.

## Canonical Shape

```json
{
  "schema": "narada.agent_identity.v0",
  "agent_identity_id": "agent:narada:narada.builder",
  "site_id": "narada",
  "agent_id": "narada.builder",
  "principal_id": "builder",
  "display_name": "Narada Builder",
  "status": "active",
  "role_bindings": [
    {
      "role_id": "builder",
      "role_class": "builder",
      "status": "active",
      "authority_posture": "construction",
      "source_ref": "roster:narada.builder"
    }
  ],
  "law_receipt_posture": {
    "state": "current",
    "receipt_refs": ["law_receipt:narada.builder:AGENTS.md"]
  },
  "capability_posture": {
    "registry_ref": ".ai/capability-consent-registry.json",
    "grant_refs": []
  },
  "qualification_posture": {
    "registry_ref": ".ai/site-qualification.json",
    "qualification_refs": []
  },
  "session_trace_refs": [
    {
      "carrier_session_id": "carrier_session_codex_20260517_builder_001",
      "carrier_kind": "codex_carrier",
      "agent_start_event_id": "agent_start_20260517_builder_001",
      "runtime_ref": "pc_runtime:windows-terminal:builder",
      "operator_surface_ref": "operator_surface:narada-builder",
      "trace_refs": ["transcript:codex-session:builder-20260517"]
    }
  ],
  "authority_limits": [
    "agent_identity_is_not_session",
    "agent_identity_is_not_carrier",
    "agent_identity_is_not_substrate",
    "agent_identity_is_not_operator_surface",
    "agent_identity_is_not_control_channel",
    "agent_identity_is_not_capability_grant",
    "agent_identity_is_not_qualification",
    "agent_identity_is_not_task_assignment"
  ]
}
```

## Field Semantics

| Field | Meaning | Authority posture |
| --- | --- | --- |
| `agent_identity_id` | Stable object id for this Site-recognized Agent Identity. | Identity record id, not a runtime handle. |
| `site_id` | Site whose governance recognizes the identity. | Scopes the identity; does not grant cross-Site authority. |
| `agent_id` | Current durable agent identifier used by task, MCP, carrier, and launch surfaces. | Compatibility identifier for current commands. |
| `principal_id` | Principal the agent embodies for governance, qualification, and capability checks. | Principal is not automatically a role or session. |
| `role_bindings` | Roles the Site admits for this identity. | Role binding is not capability or qualification by itself. |
| `law_receipt_posture` | Law receipt/readiness references for this identity. | Receipt is input evidence, not competence. |
| `capability_posture` | Capability registry and grant references relevant to this identity or principal. | Grants remain in the capability registry. |
| `qualification_posture` | Qualification record references for work classes. | Qualifications remain in the qualification registry. |
| `session_trace_refs` | Historical or current carrier/session/runtime evidence. | Trace evidence is reconstructive, not identity authority. |
| `authority_limits` | Explicit anti-collapse rules carried with the record. | Consumers should refuse identity inference from excluded surfaces. |

## Vocabulary Map

| Term | Use when | Do not use for |
| --- | --- | --- |
| `agent_identity_id` | Referring to the identity object as a governance/read-model record. | CLI compatibility flags or runtime session ids. |
| `agent_id` | Current task, roster, MCP startup, launch packet, report, and review surfaces need the durable named agent. | Principal-only qualification decisions or volatile sessions. |
| `principal_id` | Governance asks who is accountable or qualified for a work class. | Carrier session, role alias, or tool channel identity. |
| `role_id` | Selecting role-specific contracts, duties, review capability, or work class posture. | Durable agent identity by itself. |
| `carrier_session_id` | Correlating one bounded session, transcript, start event, and runtime evidence. | Agent identity, task ownership, or capability grants. |
| `runtime_id` | Referring to host/runtime handles or PC-local runtime records. | Site identity or role authority. |
| `identity_id` | Generic object-reference slots where the identity object is the record being linked. | Public CLI flags until compatibility is specified. |

Current public CLI and MCP surfaces should keep `agent_id` where it already means the durable named Agent. New schema/read-model work may introduce `agent_identity_id` or `identity_id` as additive fields, but this v0 does not rename public flags, database columns, or package APIs.

## Consumer Rules

Task lifecycle, report, review, work-next, MCP startup, carrier launch, capability, and qualification surfaces should resolve identity in this order when they need more than a raw `agent_id`:

1. Read the Site-recognized Agent Identity record or roster projection.
2. Resolve role binding for the requested work.
3. Check law receipt posture when the work class requires current law.
4. Check qualification posture for the work class.
5. Check capability posture only when the requested action needs an executable or external capability.
6. Attach session or carrier trace refs as evidence, never as identity authority.

When only a current compatibility command needs a named agent, `agent_id` remains sufficient. Consumers must not infer capability, qualification, task ownership, or runtime authority from `agent_id` alone.

## Anti-Collapse Rules

- Agent Identity is not a Carrier Session.
- Agent Identity is not a Carrier.
- Agent Identity is not a model or execution substrate.
- Agent Identity is not a terminal, process, window, browser profile, API thread, transcript, or MCP client.
- Agent Identity is not a role binding, though it may carry role bindings.
- Agent Identity is not a capability grant, though it may reference grants.
- Agent Identity is not a qualification record, though it may reference qualifications.
- Agent Identity is not a task assignment, report, review, or inbox envelope.

## Relationship To Existing Surfaces

| Surface | Relationship |
| --- | --- |
| [`Agent Carrier`](../concepts/agent-carrier.md) | A carrier embodies exactly one durable Agent Identity in one bounded Carrier Session. |
| [`Runtime Identity Binding`](../concepts/runtime-identity-binding.md) | Runtime bindings connect volatile handles to durable identity evidence without making handles authoritative. |
| [`Site Qualification Policy`](site-qualification-policy.md) | Qualification records bind principal, role, Site, work class, law, capability class, and evidence. Agent Identity may reference them. |
| [`Canonical Capability Consent Registry`](../concepts/canonical-capability-consent-registry.md) | Capability grants remain separate authority records; Agent Identity may reference active grants. |
| [`Agent Carrier Launch Packet`](agent-carrier-launch-packet.v0.json) | Launch packets carry `agent_id` as compatibility identity plus `carrier_session_id` as bounded session evidence. |

## Fixtures

- `docs/product/fixtures/agent-identity/narada-builder-codex-session.valid.json`

## Follow-Up Classification

This v0 is doctrine/spec and fixture work. It does not require immediate CLI or schema migration to be coherent.

Follow-up implementation tasks are warranted if a command needs to:

- materialize `.ai/agent-identities.json` or another Site-recognized identity registry;
- expose `narada agent identity show/list`;
- enrich work-next, MCP startup, carrier launch, or qualification output with `agent_identity_id`;
- validate that capability and qualification checks use principal and role fields without collapsing them into `agent_id`.
