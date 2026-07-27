import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';
import { createPiRuntimeIsolationConfig, assertPiRuntimeIsolation } from './pi-runtime-isolation.ts';
import { negotiatePiCapabilities } from './pi-version-capabilities.ts';

function nonEmpty(value: any) { return typeof value === 'string' && value.trim() ? value.trim() : null; }

function rpcToolName(tool: any) {
  return String(tool?.tool_name ?? tool?.toolName ?? tool?.function?.name ?? tool?.name ?? '').trim();
}

function withRpcRequestCorrelation(value: any, requestId: any) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value, pi_request_id: requestId };
  }
  return { value, pi_request_id: requestId };
}

const FORBIDDEN_RPC_FRAME_KEYS: any = new Set([
  'abortsignal',
  'capabilitygateway',
  'eventsink',
  'invocationeventsink',
  'providerinvoker',
  'toolgateway',
  'apikey',
  'accesstoken',
  'clientsecret',
  'refreshtoken',
  'authorization',
  'password',
  'raw',
  'credentials',
  'secret',
  'token',
  'privatekey',
]);

const FORBIDDEN_RPC_TURN_KEYS: any = new Set([
  'command',
  'shell',
  'exec',
  'process',
  'filesystem',
  'nativetool',
  'nativetools',
  'extensions',
  'packages',
  'sessiondir',
  'cwd',
  'workingdirectory',
  'shellcommand',
  'processrun',
  'filesystemread',
  'filesystemwrite',
  'fileread',
  'filewrite',
  'readfile',
  'writefile',
  'editfile',
  'nativeexecution',
]);

const FORBIDDEN_RPC_LAUNCH_FLAGS: any = new Set([
  '--session-dir',
  '--sessiondir',
  '--extension',
  '--extensions',
  '--package',
  '--packages',
  '--skill',
  '--skills',
  '--prompt-template',
  '--system-prompt',
  '--append-system-prompt',
  '--resource-loader',
  '--settings',
  '--config',
  '--cwd',
  '--workdir',
  '--shell',
  '--native-tools',
  '--enable-shell-tools',
  '--enable-filesystem-tools',
]);

const FORBIDDEN_ENV_KEYS: any = new Set([
  'apikey',
  'accesstoken',
  'clientsecret',
  'refreshtoken',
  'authorization',
  'password',
  'secret',
  'token',
  'privatekey',
  'cookie',
  'nodeoptions',
  'nodepath',
  'pihome',
  'piconfig',
  'piprofile',
  'xdgconfighome',
  'home',
  'userprofile',
  'appdata',
  'localappdata',
  'xdgdatahome',
  'xdgcachehome',
  'xdgstatehome',
]);

function isForbiddenEnvironmentKey(key: any) {
  const normalized: any = normalizedKey(key);
  return FORBIDDEN_ENV_KEYS.has(normalized)
    || normalized.includes('apikey')
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('clientsecret')
    || normalized.includes('privatekey')
    || normalized.includes('accesskey')
    || normalized.includes('secret')
    || normalized.includes('credential')
    || normalized.endsWith('password')
    || normalized.endsWith('token');
}

function normalizedKey(key: any) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isForbiddenRpcKey(key: any) {
  const normalized: any = normalizedKey(key);
  return FORBIDDEN_RPC_FRAME_KEYS.has(normalized)
    || normalized.includes('apikey')
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('clientsecret')
    || normalized.includes('privatekey')
    || normalized.endsWith('password')
    || normalized.endsWith('secret')
    || normalized.endsWith('token');
}

function isForbiddenRpcCommandKey(key: any) {
  const normalized: any = normalizedKey(key);
  return FORBIDDEN_RPC_TURN_KEYS.has(normalized)
    || normalized.includes('shell')
    || normalized.includes('processrun')
    || normalized.includes('filesystem')
    || normalized.includes('filewrite')
    || normalized.includes('fileread')
    || normalized.includes('editfile')
    || normalized.includes('nativeexecution')
    || normalized.includes('extension')
    || normalized.includes('package');
}

