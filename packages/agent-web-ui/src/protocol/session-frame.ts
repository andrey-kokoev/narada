import { isRecord } from '../types.ts';

export type SessionProtocolFrame = {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
};

export function toSessionProtocolFrame(value: unknown): SessionProtocolFrame | null {
  if (!isRecord(value) || typeof value.method !== 'string' || !value.method) return null;
  const params = value.params;
  if (params !== undefined && !isRecord(params)) return null;
  return {
    ...(typeof value.id === 'string' ? { id: value.id } : {}),
    method: value.method,
    ...(params === undefined ? {} : { params }),
  };
}
