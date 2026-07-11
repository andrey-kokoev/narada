import type { ShallowRef } from 'vue';
import type { SessionTransport } from '../../protocol/sessionTransport';

export type ProtocolMethodSupport = (method: string) => boolean;

export function useSessionActions(
  transport: ShallowRef<SessionTransport | null>,
  retain: (event: unknown) => void,
  supportsProtocolMethod?: ProtocolMethodSupport,
) {
  function send(frame: unknown): boolean {
    const method = frame && typeof frame === 'object' && typeof (frame as { method?: unknown }).method === 'string'
      ? (frame as { method: string }).method
      : null;
    if (!method) {
      retain({ event: 'web_ui_input_not_sent', message: 'session action has no admitted protocol method', reason_code: 'invalid_session_action' });
      return false;
    }
    if (supportsProtocolMethod && !supportsProtocolMethod(method)) {
      retain({ event: 'web_ui_input_not_sent', message: 'control is not admitted by the attached runtime', reason_code: 'unsupported_session_control', method });
      return false;
    }
    const sent = transport.value?.sendFrame(frame) ?? false;
    if (!sent) retain({ event: 'web_ui_input_not_sent', message: 'event stream is not open', method });
    return sent;
  }

  return { send };
}
