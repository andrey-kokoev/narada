import { createCarrierRuntimeContext } from './carrier-runtime-context.mjs';
import { createCarrierRuntimeDependencies } from './runtime-dependencies.mjs';
import { runCarrierServerMode } from './server-mode.mjs';

/**
 * In-process compatibility boundary. It contains the legacy runtime only;
 * callers retain ownership of transport and process lifetime.
 */
export function createLegacyRuntimeService({ runtimeContext, createProjectedTerminalBridge } = {}) {
  const context = createCarrierRuntimeContext(runtimeContext);
  const runtime = createCarrierRuntimeDependencies({ runtimeContext: context });
  return Object.freeze({
    runtimeContext: context,
    createProjectedTerminalBridge,
    // Transitional provider adapter for session-core hosts. It deliberately
    // exposes no legacy control, queue, or persistence operations.
    callChatApiFn: runtime.callChatApiFn,
    run: ({ input, output }) => runCarrierServerMode({
      input,
      output,
      callChatApiFn: runtime.callChatApiFn,
      runtimeContext: context,
      dependencies: runtime.dependencies,
    }),
  });
}
