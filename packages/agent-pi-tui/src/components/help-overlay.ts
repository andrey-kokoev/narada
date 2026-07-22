import { AGENT_WEB_UI_HELP_LINES } from '@narada2/nars-client-projection-contract';
import type { PiTheme } from '../types.js';
import { resetAnsi } from '../theme/theme.js';

export function renderHelpOverlay(width: number, theme: PiTheme): string[] {
  return AGENT_WEB_UI_HELP_LINES.map((line) => `${theme.muted}${line.slice(0, width)}${resetAnsi('')}`);
}

