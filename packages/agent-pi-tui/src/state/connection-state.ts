import type { AttachPhase } from '../types.js';

export function connectionLabel(phase: AttachPhase): string {
  switch (phase) {
    case 'live': return 'connected';
    case 'replaying': return 'replaying';
    case 'recovering': return 'recovering';
    case 'reconnect_wait': return 'reconnecting';
    case 'connecting': return 'connecting';
    case 'closed': return 'detached';
    case 'failed': return 'failed';
    default: return phase;
  }
}

