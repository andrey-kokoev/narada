# Carrier Action Admission Boundary

## Definition

A **Carrier Action Admission Boundary** is the governed conversion boundary between an Agent Carrier's requested action and the authority-bearing Site structure that may admit, refuse, defer, or route that action.

It answers:

```text
When a carrier-hosted intelligence session asks to do something effectful,
what structure decides whether that request may become consequence?
```

It is not an approval prompt, a model tool call, an MCP server, a terminal permission dialog, or a vendor SDK policy. Those may embody parts of the flow. The boundary itself is the Narada-owned structure that prevents a carrier request from becoming authority merely because it is well-formed, convenient, or locally executable.

## De-Arbitrarized Core

The surface phrase "tool approval" hides several different structures. The Carrier Action Admission Boundary preserves the following split:

| Term | Primitive meaning | Not this |
| --- | --- | --- |
| Action request | A carrier/session-produced proposal to read, mutate, execute, send, publish, or otherwise affect a target. | Permission, execution, or confirmation. |
| Classification | Mapping the request to a consequence family, authority class, target locus, and risk posture. | A yes/no approval by itself. |
| Admission | The authority-bearing decision that the request may proceed under named policy and evidence. | The model selecting a tool, the tool existing, or the operator seeing a prompt. |
| Refusal | A durable decision that the request must not proceed, with reason and evidence. | A transient transport failure or missing implementation. |
| Candidate | An inert durable representation of a request awaiting admission by the owning authority. | A queued effect that will execute automatically without admission. |
| Execution attempt | A bounded attempt to perform an admitted action through the declared effect surface. | Confirmation that the outside world changed as intended. |
| Confirmation | Reconciliation evidence that the relevant external or internal state reached the claimed result. | A successful subprocess exit or API response by itself. |

The invariant is:

```text
carrier request
-> classify
-> bind target authority
-> admit/refuse/defer/route
-> execute only if admitted
-> reconcile confirmation separately
```

## Why This Boundary Exists

Agent carriers can host intelligence, expose MCP tools, and hold enough local context to propose useful actions. That makes them dangerous if their substrate convenience is treated as authority.

The boundary exists because these statements must remain true:

```text
tool request != tool admission
tool availability != capability grant
execution attempt != confirmation
transport connection != authority
carrier session != operational truth
```

A Narada Agent Runtime Server may receive an automation turn and produce a tool call. A Codex, Claude Code, Pi, Kimi, or Narada-native carrier may expose an action affordance. None of that decides whether a task should be claimed, an email should be sent, a file should be changed, a command should run, or a publication should occur.

## Required Properties

A Carrier Action Admission Boundary must:

- accept structured action requests from a carrier or runtime server;
- identify the bound `agent_id`, `carrier_session_id`, Site root, and request source;
- classify the request into a consequence family such as read, task lifecycle, inbox, outbox, command, publication, filesystem mutation, mailbox mutation, or external effect;
- identify the owning authority locus for the consequence family;
- verify required capability, consent, policy, operator confirmation, and target-locus constraints;
- create durable evidence for admission, refusal, deferral, or routing;
- keep raw secret values and unnecessary payload material out of admission evidence;
- execute nothing merely because a model requested it;
- distinguish execution attempt from confirmation;
- produce a stable result that the carrier can feed back into the turn as evidence, not as hidden authority.

## Consequence Families

The boundary should classify requests before deciding them.

| Family | Authority locus | Default posture |
| --- | --- | --- |
| Read-only context | Target Site read/capability policy | May be admitted automatically when explicitly classified read-only and in scope. |
| Task lifecycle mutation | Task governance service | Candidate or direct canonical lifecycle command only after task authority is satisfied. |
| Inbox admission | Canonical inbox service | Candidate/proposal until inbox authority admits it. |
| Outbox draft/send | Canonical outbox service | Draft candidate first; send requires explicit send authority. |
| Command/native execution | Command Execution Intent Zone or stricter command authority | Refuse or create inert command intent unless admitted by policy. |
| Filesystem/repository mutation | Site/repository mutation authority or publication intent service | Refuse or route to governed mutation/publication flow. |
| External service effect | Operation-specific effect authority | Candidate until capability, credential posture, and approval policy are satisfied. |
| Credential access | Capability/secret authority | Refuse by default; never expose secret values through carrier evidence. |