function findForbiddenRpcInputKey(value: any, path: any = 'turn', seen: any = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found: any = findForbiddenRpcInputKey(value[index], `${path}[${index}]`, seen);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isForbiddenRpcCommandKey(key)) return `${path}.${key}`;
    const found: any = findForbiddenRpcInputKey(nested, `${path}.${key}`, seen);
    if (found) return found;
  }
  return null;
}

function assertSafeRpcLaunchArgs(args: any) {
  if (!Array.isArray(args) || !args.every((arg: any) => typeof arg === 'string')) {
    throw new NarsKernelContractError('pi_rpc_args_invalid', 'Pi RPC launch arguments must be an array of strings.');
  }
  for (const arg of args) {
    const flag: any = arg.trim().toLowerCase().split('=', 1)[0];
    if (FORBIDDEN_RPC_LAUNCH_FLAGS.has(flag)) {
      throw new NarsKernelContractError(
        'pi_rpc_launch_flag_forbidden',
        `Pi RPC launch flag '${arg}' would enable ambient or native Pi behavior.`,
        { argument: arg },
      );
    }
  }
}

function assertSafeRpcTurnInput(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const forbiddenPath: any = findForbiddenRpcInputKey(input);
  const forbidden: any = forbiddenPath ? forbiddenPath.slice(forbiddenPath.lastIndexOf('.') + 1) : null;
  if (forbidden) {
    throw new NarsKernelContractError(
      'pi_rpc_command_forbidden',
      `Pi RPC turn input cannot carry unsafe command field '${forbidden}'.`,
      { key: forbiddenPath },
    );
  }
  const tools: any = Array.isArray(input.tools) ? input.tools : [];
  const nativeTool: any = tools.find((tool: any) => tool?.native === true || tool?.source === 'ambient'
    || ['read', 'write', 'edit', 'bash', 'shell', 'exec', 'process', 'filesystem', 'grep', 'find', 'ls'].includes(
      normalizedKey(tool?.name ?? tool?.function?.name ?? tool?.tool_name),
    ));
  if (nativeTool) {
    throw new NarsKernelContractError(
      'pi_rpc_native_tool_forbidden',
      'Pi RPC turn input may contain only NARS gateway proxy tools.',
      { tool: nativeTool?.name ?? nativeTool?.function?.name ?? nativeTool?.tool_name ?? null },
    );
  }
  const nonProxyTool: any = tools.find((tool: any) => tool?.nars_gateway_proxy !== true);
  if (nonProxyTool) {
    throw new NarsKernelContractError(
      'pi_rpc_gateway_tool_required',
      'Pi RPC turn input may contain only explicit NARS capability-gateway proxies.',
      { tool: nonProxyTool?.name ?? nonProxyTool?.function?.name ?? nonProxyTool?.tool_name ?? null },
    );
  }
}

function negotiateRpcChildHandshake(result: any, pinnedVersion: any, fallbackNegotiation: any) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new NarsKernelContractError(
      'pi_rpc_capability_advertisement_required',
      'Pi RPC child must return an explicit capability advertisement during handshake.',
    );
  }
  const advertised: any = result.negotiation && typeof result.negotiation === 'object'
    ? result.negotiation
    : Object.prototype.hasOwnProperty.call(result, 'pi_version')
      || Object.prototype.hasOwnProperty.call(result, 'piVersion')
      || Object.prototype.hasOwnProperty.call(result, 'supported_event_kinds')
      || Object.prototype.hasOwnProperty.call(result, 'capabilities')
      ? result
      : null;
  if (!advertised) {
    throw new NarsKernelContractError(
      'pi_rpc_capability_advertisement_required',
      'Pi RPC child must advertise version, capabilities, and event kinds; local defaults are not peer evidence.',
    );
  }
  const advertisedVersion: any = nonEmpty(advertised.pi_version ?? advertised.piVersion ?? advertised.version);
  if (!advertisedVersion) {
    throw new NarsKernelContractError(
      'pi_rpc_version_advertisement_required',
      'Pi RPC child must advertise its exact pinned version.',
    );
  }
  if (advertisedVersion !== pinnedVersion) {
    throw new NarsKernelContractError(
      'pi_rpc_version_mismatch',
      `The Pi RPC child version '${advertisedVersion}' does not match the admitted pinned version '${pinnedVersion}'.`,
      { actual_version: advertisedVersion, expected_version: pinnedVersion },
    );
  }
  if (!Array.isArray(advertised.capabilities) || !Array.isArray(advertised.supported_event_kinds)) {
    throw new NarsKernelContractError(
      'pi_rpc_capability_advertisement_incomplete',
      'Pi RPC child must advertise capabilities and supported_event_kinds as arrays.',
    );
  }
  return negotiatePiCapabilities({
    piVersion: pinnedVersion,
    mode: advertised.mode ?? 'rpc',
    capabilities: advertised.capabilities,
    eventKinds: advertised.supported_event_kinds,
    required: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
    peerAdvertised: true,
  });
}

