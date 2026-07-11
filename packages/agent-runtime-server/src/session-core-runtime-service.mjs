import { createRuntimeSessionBinding } from './runtime-session-binding.mjs';
import { createNarsCapabilityGateway } from '@narada2/nars-capability-gateway/capability-gateway';

function createJsonLineWriter(output) {
  let failure = null;
  let tail = Promise.resolve();
  const onError = (error) => { failure ??= error; };
  output.on?.('error', onError);
  function write(value) {
    const line = `${JSON.stringify(value)}\n`;
    tail = tail.then(() => {
      if (failure) throw failure;
      return new Promise((resolve, reject) => {
        try {
          output.write(line, (error) => {
            if (error) {
              failure ??= error;
              reject(error);
            } else resolve();
          });
        } catch (error) {
          failure ??= error;
          reject(error);
        }
      });
    });
    tail.catch(() => {});
    return tail;
  }
  return {
    write,
    async flush() {
      await tail;
      if (failure) throw failure;
    },
    close() {
      output.off?.('error', onError);
    },
  };
}

function requestContent(request) {
  if (typeof request === 'string') return request;
  if (!request || typeof request !== 'object') return null;
  return request.content ?? request.params?.content ?? request.params?.message ?? null;
}

function parseRequest(line) {
  const trimmed = String(line).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return { method: null, parse_error: 'invalid_json' };
    }
    return { method: 'session.submit', content: trimmed };
  }
}

/**
 * Narrow JSONL control service. Session-core owns all durable session state;
 * the compatibility runtime supplies only the provider callable.
 */
export function createSessionCoreRuntimeService({ runtimeContext, callChatApiFn, toolGateway = null, admitCapability = null } = {}) {
  let supervisor = null;
  const gateway = toolGateway ? null : createNarsCapabilityGateway({
    siteRoot: runtimeContext.siteRoot,
    ownershipContext: {
      launch_session_id: runtimeContext.launchSessionId,
      ownership: runtimeContext.processOwnership,
      process_role: runtimeContext.processRole,
      created_by_pid: runtimeContext.createdByPid,
    },
    ...(admitCapability ? { admit: admitCapability } : {}),
    recordEvidence: async (event) => supervisor?.core.appendEvent({ event: event.kind, ...event }),
  });
  const providerToolGateway = toolGateway ?? {
    toolCatalog: async () => (await gateway.start()).map((tool) => ({
      type: 'function',
      function: {
        name: tool.provider_tool_name ?? tool.tool_name,
        parameters: tool.input_schema ?? { type: 'object', properties: {} },
      },
    })),
    invoke: ({ toolName, arguments: args, abortSignal }) => gateway.invoke({ toolName, arguments: args, abortSignal }),
    operationalState: () => gateway.operationalState?.() ?? 'unknown',
    close: () => gateway.close(),
  };
  supervisor = createRuntimeSessionBinding({ runtimeContext, callChatApiFn, toolGateway: providerToolGateway });

  async function handleRequest(request, writer) {
    const requestId = request?.id ?? request?.request_id ?? null;
    const method = request?.method ?? (requestContent(request) != null ? 'session.submit' : null);
    try {
      if (method === 'session.health') {
        await writer.write({ event: 'session_health', request_id: requestId, ...supervisor.health() });
        return false;
      }
      if (method === 'session.cancel') {
        const cancelled = await supervisor.cancel({ request_id: requestId });
        await writer.write({ event: 'session_cancel', request_id: requestId, cancelled });
        return false;
      }
      if (method === 'session.recovery') {
        await writer.write({ event: 'session_recovery', request_id: requestId, ...supervisor.recovery() });
        return false;
      }
      if (method === 'session.close') {
        supervisor.core.appendEvent({ event: 'session_closed', request_id: requestId, terminal_state: 'closed' });
        await supervisor.close({ request_id: requestId, reason: 'control_request' });
        return true;
      }
      if (request?.parse_error === 'invalid_json') throw new Error('invalid_json');
      if (method !== 'session.submit') throw new Error('unsupported_session_control');
      if (requestContent(request) == null) throw new Error('unsupported_session_control');
      const result = await supervisor.dispatch(request);
      supervisor.core.appendEvent({
        event: 'session_control_response',
        request_id: requestId,
        method,
        terminal_state: result?.terminal_state ?? 'completed',
      });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      supervisor.core.appendEvent({
        event: 'session_control_rejected',
        request_id: requestId,
        method,
        code: message === 'invalid_json'
          ? 'invalid_json'
          : method === 'session.submit'
            ? 'request_dispatch_failed'
            : 'unsupported_session_control',
        error: message,
      });
      if (method === 'session.close') throw error;
      return false;
    }
  }

  async function run({ input = process.stdin, output = process.stdout } = {}) {
    const writer = createJsonLineWriter(output);
    const subscription = supervisor.core.eventHub.subscribe({
      subscriptionId: 'runtime-jsonl',
      send: (envelope) => writer.write(envelope.payload),
    });
    supervisor.core.appendEvent({
      event: 'session_started',
      runtime: 'narada-agent-runtime-server',
      transport: 'jsonl_stdio',
      runtime_contract: 'nars_session_core_control.v1',
      delegated_authority_handoff: runtimeContext.narsDelegatedAuthorityHandoff ?? null,
      delegated_authority_ref: runtimeContext.narsDelegatedAuthorityHandoff?.authority_ref ?? null,
      health_endpoint: runtimeContext.healthUrl ?? null,
      event_endpoint: runtimeContext.eventStreamUrl ?? null,
    });
    supervisor.start();
    input.setEncoding?.('utf8');
    let buffer = '';
    let closed = false;
    const pending = new Set();
    const schedule = (request) => {
      const method = request?.method ?? null;
      if (method === 'session.cancel') return handleRequest(request, writer);
      if (method === 'session.close') return Promise.allSettled([...pending]).then(() => handleRequest(request, writer));
      const operation = handleRequest(request, writer);
      pending.add(operation);
      operation.finally(() => pending.delete(operation));
      return Promise.resolve(false);
    };
    try {
      for await (const chunk of input) {
        buffer += String(chunk);
        while (true) {
          const newline = buffer.indexOf('\n');
          if (newline === -1) break;
          const request = parseRequest(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          if (request) closed = await schedule(request);
          if (closed) return;
        }
      }
      const request = parseRequest(buffer);
      if (request) closed = await schedule(request);
      await Promise.allSettled([...pending]);
    } finally {
      if (!closed && supervisor.core.lifecycleState === 'ready') await supervisor.close({ reason: 'input_closed' });
      try {
        await writer.flush();
      } finally {
        subscription.unsubscribe();
        writer.close();
      }
    }
  }

  return Object.freeze({
    supervisor,
    runtimeContext,
    run,
  });
}
