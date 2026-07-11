import { createCarrierTurnAdapter } from '@narada2/carrier-runtime/carrier-turn-adapter';
import { createNarsSessionSupervisor } from '@narada2/nars-session-core/session-supervisor';

/**
 * Transport-facing binding. The caller owns transport and process lifetime;
 * session lifecycle is delegated to nars-session-core and turns to the carrier.
 */
export function createRuntimeSessionBinding({ runtimeContext = {}, callChatApiFn, toolGateway = {}, buildTurnContext, handleControlRequest } = {}) {
  if (typeof callChatApiFn !== 'function') throw new Error('runtime_session_binding_call_provider_required');
  const sessionId = runtimeContext.session;
  if (!sessionId || !runtimeContext.sessionPath || !runtimeContext.eventsPath) {
    throw new Error('runtime_session_binding_context_required');
  }
  const carrier = createCarrierTurnAdapter({
    callProvider: ({ messages, tools, settings, abortSignal }) => callChatApiFn(messages, tools, { ...settings, abortSignal }),
  });
  return createNarsSessionSupervisor({
    sessionCoreOptions: {
      sessionId,
      agentId: runtimeContext.identity ?? null,
      sessionPath: runtimeContext.sessionPath,
      eventsPath: runtimeContext.eventsPath,
      siteRoot: runtimeContext.siteRoot ?? null,
    },
    carrier,
    toolGateway,
    handleControlRequest,
    buildTurnContext: buildTurnContext ?? ((input) => ({
      turnId: input.event_id,
      messages: [{ role: 'user', content: input.content }],
      settings: runtimeContext.providerSettings ?? {},
    })),
  });
}