function sanitizeRpcValue(value: any, seen: any = new Set(), key: any = null) {
  const normalized: any = key == null ? null : normalizedKey(key);
  if (normalized === 'credential') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const locator: any = {};
    for (const locatorKey of ['id', 'kind', 'ref', 'locator', 'name']) {
      if (typeof value[locatorKey] === 'string' && value[locatorKey].trim()) locator[locatorKey] = value[locatorKey].trim();
    }
    return Object.keys(locator).length ? locator : undefined;
  }
  if (normalized && isForbiddenRpcKey(normalized)) return undefined;
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
  if (typeof value !== 'object') return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);
  let result: any;
  if (Array.isArray(value)) {
    result = value.map((item: any) => sanitizeRpcValue(item, seen)).filter((item: any) => item !== undefined);
  } else {
    result = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const sanitized: any = sanitizeRpcValue(nestedValue, seen, nestedKey);
      if (sanitized !== undefined) result[nestedKey] = sanitized;
    }
  }
  seen.delete(value);
  return result;
}

function isolatedChildEnvironment(explicitEnvironment: any = {}) {
  // Do not inherit the operator's full environment. In particular, the RPC
  // child must not discover provider selection, credentials, Pi config, or a
  // Site/project root from the parent process. Only process-launch plumbing
  // is inherited; all other explicit values are an admitted child input and
  // still pass the same secret/configuration filters below.
  const inheritedEnvironmentKeys: any = new Set([
    'comspec',
    'lang',
    'lc_all',
    'no_color',
    'pathext',
    'path',
    'systemroot',
    'term',
    'tmp',
    'temp',
    'windir',
  ]);
  const isAmbientProviderConfigurationKey: any = (key: any) => {
    const normalized: any = normalizedKey(key);
    return normalized.startsWith('naradaai')
      || normalized.startsWith('naradaintelligence')
      || normalized.startsWith('naradapi')
      || normalized.includes('siteroot')
      || normalized.includes('workspaceroot')
      || normalized.includes('contextpath')
      || normalized.includes('registrydb')
      || normalized.includes('targetsite')
      || normalized.includes('usersite')
      || normalized.includes('hostsite')
      || (normalized.startsWith('pi') && !/^PI_RPC_FIXTURE_/i.test(key))
      || normalized.endsWith('model')
      || normalized.endsWith('baseurl')
      || normalized.endsWith('endpoint')
      || normalized.endsWith('thinking');
  };
  const inherited: any = Object.entries(process.env)
    .filter(([key]: any) => inheritedEnvironmentKeys.has(String(key).toLowerCase()))
    .filter(([key]: any) => !isForbiddenEnvironmentKey(key))
    .filter(([key]: any) => !isAmbientProviderConfigurationKey(key));
  const explicit: any = Object.entries(explicitEnvironment ?? {})
    .filter(([key]: any) => !isForbiddenEnvironmentKey(key))
    .filter(([key]: any) => !/^pi(?:_|-)?(?:home|config|profile|auth)/i.test(key))
    .filter(([key]: any) => !isAmbientProviderConfigurationKey(key)
      || /^PI_RPC_FIXTURE_/i.test(key));
  return {
    ...Object.fromEntries(inherited),
    ...Object.fromEntries(explicit),
    NARADA_PI_AMBIENT_EXTENSIONS: '0',
    NARADA_PI_NATIVE_TOOLS: '0',
    NARADA_PI_SESSION_STORAGE: 'memory',
  };
}

