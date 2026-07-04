export function messagesWithCarrierGoal(messages, goal = null) {
  const normalized = normalizeCarrierGoalState(goal);
  if (!normalized.value || normalized.status !== 'active') return messages;
  const goalMessage = { role: 'system', content: `Active carrier session goal: ${normalized.value}\nUse this as the persistent task target and completion criterion while it remains active.` };
  const insertAt = messages.findIndex((message) => message.role !== 'system');
  return insertAt === -1 ? [...messages, goalMessage] : [...messages.slice(0, insertAt), goalMessage, ...messages.slice(insertAt)];
}

export function normalizeCarrierGoalState(goal) {
  if (goal && typeof goal === 'object') return createCarrierGoalState(goal.value ?? '', goal.status ?? 'active');
  return createCarrierGoalState(goal ?? '');
}

export function createCarrierGoalState(value = '', status = 'active') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return { value: normalized, status: normalized ? (String(status).toLowerCase() === 'paused' ? 'paused' : 'active') : 'unset' };
}

export function carrierGoalStatusLabel(goal) {
  const normalized = normalizeCarrierGoalState(goal);
  if (!normalized.value) return 'not set';
  return `${normalized.value} (${normalized.status})`;
}