These families are extensible, but the extension point is classification under an authority locus, not arbitrary tool naming.

## Request Shape

A request entering the boundary should be explicit enough to classify without reading the carrier's mind:

```json
{
  "schema": "narada.carrier_action_request.v0",
  "request_id": "car_act_...",
  "agent_id": "narada-andrey.Kevin",
  "carrier_session_id": "carrier_...",
  "source": {
    "kind": "agent_runtime_server_turn",
    "turn_id": "turn_..."
  },
  "target_locus": {
    "site_root": "C:/Users/Andrey/Narada",
    "authority_hint": "task_governance_service"
  },
  "requested_action": {
    "tool": "task_lifecycle_claim",
    "arguments_ref": "mcp_output_or_payload_ref",
    "declared_family": "task_lifecycle_mutation"
  },
  "authority_ref": null
}
```

Inline arguments are acceptable only when bounded and non-secret. Larger or sensitive payloads should be referenced through a redacted evidence object.

## Decision Shape

The boundary emits a decision, not a hidden side effect:

```json
{
  "schema": "narada.carrier_action_admission_decision.v0",
  "request_id": "car_act_...",
  "decision": "refused",
  "reason": "missing_task_activation_authority",
  "authority_owner": "task_governance_service",
  "carrier_mutation_admitted": false,
  "candidate_ref": null,
  "execution_attempt_ref": null,
  "confirmation_ref": null,
  "evidence_path": ".narada/crew/action-admission/car_act_....json"
}
```

Allowed decision values:

| Decision | Meaning |
| --- | --- |
| `admitted` | The request may proceed through the named authority surface. |
| `refused` | The request must not proceed. |
| `deferred` | More evidence, consent, or operator input is required. |
| `routed` | The request has been converted into an inert candidate for another authority surface. |
| `read_only_admitted` | The request is classified as read-only and may execute under read policy. |

The decision must say whether carrier mutation was admitted. That field should be false for candidates, referrals, drafts, and refusals.

## Relationship To Agent Runtime Server

A Narada Agent Runtime Server is allowed to host intelligence and mediate local MCP tools. It must not become the admission authority for effectful work.

When Agent Runtime Server receives a model-selected tool call, it should do one of three things:

1. Execute it if it is classified read-only and admitted by policy.
2. Emit an `action_admission_required` result and create or expose a Carrier Action Request.
3. Refuse it when classification or target authority cannot be established.

Agent Runtime Server remains responsible for turn/session evidence. The Carrier Action Admission Boundary remains responsible for the conversion from requested action to governed consequence.

## Current Agent Runtime Server Implementation Posture

The first implemented Agent Runtime Server slice is a non-effectful admission layer.

MCP surface metadata is projected from the Site-local `.narada/capabilities/mcp-surfaces.json` registry through `@narada2/mcp-fabric`. The registry loader accepts both current `surfaces` entries with `tool_contract` and older `mcp_surfaces` entries with `registered_live_tools`. Registered live tools without an explicit contract receive conservative metadata: known read-only names remain read-only, known mutating names route to admission, and unknown registered tools require admission rather than execution. The live carrier/server layer preserves matched registry metadata on discovered MCP servers and passes it into `@narada2/carrier-action-admission` before any tool execution decision.

Registry metadata is authoritative for a matched surface. If a live MCP server exposes a tool that is absent from its authoritative surface contract, the request is refused with `surface_registry_tool_not_declared`. Closed-name fallback classification is reserved for tools and servers without registry-backed metadata; it must not silently grant posture to an unlisted tool on an authoritative surface. Registry-to-client-config validation is diagnostic during carrier startup and strict only when explicitly requested by tooling such as doctors, audits, or tests.

In NARS server mode for `-Runtime agent-cli` compatibility launches:

- read-only admitted requests execute and return tool output;
- mutating, external-effecting, credential-bearing, unknown, ambiguous, and authoritative-unlisted requests do not execute;
- routed requests create inert candidates under `.narada/crew/action-admission/candidates/`;
- every routed or refused request writes durable evidence under `.narada/crew/action-admission/`;
- evidence includes classifier provenance through `classifier_source` and `classifier_metadata`, including source, surface id, server name, registry source, registry-authoritative posture, live-catalog availability, and availability status.