/** Strict JSONL supervisor for the optional Pi RPC implementation. */
export function createPiRpcHost({
  command,
  args = [],
  env = {},
  cwd = null,
  piVersion,
  maxLineBytes = 1024 * 1024,
  requestTimeoutMs = 30_000,
  spawnProcess = spawn,
  now = () => new Date().toISOString(),
}: any = {}) {
  if (!nonEmpty(command) || !nonEmpty(piVersion)) throw new NarsKernelContractError('pi_rpc_pin_required', 'Pi RPC requires an explicit command and pinned version.');
  assertSafeRpcLaunchArgs(args);
  let child: any = null;
  let buffer: any = '';
  let frameProcessing: any = Promise.resolve();
  let closed: any = false;
  let closing: any = false;
  let recovering: any = false;
  let started: any = false;
  let startParams: any = null;
  let ownedWorkingDirectory: any = null;
  let activeToolGateway: any = null;
  let activeToolNames: any = new Set();
  let activeCorrelation: any = null;
  let writeProcessing: any = Promise.resolve();
  const pending: any = new Map();
  const listeners: any = new Set();
  let nextId: any = 1;
  let negotiation: any = null;
  const rejectPending: any = (error: any) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    pending.clear();
  };
  const fail: any = (error: any, processRef: any = child) => {
    if (processRef && child !== processRef) return;
    rejectPending(error);
    if (child === processRef) child = null;
    if (processRef && !processRef.killed) processRef.kill();
  };
  const childWorkingDirectory: any = () => {
    if (nonEmpty(cwd)) return cwd;
    ownedWorkingDirectory ??= mkdtempSync(join(tmpdir(), 'narada-pi-rpc-'));
    return ownedWorkingDirectory;
  };
  const cleanupWorkingDirectory: any = () => {
    if (!ownedWorkingDirectory) return;
    try { rmSync(ownedWorkingDirectory, { recursive: true, force: true, maxRetries: 3 }); } catch { /* best effort */ }
    ownedWorkingDirectory = null;
  };
  const emitEvent: any = async (record: any) => {
    for (const listener of listeners) await listener(record);
  };
  const rpcToolCall: any = (record: any) => {
    const event: any = record?.event && typeof record.event === 'object' ? record.event : record;
    const kind: any = String(event?.kind ?? event?.type ?? '').trim();
    if (kind !== 'tool_call') return null;
    const nested: any = event?.tool_call && typeof event.tool_call === 'object'
      ? event.tool_call
      : event?.toolCall && typeof event.toolCall === 'object'
        ? event.toolCall
        : event;
    return {
      event,
      tool_name: rpcToolName(nested),
      tool_call_id: nested?.tool_call_id ?? nested?.toolCallId ?? nested?.id ?? event?.id ?? null,
      arguments: nested?.arguments ?? nested?.input ?? nested?.args ?? {},
      pi_message_id: nested?.pi_message_id ?? nested?.piMessageId ?? event?.pi_message_id ?? event?.piMessageId ?? null,
    };
  };
  let writeOneWay: any;
  const handleToolCall: any = async (record: any, processRef: any) => {
    const toolCall: any = rpcToolCall(record);
    if (!toolCall) return false;
    await emitEvent(toolCall.event);
    const allowed: any = activeToolNames.has(toolCall.tool_name);
    let result: any;
    if (!activeToolGateway || !allowed) {
      result = {
        schema: 'narada.nars.pi.tool-proxy-result.v1',
        status: 'denied',
        admission_action: 'deny',
        admission_reason: activeToolGateway
          ? 'tool_not_in_admitted_catalog'
          : 'pi_capability_gateway_required',
        tool_name: toolCall.tool_name || null,
        tool_call_id: toolCall.tool_call_id,
        effect_confirmation: 'not-confirmed',
      };
    } else {
      const invokeTool: any = typeof activeToolGateway.execute === 'function'
        ? activeToolGateway.execute.bind(activeToolGateway)
        : typeof activeToolGateway.invoke === 'function'
          ? activeToolGateway.invoke.bind(activeToolGateway)
          : null;
      if (!invokeTool) {
        result = {
          schema: 'narada.nars.pi.tool-proxy-result.v1',
          status: 'denied',
          admission_action: 'deny',
          admission_reason: 'pi_capability_gateway_required',
          tool_name: toolCall.tool_name || null,
          tool_call_id: toolCall.tool_call_id,
          effect_confirmation: 'not-confirmed',
        };
      } else result = await invokeTool({
        tool_name: toolCall.tool_name,
        tool_call_id: toolCall.tool_call_id,
        arguments: toolCall.arguments && typeof toolCall.arguments === 'object' ? toolCall.arguments : {},
        pi_message_id: toolCall.pi_message_id,
        ...activeCorrelation,
      });
    }
    // The child-side protocol is deliberately one-way for tool results. A
    // response request here would deadlock the serialized JSONL frame queue
    // while the child is waiting for this result.
    await writeOneWay({
      type: 'tool_result',
      id: toolCall.tool_call_id,
      tool_call_id: toolCall.tool_call_id,
      tool_name: toolCall.tool_name || null,
      result,
      effect_confirmation: result?.effect_confirmation ?? 'unknown',
      correlation: activeCorrelation,
    }, processRef);
    return true;
  };
  const handleLine: any = async (line: any, processRef: any = child) => {
    if (child !== processRef) return;
    if (Buffer.byteLength(line, 'utf8') > maxLineBytes) {
      fail(new NarsKernelContractError('pi_rpc_line_too_large', 'Pi RPC output exceeded the line limit.'), processRef);
      return;
    }
    let record: any;
    try { record = JSON.parse(line); } catch {
      fail(new NarsKernelContractError('pi_rpc_malformed_jsonl', 'Pi RPC emitted malformed JSONL.'), processRef);
      return;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      fail(new NarsKernelContractError('pi_rpc_frame_invalid', 'Pi RPC emitted a non-object frame.'), processRef);
      return;
    }
    if (await handleToolCall(record, processRef)) return;
    if (record.type === 'event' || record.event) {
      await emitEvent(record.event ?? record);
      return;
    }
    const id: any = String(record.id ?? '');
    const entry: any = pending.get(id);
    if (!entry) {
      fail(new NarsKernelContractError('pi_rpc_unknown_response', `Pi RPC response '${id}' has no pending request.`), processRef);
      return;
    }
    pending.delete(id); clearTimeout(entry.timer);
    if (record.error) entry.reject(Object.assign(new Error(String(record.error.message ?? record.error)), { code: record.error.code ?? 'pi_rpc_error' }));
    else entry.resolve(withRpcRequestCorrelation(record.result ?? record, id));
  };
  const startChild: any = () => {
    if (child) return;
    const childEnv: any = isolatedChildEnvironment(env);
    const processRef: any = spawnProcess(command, [...args], { cwd: childWorkingDirectory(), env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child = processRef;
    processRef.stdout.setEncoding?.('utf8');
    processRef.stderr?.resume?.();
    processRef.stdout.on('data', (chunk: any) => {
      if (child !== processRef) return;
      buffer += String(chunk);
      if (Buffer.byteLength(buffer, 'utf8') > maxLineBytes * 2) {
        fail(new NarsKernelContractError('pi_rpc_frame_buffer_too_large', 'Pi RPC output buffer exceeded the line limit.'), processRef);
        return;
      }
      while (true) {
        const newline: any = buffer.indexOf('\n');
        if (newline < 0) break;
        const line: any = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (line) {
          frameProcessing = frameProcessing
            .then(() => handleLine(line, processRef))
            .catch((error: any) => fail(error, processRef));
        }
      }
    });
    processRef.on('error', (error: any) => fail(Object.assign(error, { code: error.code ?? 'pi_rpc_process_error' }), processRef));
    processRef.on('exit', (code: any, signal: any) => {
      if (child !== processRef) return;
      // Process exit is a kernel observation, not a canonical session event.
      // Queue it before failing the pending request so the event adapter can
      // retain deterministic crash evidence when a turn was in flight.
      frameProcessing = frameProcessing
        .then(() => emitEvent({ kind: 'process_exit', code, signal: signal ?? null }))
        .catch(() => {});
      if (!closed && !closing && !recovering) {
        fail(new NarsKernelContractError('pi_rpc_process_exit', `Pi RPC exited before close (code=${code}, signal=${signal ?? 'none'}).`), processRef);
      } else {
        child = null;
      }
    });
    return processRef;
  };
  const request: any = (method: any, params: any = {}, processRef: any = child) => {
    if (!processRef || processRef !== child || processRef.killed || !processRef.stdin?.writable) return Promise.reject(new NarsKernelContractError('pi_rpc_process_unavailable', 'Pi RPC process is unavailable.'));
    const id: any = `pi-rpc-${nextId++}`;
    const safeParams: any = sanitizeRpcValue(params) ?? {};
    const frame: any = `${JSON.stringify({ id, method, params: safeParams })}\n`;
    if (Buffer.byteLength(frame, 'utf8') > maxLineBytes) {
      return Promise.reject(new NarsKernelContractError('pi_rpc_request_too_large', `Pi RPC request '${method}' exceeded the line limit.`));
    }
    return new Promise((resolve: any, reject: any) => {
      const timer: any = setTimeout(() => {
        const error: any = new NarsKernelContractError('pi_rpc_request_timeout', `Pi RPC request '${method}' timed out.`);
        fail(error, processRef);
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      writeProcessing = writeProcessing
        .catch(() => {})
        .then(() => new Promise((resolveWrite: any, rejectWrite: any) => {
          try {
            processRef.stdin.write(frame, (error: any) => error ? rejectWrite(error) : resolveWrite());
          } catch (error) {
            rejectWrite(error);
          }
        }));
      writeProcessing.catch((error: any) => {
        clearTimeout(timer);
        pending.delete(id);
        fail(error, processRef);
      });
    });
  };
  writeOneWay = (value: any, processRef: any = child) => {
    if (!processRef || processRef !== child || processRef.killed || !processRef.stdin?.writable) {
      return Promise.reject(new NarsKernelContractError('pi_rpc_process_unavailable', 'Pi RPC process is unavailable.'));
    }
    const safeValue: any = sanitizeRpcValue(value) ?? {};
    const frame: any = `${JSON.stringify(safeValue)}\n`;
    if (Buffer.byteLength(frame, 'utf8') > maxLineBytes) {
      return Promise.reject(new NarsKernelContractError('pi_rpc_request_too_large', 'Pi RPC one-way frame exceeded the line limit.'));
    }
    writeProcessing = writeProcessing
      .catch(() => {})
      .then(() => new Promise((resolveWrite: any, rejectWrite: any) => {
        try {
          processRef.stdin.write(frame, (error: any) => error ? rejectWrite(error) : resolveWrite());
        } catch (error) {
          rejectWrite(error);
        }
      }));
    return writeProcessing;
  };
  return Object.freeze({
    mode: 'rpc',
    async start(context: any = {}) {
      if (closed) throw new NarsKernelContractError('pi_rpc_host_closed', 'Pi RPC host is closed.');
      const isolation: any = createPiRuntimeIsolationConfig({ provider: context.provider, model: context.model, thinking: context.thinking, sdkVersion: piVersion, mode: 'rpc', tools: context.tools ?? [] });
      assertPiRuntimeIsolation(isolation);
      negotiation = negotiatePiCapabilities({ piVersion, mode: 'rpc', required: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'] });
      const processRef: any = startChild();
      startParams = {
        session_id: context.session_id,
        agent_id: context.agent_id,
        kernel_kind: 'pi-rpc',
        provider: context.provider ?? null,
        model: context.model ?? null,
        thinking: context.thinking ?? null,
        isolation,
        capabilities: negotiation.capabilities,
        supported_event_kinds: negotiation.supported_event_kinds,
        adapter_version: negotiation.adapter_version,
      };
      try {
        const result: any = await request('start', startParams, processRef);
        negotiation = negotiateRpcChildHandshake(result, piVersion, negotiation);
        started = true;
        return { ...result, negotiation, isolation, started_at: now() };
      } catch (error) {
        fail(error, processRef);
        throw error;
      }
    },
    onEvent(listener: any) { listeners.add(listener); return () => listeners.delete(listener); },
    async runTurn(input: any = {}, eventSink: any = async () => {}, capabilityGateway: any = null) {
      assertSafeRpcTurnInput(input);
      const remove: any = this.onEvent(eventSink);
      activeToolGateway = capabilityGateway;
      activeToolNames = new Set((Array.isArray(input.tools) ? input.tools : []).map(rpcToolName).filter(Boolean));
      activeCorrelation = {
        ...(input.correlation && typeof input.correlation === 'object' ? input.correlation : {}),
        ...(input.correlation_key != null ? { correlation_key: input.correlation_key } : {}),
        ...(input.turn_id != null ? { turn_id: input.turn_id } : {}),
        ...(input.input_id != null ? { input_id: input.input_id } : {}),
        ...(input.input_event_id != null ? { input_event_id: input.input_event_id } : {}),
        ...(input.runtime_request_id != null ? { runtime_request_id: input.runtime_request_id } : {}),
        ...(input.idempotency_key != null ? { idempotency_key: input.idempotency_key } : {}),
        ...(input.turn_attempt != null ? { turn_attempt: input.turn_attempt } : {}),
        ...(input.authority_posture != null ? { authority_posture: input.authority_posture } : {}),
        ...(input.admission_evidence != null ? { admission_evidence: input.admission_evidence } : {}),
        ...(input.execution_evidence != null ? { execution_evidence: input.execution_evidence } : {}),
        ...(input.result_reference != null ? { result_reference: input.result_reference } : {}),
        ...(input.reconciliation_state != null ? { reconciliation_state: input.reconciliation_state } : {}),
      };
      try { return await request('turn', { ...input, abortSignal: undefined }); } finally {
        activeToolGateway = null;
        activeToolNames = new Set();
        activeCorrelation = null;
        remove();
      }
    },
    async steer(input: any) { assertSafeRpcTurnInput(input); return request('steer', input); },
    async cancel(reason: any) { return request('cancel', { reason }); },
    async reconfigure(config: any = {}) {
      assertSafeRpcTurnInput(config);
      const result: any = await request('reconfigure', config);
      if (startParams) {
        startParams = {
          ...startParams,
          ...(config.provider !== undefined ? { provider: config.provider } : {}),
          ...(config.model !== undefined ? { model: config.model } : {}),
          ...(config.thinking !== undefined ? { thinking: config.thinking } : {}),
          isolation: {
            ...(startParams.isolation ?? {}),
            ...(config.provider !== undefined ? { provider: config.provider } : {}),
            ...(config.model !== undefined ? { model: config.model } : {}),
            ...(config.thinking !== undefined ? { thinking: config.thinking } : {}),
          },
        };
      }
      return result;
    },
    async recover({ context = null }: any = {}) {
      if (closed) throw new NarsKernelContractError('pi_rpc_host_closed', 'Pi RPC host is closed.');
      if (!started || !startParams) return { continuation_state_discarded: false, reason: 'pi_rpc_host_not_started' };
      if (recovering) throw new NarsKernelContractError('pi_rpc_recovery_active', 'Pi RPC recovery is already active.');
      recovering = true;
      const previous: any = child;
      const restartError: any = new NarsKernelContractError('pi_rpc_process_restarting', 'Pi RPC process is being restarted.');
      child = null;
      buffer = '';
      rejectPending(restartError);
      if (previous && !previous.killed) previous.kill();
      try {
        await frameProcessing;
        frameProcessing = Promise.resolve();
        const processRef: any = startChild();
        const result: any = await request('start', startParams, processRef);
        negotiation = negotiateRpcChildHandshake(result, piVersion, negotiation);
        return {
          continuation_state_discarded: true,
          process_restarted: true,
          session_recreated: true,
          ...(result && typeof result === 'object' ? { restart_result_present: true } : {}),
        };
      } finally {
        recovering = false;
      }
    },
    async close() {
      if (closed) return;
      closing = true;
      try {
        if (child?.stdin?.writable) await request('close', {}, child);
        await frameProcessing;
      } catch { /* process cleanup below is authoritative */ }
      closed = true;
      if (child && !child.killed) child.kill();
      rejectPending(new NarsKernelContractError('pi_rpc_host_closed', 'Pi RPC host closed.'));
      child = null;
      started = false;
      startParams = null;
      activeToolGateway = null;
      activeToolNames = new Set();
      activeCorrelation = null;
      closing = false;
      cleanupWorkingDirectory();
    },
    health() { return { pi_version: piVersion, pi_mode: 'rpc', rpc_process_alive: Boolean(child && !child.killed) }; },
  });
}
