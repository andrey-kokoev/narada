import { createCarrierTurnAdapter } from '@narada2/carrier-runtime/carrier-turn-adapter';
import { createNarsSessionSupervisor } from '@narada2/nars-session-core/session-supervisor';

function isProviderFollowUpRoundLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:provider_follow_up_round_limit_exceeded|carrier_turn_tool_round_limit_exceeded)(?::\d+)?$/.test(message);
}

/**
 * Transport-facing binding. The caller owns transport and process lifetime;
 * session lifecycle is delegated to nars-session-core and turns to the carrier.
 */
export function createRuntimeSessionBinding({ runtimeContext = {}, invokeIntelligenceFn, toolGateway = {}, buildTurnContext, handleControlRequest } = {}) {
  if (typeof invokeIntelligenceFn !== 'function') throw new Error('runtime_session_binding_invoke_intelligence_required');
  const sessionId = runtimeContext.session;
  if (!sessionId || !runtimeContext.sessionPath || !runtimeContext.eventsPath) {
    throw new Error('runtime_session_binding_context_required');
  }
  const carrier = createCarrierTurnAdapter({
    invokeIntelligence: ({ messages, tools, settings, abortSignal, turnId, inputEventId, invocationEventSink }) => invokeIntelligenceFn(messages, tools, {
      ...settings,
      abortSignal,
      turnId,
      inputEventId,
      invocationEventSink,
    }),
  });
  const sessionCarrier = {
    runTurn: async (...args) => {
      try {
        return await carrier.runTurn(...args);
      } catch (error) {
        // A bounded provider loop is a terminal turn outcome, not a runtime process failure.
        if (!isProviderFollowUpRoundLimitError(error)) throw error;
        return {
          terminal_state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  const defaultBuildTurnContext = (input) => ({
    turnId: input.event_id,
    messages: [{ role: 'user', content: input.content }],
  });
  return createNarsSessionSupervisor({
    sessionCoreOptions: {
      sessionId,
      agentId: runtimeContext.identity ?? null,
      sessionPath: runtimeContext.sessionPath,
      eventsPath: runtimeContext.eventsPath,
      siteRoot: runtimeContext.siteRoot ?? null,
    },
    carrier: sessionCarrier,
    toolGateway,
    handleControlRequest,
    buildTurnContext: (input) => {
      const turnContext = (buildTurnContext ?? defaultBuildTurnContext)(input);
      return {
        ...turnContext,
        maxToolRounds: turnContext.maxToolRounds ?? runtimeContext.maxToolRounds ?? 8,
      };
    },
  });
}
