# Reactor Pattern

A **reactor** is a component that consumes admitted facts, evaluates them against a bound **charter**, and may propose an effect. It is not an [observer](conversation-observer.md): an observer is read-only, while a reactor may produce an outbound reaction that must still cross a governed effect boundary.

The reactor pattern is the canonical Narada way to let an operator and one or more agents carry a conversation while another agent (or rule) evaluates each message and may reply. The pattern preserves Intelligence-Authority Separation: the reactor evaluates and proposes; the control plane admits and commits.

## Reactor vs Observer

| | Observer | Reactor |
| --- | --- | --- |
| Reads facts | Yes | Yes |
| Proposes effects | No | Yes |
| Authority posture | Read-only note / interjection | Proposal subject to admission |
| Typical output | Labeled observation | Inbox proposal, intent, or outbound command |

A reactor is therefore closer to a charter-bound actor than to a passive watcher.

## Charter As The Authority-Bearing Object

A **charter** is the admitted policy or instruction set that governs what the reactor may do. The reactor is only the executor bound to the charter.

- In an **in-kernel reactor**, the kernel both holds the charter and executes it.
- In an **agent reactor**, the external agent holds or is bound to the charter and cites it when proposing a reaction.

The charter is the *reason* a proposal is admitted, not the agent or component that made it.

## Implementation Location

The reactor implementation lives in the control-plane monorepo package:

- `packages/layers/control-plane/src/reactor/` — core reactor types, registry, in-kernel evaluator, agent bridge, governance, and proposal materialization.
- `packages/domains/charters/src/` — reactor charter schema extensions when the charter surface stabilizes.

It is intentionally not extracted to a separate repository until the layer meets the extraction criteria in [`packages/layers/control-plane/docs/02-architecture.md`](../../packages/layers/control-plane/docs/02-architecture.md).

## Runtime Location

The reactor can live in one of four combinations. The coherent Narada paths are the diagonal; the off-diagonal paths are possible but require extra care.

| Separate runtime? | Is it an agent? | Name | Example |
| --- | --- | --- | --- |
| No | No | **In-kernel reactor** | A rule evaluated by the kernel charter runtime. |
| Yes | Yes | **Agent reactor** | An external agent session that reads facts and proposes replies. |
| Yes | No | Non-agent worker | Outbound worker, source adapter, bus consumer. No judgment, only admitted behavior. |
| No | Yes | Embedded agent | A model call inside the kernel. Coherent only if its output is still admitted by the control plane. |

## Production Routing Path

A reactor must never send a chat reply directly. The production path is:

```text
chat message
  -> Canonical Inbox / fact admission
  -> reactor evaluates against charter
  -> proposal or decision
  -> Foreman / IntentHandoff
  -> OutboundHandoff
  -> outbound worker
  -> chat reply
```

This path applies whether the reactor is in-kernel or an external agent. The only difference is where the evaluation happens.

## Operator Surface Message Bus Posture

The Operator Surface Message Bus is a **dev/observability-only** projection surface. It may render traffic, power local diagnostics, and assist UI development, but it must not be used for production routing of reactor traffic.

Specifically, the bus must not:
- deliver messages to a reactor,
- trigger reactor evaluation,
- carry reactor proposals,
- or carry outbound replies.

Production reactors consume admitted facts or inbox envelopes from the Site's durable substrate, not from the bus.

## Target Charter Schema

A reactor charter should declare at least:

| Field | Meaning |
| --- | --- |
| `charter_id` | Stable identity. |
| `version` | Versioned policy. |
| `trigger.fact_types` | Which facts may trigger evaluation. |
| `trigger.sources` | Which principals/sources are in scope. |
| `trigger.exclude_own_replies` | Whether to ignore the reactor's own outputs. |
| `evaluation.mode` | `rule` for in-kernel evaluation, `agent_prompt` for external agent evaluation. |
| `evaluation.rule.condition` | Deterministic condition for `rule` mode. |
| `evaluation.prompt.instructions` | Prompt for `agent_prompt` mode. |
| `evaluation.prompt.context_window` | How much prior context the agent may see. |
| `allowed_reactions` | What effects the reactor may propose. |
| `admission.mode` | `auto`, `operator_confirm`, or `foreman_rule`. |
| `idempotency.key_template` | How to derive idempotency keys. |

This schema is a target shape. Existing charters may not yet expose every field.

## In-Kernel Reactor

- Evaluation happens inside `@narada2/control-plane`.
- Best for deterministic rules that can be fully specified in advance.
- Admission may be automatic when the rule is admitted and the output is within `allowed_reactions`.

## Agent Reactor

- Evaluation happens in an external [AgentRuntime](operator-surface.md) bound to the Site.
- The agent reads admitted facts or inbox envelopes.
- When it wants to react, it submits a proposal to the [Canonical Inbox](canonical-inbox.md).
- Admission is never automatic solely because the agent proposed; an authority must admit the proposal.

## Anti-Patterns

- **Direct chat injection**: a reactor calling the chat send API directly. This bypasses the Intent boundary.
- **Bus-as-routing-layer**: using the Operator Surface Message Bus to trigger or transport production reactor traffic.
- **Observer-as-reactor**: calling a read-only observer a reactor while letting it propose effects.
- **Embedded agent commits**: an agentic component inside the kernel that both evaluates and commits without Foreman admission.

## Related Doctrine

- [Conversation Observer](conversation-observer.md) — read-only observation, not a reactor.
- [Operator Surface](operator-surface.md) — presentation and interaction, not authority.
- [Canonical Inbox](canonical-inbox.md) — inert intake for proposals.
- [Canonical Outbox](canonical-outbox.md) — durable outbound effect boundary.
- [Governed Crossing](governed-crossing.md) — arrival, admission, execution, and truth remain separate.
- [Agent Carrier](agent-carrier.md) — how an external agent runtime is bound without gaining authority.
