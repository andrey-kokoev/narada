import { createCarrierTurnAdapter } from '@narada2/carrier-runtime/carrier-turn-adapter';
import { createNarsSessionSupervisor } from '@narada2/nars-session-core/session-supervisor';
import { NarsIntelligenceInvocationError } from './intelligence-runtime-controller.mjs';

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
    invokeIntelligence: ({ messages, tools, settings, abortSignal, turnId, inputEventId, runtimeRequestId, runtime_request_id, idempotencyKey, idempotency_key, turnAttempt, turn_attempt, invocationEventSink, toolGateway }) => invokeIntelligenceFn(messages, tools, {
      ...settings,
      abortSignal,
      turnId,
      inputEventId,
      runtimeRequestId: runtimeRequestId ?? runtime_request_id,
      runtime_request_id: runtimeRequestId ?? runtime_request_id,
      idempotencyKey: idempotencyKey ?? idempotency_key,
      idempotency_key: idempotencyKey ?? idempotency_key,
      turnAttempt: turnAttempt ?? turn_attempt,
      turn_attempt: turnAttempt ?? turn_attempt,
      invocationEventSink,
      capabilityGateway: toolGateway,
    }),
  });
  const sessionCarrier = {
    runTurn: async (...args) => {
      try {
        return await carrier.runTurn(...args);
      } catch (error) {
        // A provider boundary that ended with admission-unknown is terminal
        // for a live queue item. Keeping it pending would make the queue
        // silently submit a request that may already have been accepted by
        // the provider. An explicit retry carries its own invocation
        // lineage and is admitted separately. Startup recovery is different:
        // it must retain the pending item until the durable invocation record
        // can be reconciled, so recovery continues to fail closed here.
        if (error instanceof NarsIntelligenceInvocationError
          && error.result?.outcome?.kind === 'admission-unknown'
          && args[0]?.recoveryReplay !== true) {
          return {
            terminal_state: 'failed',
            error: error.message,
          };
        }
        // An explicitly controlled canonical attempt owns its retry/replay
        // semantics above the session queue. Its provider/refusal outcome is a
        // terminal turn result, so the admitted input must not remain at the
        // head of the recovery queue and replay itself before the caller's
        // next explicit attempt.
        if (error instanceof NarsIntelligenceInvocationError && args[0]?.settings?.intentId) {
          return {
            terminal_state: error.result?.kind === 'refusal' ? 'refused' : 'failed',
            error: error.message,
          };
        }
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
