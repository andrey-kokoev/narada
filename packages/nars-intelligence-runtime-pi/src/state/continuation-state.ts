/** Ephemeral Pi continuation state. NARS records are never written here. */
export function createContinuationState({ sessionId, maxMessages = 200 }: any = {}) {
  const messages: any = [];
  let summary: any = null;
  let present: any = false;
  const limit: any = Math.max(16, Math.trunc(Number(maxMessages) || 200));
  return Object.freeze({
    sessionId: sessionId ?? null,
    append(message: any) {
      if (!message || typeof message !== 'object') return;
      messages.push(structuredClone(message));
      while (messages.length > limit) messages.shift();
      present = true;
    },
    setSummary(candidate: any) {
      summary = candidate == null ? null : structuredClone(candidate);
      present = summary != null || messages.length > 0;
    },
    projection() {
      return Object.freeze({
        summary: summary == null ? null : structuredClone(summary),
        messages: Object.freeze(messages.map((message: any) => structuredClone(message))),
      });
    },
    hasState() { return present; },
    clear() { messages.length = 0; summary = null; present = false; },
  });
}

