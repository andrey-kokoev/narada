import type { PiStatusModel, } from './status-model.js';

export interface PiFooterModel {
  left: string;
  right: string;
}

export function buildFooterModel(status: PiStatusModel, view: string, pendingCount: number): PiFooterModel {
  const intelligence = [status.provider, status.model, status.thinking].filter(Boolean).join(' / ');
  return {
    left: `${status.connection} · ${view}${pendingCount ? ` · queued ${pendingCount}` : ''}`,
    right: [intelligence, status.usage].filter(Boolean).join(' · '),
  };
}