This is not the full authority layer. It is the boundary that prevents carrier tool availability from becoming admission. Canonical task, inbox, outbox, command, publication, and external-effect authorities remain separate owners of admitted consequence.

Verification commands for this slice:

```powershell
pnpm --filter @narada2/mcp-fabric test
pnpm --filter @narada2/mcp-fabric typecheck
pnpm --filter @narada2/carrier-action-admission test
pnpm --filter @narada2/carrier-action-admission typecheck
pnpm --filter @narada2/agent-cli test
pnpm --filter @narada2/agent-cli typecheck
pnpm --filter @narada2/cli test -- carrier-actions
pnpm --filter @narada2/cli typecheck
```

## Relationship To Agent Carriers

Every carrier family needs the same boundary even if its implementation differs:

| Carrier family | Boundary embodiment |
| --- | --- |
| Codex CLI carrier | Disable native shell by default; route effect requests through Narada MCP/canonical surfaces. |
| Claude Code carrier | Convert carrier effect requests into inert governed candidates before canonical admission. |
| Pi carrier | Treat Pi tool/output requests as carrier action requests unless read-only admitted. |
| Agent CLI / Agent Runtime Server | Return `action_admission_required` for non-read-only MCP calls in server mode. |
| Narada-native carrier | Implement the boundary directly as a first-class runtime component. |

The boundary is invariant. The carrier-specific prompt, CLI flag, MCP bridge, or event adapter is an embodiment.

## De-Arbitrarized Closure Test

This concept is sufficiently de-arbitrarized when the following questions have structural answers:

- What kind of consequence is being requested?
- Which authority locus owns that consequence?
- Is the request read-only, mutating, external-effecting, or credential-bearing?
- What policy, capability, consent, or operator confirmation is required?
- Is the result an admission, refusal, deferral, or route to an inert candidate?
- What evidence records the decision?
- If execution occurs, what separately records the attempt?
- If confirmation is claimed, what separately reconciles it?

If any of these answers depends on the model's phrasing, a terminal's current affordance, a tool name convention, or a vendor SDK's permission prompt, the boundary has not been reached.

## Anti-Collapse Rules

- A model-selected tool call is not admission.
- A tool catalog entry is not a capability grant.
- A local MCP server is not an authority locus.
- A human-facing approval prompt is an embodiment, not the boundary itself.
- A carrier session may request action but must not silently own the consequence.
- A queued candidate is inert until the owning authority admits it.
- An execution attempt is not confirmation.
- A successful API/subprocess response is not final truth unless reconciled by the relevant authority.
- Secret-bearing payloads must not become admission evidence.

## Relationship To Existing Concepts

- [`Narada Agent Runtime Server`](narada-agent-runtime-server.md) defines the machine-addressable session that produces action requests.
- [`Agent Carrier`](agent-carrier.md) defines the runtime embodiment that must route effectful crossings through this boundary.
- [`Carrier And Site Fabric Coherence`](carrier-and-site-fabric-coherence.md) defines evidence levels for carrier conformance and launcher-known Site MCP fabric audit posture.
- [`Command Execution Intent Zone`](command-execution-intent-zone.md) governs command/native execution requests.
- [`Canonical Mutation Evidence`](canonical-mutation-evidence.md) defines evidence posture for admitted mutations.
- [`Tool Catalog Binding`](../product/tool-catalog-binding.md) defines tool availability and operation binding; this boundary decides whether an individual requested action may proceed.
- [`Plural Embodiment, Singular Authority`](plural-embodiment-singular-authority.md) supplies the broader invariant: many carriers may embody work, but authority remains singular.

## First Implementation Direction

The first implementation should extend Agent Runtime Server mode's current `action_admission_required` result into a durable Carrier Action Request record under the target Site, then add a small admission dispatcher that can:

- admit read-only requests mechanically;
- route task/inbox/outbox/publication/command requests to existing canonical surfaces;
- refuse unknown, ambiguous, cross-Site, credential-bearing, or native-shell requests by default;
- emit a decision record for the carrier to read back into the active turn.

Do not start with a UI prompt system. UI prompts are one possible policy embodiment. The invariant layer is the request-to-authority conversion boundary.
