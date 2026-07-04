export function normalizeProjectedSummary(kind, summary) {
  return summary;
}

export function mergeAssistantMessageBoundary(previous, row) {
  if (!previous || previous.kind !== 'assistant_message' || row.kind !== 'assistant_message') return row;
  if (typeof previous.summary !== 'string' || typeof row.summary !== 'string') return row;
  const previousSummary = normalizeAssistantText(previous.summary);
  const nextSummary = normalizeAssistantText(row.summary);
  if (!previousSummary) return row;
  if (!nextSummary) return previous;
  if (nextSummary.includes(previousSummary)) return { ...row, summary: repairCollapsedAssistantBoundaries(nextSummary) };
  if (previousSummary.includes(nextSummary)) return previous;
  return { ...row, summary: joinAssistantMessageBoundary(previousSummary, nextSummary) };
}

export function joinAssistantMessageBoundary(left, right) {
  const leftText = String(left ?? '').replace(/\s+$/, '');
  const rightText = String(right ?? '').replace(/^\s+/, '');
  if (!leftText) return rightText;
  if (!rightText) return leftText;
  return `${leftText}\n\n---\n\n${rightText}`;
}

export function repairCollapsedAssistantBoundaries(text) {
  return String(text ?? '').replace(/([.!?])(?=(?:No|Yes|Done|Startup|Current|Next|The|There|I|We|This|That|It|Result|Evidence|Step|Identity|Hydrated|Latest|Pending)\b)/g, '$1\n\n---\n\n');
}

function normalizeAssistantText(value) {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}
