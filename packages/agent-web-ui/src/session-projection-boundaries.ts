export function normalizeProjectedSummary(kind: string, summary: unknown): unknown {
  return summary;
}

export function mergeAssistantMessageBoundary<T extends ProjectionBoundaryRow>(previous: T | null | undefined, row: T): T {
  if (!previous || previous.kind !== 'assistant_message' || row.kind !== 'assistant_message') return row;
  if (typeof previous.summary !== 'string' || typeof row.summary !== 'string') return row;
  const previousSummary = normalizeAssistantText(previous.summary);
  const nextSummary = normalizeAssistantText(row.summary);
  if (!previousSummary) return row;
  if (!nextSummary) return previous;
  if (nextSummary.includes(previousSummary)) return { ...row, summary: repairCollapsedAssistantBoundaries(nextSummary) } as T;
  if (previousSummary.includes(nextSummary)) return previous;
  return { ...row, summary: joinAssistantMessageBoundary(previousSummary, nextSummary) } as T;
}

export function joinAssistantMessageBoundary(left: unknown, right: unknown): string {
  const leftText = String(left ?? '').replace(/\s+$/, '');
  const rightText = String(right ?? '').replace(/^\s+/, '');
  if (!leftText) return rightText;
  if (!rightText) return leftText;
  return `${leftText}\n\n---\n\n${rightText}`;
}

export function repairCollapsedAssistantBoundaries(text: unknown): string {
  return String(text ?? '').replace(/([.!?])(?=(?:No|Yes|Done|Startup|Current|Next|The|There|I|We|This|That|It|Result|Evidence|Step|Identity|Hydrated|Latest|Pending)\b)/g, '$1\n\n---\n\n');
}

function normalizeAssistantText(value: unknown): string {
  return String(value ?? '').trim().replace(/\r\n/g, '\n');
}

type ProjectionBoundaryRow = {
  kind: string;
  summary: unknown;
  [key: string]: unknown;
};
