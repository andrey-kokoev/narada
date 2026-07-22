import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AttachPhase, AttachState, CursorStore } from '../types.js';

export class MemoryCursorStore implements CursorStore {
  private readonly cursors = new Map<string, number>();

  load(key: string): number | null {
    return this.cursors.get(key) ?? null;
  }

  save(key: string, sequence: number): void {
    const previous = this.cursors.get(key) ?? 0;
    if (sequence > previous) this.cursors.set(key, sequence);
  }
}

export class JsonCursorStore implements CursorStore {
  constructor(private readonly path: string) {}

  load(key: string): number | null {
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>;
      const value = Number(parsed[key]);
      return Number.isInteger(value) && value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  save(key: string, sequence: number): void {
    const current = this.load(key) ?? 0;
    if (sequence <= current) return;
    let parsed: Record<string, number> = {};
    try {
      parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, number>;
    } catch {
      // The cursor file is an optional local projection aid.
    }
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify({ ...parsed, [key]: sequence }, null, 2)}\n`, 'utf8');
  }
}

export function initialAttachState(endpoint: string, subscriptionId: string, cursor: number | null = null): AttachState {
  return {
    phase: 'idle',
    endpoint,
    transportReady: false,
    reconnectAttempt: 0,
    lastEventSequence: cursor,
    replayAttempt: 0,
    subscriptionId,
    lastTransportError: null,
  };
}

export function reconnectDelay(attempt: number, baseDelayMs: number, maxDelayMs = 30_000): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(maxDelayMs, Math.max(0, baseDelayMs) * 2 ** (normalizedAttempt - 1));
}

export function canReconnect(phase: AttachPhase, attempt: number, maxAttempts: number, enabled: boolean): boolean {
  return enabled && phase !== 'closing' && phase !== 'closed' && phase !== 'failed' && attempt < maxAttempts;
}

