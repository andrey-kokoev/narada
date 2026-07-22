import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import type { PiRenderableContent, PiRowViewModel, PiTheme } from '../types.js';
import { resetAnsi } from '../theme/theme.js';

export interface PiComponentLike {
  render(width: number): string[];
  invalidate(): void;
  handleInput?(data: string): void;
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

export function truncateVisible(value: string, width: number): string {
  const limit = Math.max(1, Math.floor(width));
  return visibleWidth(value) <= limit ? value : truncateToWidth(value, limit, '…');
}

export function wrapPlain(value: string, width: number): string[] {
  const limit = Math.max(1, Math.floor(width));
  const lines = wrapTextWithAnsi(String(value), limit);
  return lines.length ? lines : [''];
}

export function contentText(content: PiRenderableContent): string {
  switch (content.type) {
    case 'artifact_ref': return `[artifact ${content.title ?? content.artifact_id}]`;
    case 'intent_ref': return `[intent ${content.label ?? content.intent}]`;
    case 'image': return `[image ${content.alt ?? content.artifact_id}]`;
    default: return content.text;
  }
}

function toneColor(theme: PiTheme, tone: string | undefined): string {
  switch (tone) {
    case 'assistant': return theme.assistant;
    case 'operator': return theme.operator;
    case 'tool': return theme.tool;
    case 'error': return theme.error;
    case 'status': return theme.success;
    case 'session': return theme.diagnostic;
    default: return theme.muted;
  }
}

export function renderRow(row: PiRowViewModel, width: number, theme: PiTheme, expanded = false): string[] {
  const prefix = row.projectionClass === 'conversation' && row.kind.startsWith('assistant')
    ? '  '
    : `${row.pending ? '…' : row.terminal ? '✓' : '·'} `;
  const label = row.projectionClass === 'conversation' && row.kind.startsWith('assistant') ? '' : `${row.kind} `;
  const text = row.content.map(contentText).join('');
  const body = expanded && row.event ? `${text}\n${JSON.stringify(row.event)}` : text;
  const lines = wrapPlain(`${label}${body}`, Math.max(1, width - prefix.length));
  const color = toneColor(theme, row.tone);
  return lines.map((line) => `${color}${prefix}${line}${resetAnsi('')}`);
}

export function renderRows(rows: readonly PiRowViewModel[], width: number, theme: PiTheme, expanded: ReadonlySet<string> = new Set()): string[] {
  return rows.flatMap((row) => renderRow(row, width, theme, expanded.has(row.renderKey)));
}
