# Conversation Observer

A Conversation Observer is an `observer` role embodiment that watches a bounded Carrier Session and may surface labeled observations or proposed interjections without becoming the Operator, the active Agent, or a hidden system prompt.

## Shape

```text
Carrier session events
-> read-only observer evaluation
-> observer observation or proposed interjection
-> carrier admission and visibility policy
-> labeled transcript record or suppression evidence
```

The observer may be launched through an MCP or control channel, but that channel is only transport. It does not grant authority, task ownership, review power, mutation capability, or permission to silently steer the active agent.

## Visibility

Observer outputs use one of these postures:

- `record_only` records evidence without display or provider-context injection.
- `operator_visible` displays a labeled note to the Operator without sending it to the active agent model.
- `agent_visible` admits a labeled observer note through the provider-turn path, queueing while another turn is active.
- `conversation_visible` displays the note and admits it through the provider-turn path, queueing while another turn is active.

The default visibility posture is `operator_visible`. Carrier input normalization may still use `admit_after_active_turn` so observer input has stable ordering relative to active work.

## Invariants

- No hidden injection.
- No impersonation of Operator, system directive, or active Agent.
- No observer tool execution in the first slice.
- No task mutation, assignment, review, acceptance, rejection, or closure.
- Visible interjections must be labeled with observer identity and rule evidence.
- Suppressed interjections still emit session evidence.

This keeps observation useful without turning the observer into an autoimmune repair daemon.

## Reactor Distinction

A [reactor](reactor-pattern.md) is not a Conversation Observer. A reactor evaluates admitted facts against a charter and may propose an effect. An observer is read-only. Conflating the two would let an observer smuggle effect authority into a read-only role.
