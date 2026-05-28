# Directive As First-Class Object

## Decision

Narada should treat a **directive** as the first-class semantic object for intent addressed to an agent, carrier, Site, role, task, session, or workspace.

A prompt is not the first-class object. A prompt is one possible rendered delivery artifact derived from an admitted directive for an LLM substrate.

## Vocabulary

- **Directive**: typed intent object with source, authority, target, content, admission, delivery, and ordering semantics. It becomes durable when admitted, refused, delivered, or otherwise crossing a governed boundary.
- **Operator directive**: a directive whose source is the operator.
- **Agent directive**: a directive emitted by one agent toward another locus.
- **System directive**: a directive emitted by daemon, task lifecycle, policy, mailbox intake, scheduler, or another governed subsystem.
- **Prompt rendering**: runtime-specific text produced from one or more admitted directives.
- **Directive admission**: the validation and materialization decision before delivery.
- **Directive delivery**: the concrete transport form, such as prompt rendering, MCP message, task note, launch instruction, or lifecycle mutation request.

## Rationale

`prompt` is too substrate-colored. It names how many LLM runtimes receive text, not what Narada is governing.

The same intent may need to become:

- an LLM prompt fragment,
- a CLI input,
- an MCP tool call,
- a task lifecycle note,
- a launch instruction,
- a policy override request,
- or a refused/admitted event with no immediate runtime delivery.

Calling the durable object a directive keeps authority and routing separate from rendering.

## Shape

```json
{
  "schema": "narada.directive.v1",
  "directive_id": "dir_...",
  "created_at": "2026-05-27T00:00:00.000Z",
  "source": {
    "kind": "operator",
    "principal": "Andrey"
  },
  "authority": {
    "level": "operator_asserted",
    "basis": "interactive_session"
  },
  "kind": "launch_instruction",
  "target": {
    "site": "narada-revolution",
    "role": "builder",
    "agent": null,
    "runtime": "agent-cli",
    "task": null,
    "session": null,
    "workspace": null
  },
  "content": {
    "format": "markdown",
    "body": "Investigate mailbox intake and report only verified findings."
  },
  "delivery": {
    "allowed_forms": ["prompt_rendering", "mcp_message", "task_note"],
    "preferred_form": "prompt_rendering"
  },
  "ordering": {
    "priority": 100,
    "layer": "operator_instruction",
    "ttl": null
  },
  "admission": {
    "status": "pending",
    "event_id": null,
    "reason": null
  }
}
```

## Prompt Stack

When a directive is rendered as prompt context, the carrier should assemble the context explicitly:

1. Runtime/system contract.
2. Role and bootstrap material.
3. Admitted directives in deterministic order.
4. Task or work item context.
5. Session continuation context.

This ordering should be recorded so the received runtime context can be reconstructed.

## Admission Rules

- A directive is not automatically a task.
- A directive is not automatically a prompt.
- A directive is not automatically executable authority.
- Delivery requires admission by the relevant Site/runtime boundary.
- Refusals should be durable when the directive crosses a governed boundary.

## Relationship To Adjacent Concepts

This concept is coherent only if directive does not replace existing Narada intake and admission concepts.

| Existing concept | Relationship |
| --- | --- |
| Intent Candidate | Interpretation output. It is inert pressure before admission. A directive may be the admitted form of a candidate when the chosen path is instruction, constraint, routing, or delivery. |
| Canonical Inbox Envelope | Intake artifact for arrivals. An envelope may contain or produce a directive, but inbox submission remains inert and does not deliver the directive by itself. |
| Task Candidate | Proposed durable work. If admitted into task lifecycle, it becomes a task rather than a directive. |
| Task | Governed work item with lifecycle, assignment, evidence, review, and closure semantics. |
| Carrier Session | Runtime embodiment that may consume rendered directives, but does not own directive authority. |
| Prompt | Substrate-specific rendering of admitted directives plus role/bootstrap/task/session context. |
| Command Execution Intent | A directive may request command execution, but execution still crosses CEIZ and capability admission. |

Directive therefore sits between interpreted intent and concrete delivery. It names an addressable instruction/constraint/routing object, not a general replacement for inbox, task lifecycle, or command intent zones.

## Carrier Implications

Agent carriers should consume admitted directives rather than ad hoc prompt strings.

For `agent-cli`, this means the session startup path can eventually read admitted directives and render them into the chat context.

For Codex, Kimi, Pi, Claude Code, and other substrates, each carrier may render the same directive differently while preserving the same directive provenance.

## Task Lifecycle Relationship

Task creation is one possible outcome of directive admission, not the default outcome.

Examples:

- A directive to "work on task 12" should usually be delivered into an existing session or assignment flow.
- A directive that identifies new durable work may be admitted into task lifecycle.
- A directive that requests unsafe mutation may be refused and recorded without creating a task.

## Directive Versus Task

A directive is **addressed intent**. A task is **governed work**.

They differ by semantic commitment:

| Dimension | Directive | Task |
| --- | --- | --- |
| Core meaning | Intent to influence a locus | Unit of work accepted into lifecycle |
| Typical source | Operator, agent, daemon, policy, scheduler, mailbox intake | Task lifecycle admission path |
| Target | Site, role, agent, runtime, task, session, workspace, or subsystem | Work queue and accountable agent/role |
| Duration | May be transient or durable | Durable until closed, deferred, superseded, or otherwise disposed |
| Authority | Carries asserted source authority; still requires admission for delivery | Already admitted into task lifecycle authority |
| Delivery | Prompt rendering, MCP message, task note, launch instruction, refusal, etc. | Claim, execute, report, review, close |
| Success condition | May be delivered, refused, acknowledged, rendered, or transformed | Acceptance criteria satisfied and lifecycle closed |
| Ordering | Competes in context/session/directive ordering | Competes in work prioritization and assignment |
| Audit concern | Who asserted what intent toward which locus and how it was delivered | Who owned work, what changed, what evidence closed it |

A directive can produce a task when the system determines that the intent implies durable accountable work. A task can also produce directives when execution requires instructions to agents, carriers, or subsystems.

The boundary is:

- If the object primarily says **what should be communicated, constrained, routed, or rendered**, it is a directive.
- If the object primarily says **what work must be completed and evidenced**, it is a task.

Examples:

- "Launch all Revolution builders with this startup instruction" is a directive.
- "Fix Revolution mailbox intake bridge and verify task materialization" is a task.
- "Do not use native shell for this session" is a directive, possibly policy-like.
- "Investigate whether native shell should be disabled by default" is a task.
- "Tell the resident agent to watch for new mail" is a directive.
- "Implement resident-agent mailbox watch behavior" is a task.

## Residual Requirements

1. Define directive storage locus and export/import posture.
2. Define directive admission events.
3. Define prompt rendering provenance records.
4. Add startup/session integration for admitted directive consumption.
5. Define retention and TTL rules for short-lived operator directives.
