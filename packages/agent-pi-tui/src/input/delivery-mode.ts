import type { NarsProtocolFrame, PendingInput } from '../types.js';
import { buildQueuedSubmitFrame, buildSubmitFrame } from '../nars-client/protocol.js';

export function resolveDeliveryMode(activeTurn: boolean, requested: 'immediate' | 'admit_after_active_turn' | 'enqueue' = 'immediate'): PendingInput['deliveryMode'] {
  if (requested === 'enqueue' || requested === 'admit_after_active_turn' || activeTurn) return 'admit_after_active_turn';
  return 'immediate';
}

export function buildInputDeliveryFrame(content: string, options: {
  activeTurn?: boolean;
  deliveryMode?: 'immediate' | 'admit_after_active_turn' | 'enqueue';
  activeTurnId?: string;
  id?: string;
  idempotencyKey?: string;
} = {}): { frame: NarsProtocolFrame | null; deliveryMode: PendingInput['deliveryMode'] } {
  const deliveryMode = resolveDeliveryMode(options.activeTurn === true, options.deliveryMode);
  if (options.deliveryMode === 'enqueue') {
    return {
      frame: buildQueuedSubmitFrame(content, options),
      deliveryMode,
    };
  }
  return {
    frame: buildSubmitFrame(content, {
      ...options,
      deliveryMode,
    }),
    deliveryMode,
  };
}

