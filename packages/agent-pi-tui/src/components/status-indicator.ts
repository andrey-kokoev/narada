import type { PiTheme } from '../types.js';
import type { PiStatusModel } from '../projection/status-model.js';
import { resetAnsi } from '../theme/theme.js';

export function renderStatusIndicator(status: PiStatusModel, width: number, theme: PiTheme): string {
  const parts = [status.connection, status.health, status.provider, status.model].filter(Boolean).join(' · ');
  return `${theme.accent}${parts || 'detached'}${resetAnsi('').slice(0, Math.max(0, width + 20))}`;
}

