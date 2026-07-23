/** Ephemeral Pi continuation state. NARS records are never written here. */
export function createContinuationState({ sessionId, maxMessages = 200 } = {}) {
  const messages = [];
  let summary = null;
  let present = false;
  const limit = Math.max(16, Math.trunc(Number(maxMessages) || 200));
  return Object.freeze({
    sessionId: sessionId ?? null,
    append(message) {
      if (!message || typeof message !== 'object') return;
      messages.push(structuredClone(message));
      while (messages.length > limit) messages.shift();
      present = true;
    },
    setSummary(candidate) {
      summary = candidate == null ? null : structuredClone(candidate);
      present = summary != null || messages.length > 0;
    },
    projection() {
      return Object.freeze({
        summary: summary == null ? null : structuredClone(summary),
        messages: Object.freeze(messages.map((message) => structuredClone(message))),
      });
    },
    hasState() { return present; },
    clear() { messages.length = 0; summary = null; present = false; },
  });
}

