import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { buildAgentWebUiConversationEnqueueFrame, buildAgentWebUiConversationSendFrame, buildAgentWebUiConversationSteerFrame, parseAgentWebUiSnippetCommand } from '@narada2/nars-client-projection-contract';
import type { SessionController } from '../../session/controller';
import { deriveOperatorAction, type OperatorDeliveryMode } from '../../domain/commands';
import { projectOperatorQueue, type OperatorQueueItem } from './operator-queue';
import { createOperatorSnippetsController, type OperatorSnippet, type OperatorSnippetsController } from './operator-snippets';

export interface OperatorController {
  queueItems: ComputedRef<OperatorQueueItem[]>;
  snippets: OperatorSnippetsController;
  snippetPanelRequest: Ref<{ query: string; mode: 'list' | 'create'; id: number } | null>;
  submit(text: string, deliveryMode?: OperatorDeliveryMode): boolean;
  removeQueued(item: OperatorQueueItem): boolean;
  steerQueued(item: OperatorQueueItem): boolean;
  runSnippet(snippet: OperatorSnippet, deliveryMode?: OperatorDeliveryMode): boolean;
}

export function createOperatorController(session: SessionController): OperatorController {
  const snippets = createOperatorSnippetsController();
  const snippetPanelRequest = ref<{ query: string; mode: 'list' | 'create'; id: number } | null>(null);

  function inputIsAdmitted(content: string): boolean {
    const topology = session.runtimeTopology.value;
    if (topology.canSendInput) return true;
    session.appendLocal('web_ui_input_not_sent', { content, reason: topology.primaryCause });
    return false;
  }

  function sendAdmittedFrame(frame: unknown, content: string): boolean {
    const method = frame && typeof frame === 'object' && 'method' in frame && typeof frame.method === 'string'
      ? frame.method
      : null;
    if (method && session.supportsProtocolMethod && !session.supportsProtocolMethod(method)) {
      session.appendLocal('web_ui_input_not_sent', { content, reason: 'unsupported_session_control', method });
      return false;
    }
    const sent = session.sendFrame(frame);
    if (!sent) session.appendLocal('web_ui_input_not_sent', { content, reason: 'event stream is not connected' });
    return sent;
  }

  function runSnippet(snippet: OperatorSnippet, deliveryMode: OperatorDeliveryMode = 'send'): boolean {
    if (!inputIsAdmitted(snippet.body)) return false;
    const frame = deliveryMode === 'enqueue'
      ? buildAgentWebUiConversationEnqueueFrame(snippet.body, { id: `agent-web-ui2-snippet-enqueue-${Date.now()}`, activeTurnId: session.snapshot.value.activeTurnId ?? undefined })
      : buildAgentWebUiConversationSendFrame(snippet.body, { id: `agent-web-ui2-snippet-send-${Date.now()}` });
    if (!frame) return false;
    const sent = sendAdmittedFrame(frame, snippet.body);
    if (sent) snippets.markUsed(snippet.name);
    return sent;
  }

  function handleSnippetCommand(input: string): boolean {
    const trimmed = input.trim();
    if (/^\/snippets?(?:\s|$)/i.test(trimmed) && !/^\/snippet\s+/i.test(trimmed)) {
      snippetPanelRequest.value = { query: trimmed.replace(/^\/snippets?\s*/i, ''), mode: 'list', id: Date.now() };
      return true;
    }
    if (!/^\/snippet(?:\s|$)/i.test(trimmed)) return false;
    const parsed = parseAgentWebUiSnippetCommand(trimmed.replace(/^\/snippet\s*/i, ''));
    if (!parsed.recognized) return false;
    const action = parsed.action?.id;
    const remainder = parsed.remainder.trim();
    if (action === 'search') {
      snippetPanelRequest.value = { query: remainder, mode: 'list', id: Date.now() };
      return true;
    }
    if (action === 'save' || action === 'edit') {
      const [name, ...body] = remainder.split(/\s+/);
      const saved = snippets.save(name ?? '', body.join(' '), action === 'edit' ? name : undefined);
      session.appendLocal('agent_web_ui_message', { content: saved ? `${action === 'edit' ? 'Updated' : 'Saved'} snippet: ${saved.name}` : `Usage: /snippet ${action} <name> <text>` });
      return true;
    }
    if (action === 'delete') {
      const name = remainder.split(/\s+/)[0] ?? '';
      const removed = snippets.remove(name);
      session.appendLocal('agent_web_ui_message', { content: removed ? `Deleted snippet: ${removed.name}` : `Snippet not found: ${name || '<missing>'}` });
      return true;
    }
    if (action === 'run' || action === 'enqueue') {
      const name = remainder.split(/\s+/)[0] ?? '';
      const snippet = snippets.snippets.value.find((entry) => entry.name === name) ?? null;
      if (!snippet) {
        session.appendLocal('agent_web_ui_message', { content: `Snippet not found: ${name || '<missing>'}` });
        return true;
      }
      runSnippet(snippet, action === 'enqueue' ? 'enqueue' : 'send');
      return true;
    }
    snippetPanelRequest.value = { query: remainder, mode: 'list', id: Date.now() };
    return true;
  }

  function submit(text: string, deliveryMode: OperatorDeliveryMode = 'send'): boolean {
    if (handleSnippetCommand(text)) return true;
    const action = deriveOperatorAction(text, {
      id: `agent-web-ui2-${Date.now()}`,
      activeTurnId: session.snapshot.value.activeTurnId,
      deliveryMode,
      supportsProtocolMethod: session.supportsProtocolMethod,
    });
    if (!action) return false;
    if (action.kind === 'clear') {
      session.clearEvents();
      return true;
    }
    if (action.kind === 'message') {
      session.appendLocal('agent_web_ui_message', { content: action.message });
      return true;
    }
    if (action.kind === 'unsupported') {
      session.appendLocal('web_ui_input_not_sent', { content: text, reason: `unsupported browser action: ${action.actionKind}` });
      return false;
    }
    if (!inputIsAdmitted(text)) return false;
    return sendAdmittedFrame(action.frame, text);
  }

  const removeQueued = (item: OperatorQueueItem): boolean => submit(`/queue drop ${item.index}`);
  return {
    queueItems: computed(() => projectOperatorQueue(session.snapshot.value.health)),
    snippets,
    snippetPanelRequest,
    submit,
    removeQueued,
    steerQueued(item) {
      const activeTurnId = session.snapshot.value.activeTurnId;
      if (!inputIsAdmitted(item.content) || !activeTurnId || !removeQueued(item)) return false;
      const frame = buildAgentWebUiConversationSteerFrame(item.content, {
        id: `agent-web-ui2-steer-queued-${Date.now()}`,
        activeTurnId,
      });
      return frame ? sendAdmittedFrame(frame, item.content) : false;
    },
    runSnippet,
  };
}
