function roleForEvent(event: any) {
  // A queued input is not yet admitted conversation.  Session-core emits the
  // canonical `user_message` after admission; projecting the queue marker
  // would let an unadmitted input reach Pi during context reconstruction.
  if (event?.event === 'user_message') return 'user';
  if (event?.event === 'assistant_message') return 'assistant';
  if (['tool_result_received', 'tool_result', 'tool_execution_completed', 'carrier_tool_completed'].includes(event?.event)) return 'tool';
  return null;
}

function contentForEvent(event: any) {
  return event?.content
    ?? event?.message?.content
    ?? event?.result
    ?? event?.tool_result
    ?? event?.output
    ?? null;
}

function messageForEvent(event: any, role: any) {
  const source: any = event?.message && typeof event.message === 'object' ? event.message : event;
  const content: any = contentForEvent(event);
  const toolCalls: any = source?.tool_calls ?? source?.toolCalls ?? event?.tool_calls ?? event?.toolCalls ?? null;
  const hasToolCalls: any = Array.isArray(toolCalls) && toolCalls.length > 0;
  if (content == null && !hasToolCalls) return null;
  const toolCallId: any = source?.tool_call_id ?? source?.toolCallId ?? event?.tool_call_id ?? event?.toolCallId ?? null;
  return {
    role,
    // A null assistant content is meaningful when the message carries tool
    // calls; dropping it changes the next admitted turn's context.
    content: content == null ? null : typeof content === 'string' ? content : JSON.stringify(content),
    ...(source?.name ? { name: String(source.name) } : {}),
    ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    ...(hasToolCalls ? { tool_calls: structuredClone(toolCalls) } : {}),
  };
}

function stableMessageKey(message: any) {
  if (!message || typeof message !== 'object') return JSON.stringify(message);
  return JSON.stringify({
    role: message.role ?? null,
    content: message.content ?? null,
    name: message.name ?? null,
    tool_call_id: message.tool_call_id ?? message.toolCallId ?? null,
    tool_calls: message.tool_calls ?? null,
  });
}

/**
 * The carrier supplies the current in-turn projection for tool follow-ups,
 * while the journal supplies the already durable prefix. Remove only their
 * deterministic suffix/prefix overlap; never de-duplicate arbitrary messages
 * by content because two admitted turns may legitimately say the same thing.
 */
function appendNonOverlappingCurrentMessages(canonicalMessages: any, currentMessages: any) {
  const maxOverlap: any = Math.min(canonicalMessages.length, currentMessages.length);
  for (let overlap = maxOverlap; overlap >= 0; overlap -= 1) {
    const canonicalTail: any = canonicalMessages.slice(canonicalMessages.length - overlap);
    const currentHead: any = currentMessages.slice(0, overlap);
    if (canonicalTail.every((message: any, index: any) => stableMessageKey(message) === stableMessageKey(currentHead[index]))) {
      return [...canonicalMessages, ...currentMessages.slice(overlap)];
    }
  }
  return [...canonicalMessages, ...currentMessages];
}

/** Reconstruct Pi context from NARS-owned events; Pi state is never consulted. */
export function buildPiContextFromNarsRecords({
  sessionSnapshot = null,
  turn,
  events = [],
  maxMessages = 200,
  systemPosture = null,
}: any = {}) {
  const messages: any = [];
  if (typeof systemPosture === 'string' && systemPosture.trim()) messages.push({ role: 'system', content: systemPosture.trim() });
  for (const event of Array.isArray(events) ? events : []) {
    const role: any = roleForEvent(event);
    if (!role) continue;
    const message: any = messageForEvent(event, role);
    if (message) messages.push(message);
  }
  const currentMessages: any = Array.isArray(turn?.messages) ? turn.messages : [];
  const combined: any = appendNonOverlappingCurrentMessages(messages, currentMessages);
  return Object.freeze({
    schema: 'narada.nars.pi.context_projection.v1',
    source: 'nars-owned-records',
    session_id: sessionSnapshot?.session_id ?? sessionSnapshot?.sessionId ?? null,
    turn_id: turn?.turn_id ?? turn?.turnId ?? null,
    messages: Object.freeze(combined.slice(-Math.max(1, Math.trunc(Number(maxMessages) || 200))).map((message: any) => structuredClone(message))),
    compaction_summary: sessionSnapshot?.compaction_summary ?? null,
    canonical_history_reconstructable: true,
  });
}

export function createNarsPiContextBuilder({ readNarsRecords = async () => [], maxMessages = 200, systemPosture = null }: any = {}) {
  return Object.freeze({
    async buildContext({ sessionSnapshot = null, turn }: any = {}) {
      const events: any = await readNarsRecords({ sessionSnapshot, turn });
      return buildPiContextFromNarsRecords({ sessionSnapshot, turn, events, maxMessages, systemPosture });
    },
  });
}
