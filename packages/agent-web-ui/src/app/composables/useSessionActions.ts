import type { ShallowRef } from 'vue';
import { toSessionProtocolFrame, type SessionProtocolFrame, type SessionTransport } from '../../protocol/sessionTransport';

export type ProtocolMethodSupport = (method: string) => boolean;

export function useSessionActions(
  transport: ShallowRef<SessionTransport | null>,
  retain: (event: unknown) => void,
  supportsProtocolMethod?: ProtocolMethodSupport,
) {
  function send(frame: SessionProtocolFrame | null): boolean {
    const admittedFrame = toSessionProtocolFrame(frame);
    if (!admittedFrame) {
      retain({ event: 'web_ui_input_not_sent', message: 'control frame was not admitted by the client contract', reason_code: 'invalid_session_control' });
      return false;
    }
    const method = admittedFrame.method;
    if (supportsProtocolMethod && !supportsProtocolMethod(method)) {
      retain({ event: 'web_ui_input_not_sent', message: 'control is not admitted by the attached runtime', reason_code: 'unsupported_session_control', method });
      return false;
    }
    let sent = false;
    try {
      sent = transport.value?.sendFrame(admittedFrame) ?? false;
    } catch (error) {
      retain({ event: 'web_ui_input_not_sent', message: error instanceof Error ? error.message : String(error), reason_code: 'transport_rejected_session_action', method });
      return false;
    }
    if (!sent) retain({ event: 'web_ui_input_not_sent', message: 'event stream is not open', method });
    return sent;
  }

  return { send };
}
