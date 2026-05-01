import type { TaskFrontMatter } from './task-governance.js';

export interface PrototypeClosurePosture {
  applies: boolean;
  terms: string[];
  has_continuation_relation: boolean;
  no_continuation_needed_rationale: string | null;
  scope_complete: boolean;
  capability_complete: boolean;
  warning?: string;
}

const PROTOTYPE_TERMS = [
  'facade',
  'prototype',
  'spike',
  'design-only',
  'design only',
  'proof of concept',
  'poc',
];

function textIncludesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function hasContinuationRelation(frontMatter: TaskFrontMatter, body: string): boolean {
  const continuationTasks = frontMatter.continuation_tasks;
  if (Array.isArray(continuationTasks) && continuationTasks.length > 0) return true;
  if (typeof continuationTasks === 'string' && continuationTasks.trim().length > 0) return true;
  return /\b(continuation|follow[- ]?up|implementation)\s+task\b[^\n]*\b\d+\b/i.test(body) ||
    /\btask\s+#?\d+\b[^\n]*\b(continuation|follow[- ]?up|implementation)\b/i.test(body);
}

export function analyzePrototypeClosure(frontMatter: TaskFrontMatter, body: string): PrototypeClosurePosture {
  const text = `${String(frontMatter.title ?? '')}\n${body}`;
  const terms = PROTOTYPE_TERMS.filter((term) => textIncludesTerm(text, term));
  const noContinuation = typeof frontMatter.no_continuation_needed_rationale === 'string'
    ? frontMatter.no_continuation_needed_rationale.trim()
    : '';
  const applies = terms.length > 0;
  const continuation = hasContinuationRelation(frontMatter, body);
  const capabilityComplete = applies ? continuation || noContinuation.length > 0 : true;
  return {
    applies,
    terms,
    has_continuation_relation: continuation,
    no_continuation_needed_rationale: noContinuation || null,
    scope_complete: true,
    capability_complete: capabilityComplete,
    ...(applies && !capabilityComplete
      ? { warning: 'Scope may be complete, but facade/prototype/spike/design-only language requires continuation evidence or a no-continuation-needed rationale before capability-complete closure.' }
      : {}),
  };
}
