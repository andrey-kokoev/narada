import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';
import {
  createInMemoryPiSession,
  adaptExternalPiSession,
  resolveAdmittedPiModelOptions,
} from './pi-session-factory.mjs';
import { createNarsProjectedPiModelRuntime } from './pi-model-runtime.mjs';
import { assertPiRuntimeIsolation, createPiRuntimeIsolationConfig } from './pi-runtime-isolation.mjs';
import { negotiatePiCapabilities, PI_ADAPTER_VERSION } from './pi-version-capabilities.mjs';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resourceOrFallback(value, fallback = null) {
  if (nonEmpty(value)) return value.trim().replace(/^(?:model|inference-provider):/, '');
  if (value && typeof value === 'object' && nonEmpty(value.id)) return value.id.trim().replace(/^(?:model|inference-provider):/, '');
  return fallback;
}

function isPiModel(value) {
  return Boolean(value && typeof value === 'object' && nonEmpty(value.id) && nonEmpty(value.provider) && value.api);
}

function isRawCredentialKey(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['credentialref', 'credentialrefs', 'credentiallocator', 'credentiallocators'].includes(normalized)) return false;
  return normalized === 'apikey'
    || normalized.includes('apikey')
    || normalized === 'authorization'
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('clientsecret')
    || normalized === 'password'
    || normalized.includes('privatekey')
    || normalized === 'secret'
    || normalized === 'auth'
    || normalized === 'authentication';
}

function assertNoRawCredentialMaterial(value, path = '$', seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawCredentialMaterial(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, nested] of Object.entries(value)) {
      if (isRawCredentialKey(key)) {
        throw new NarsKernelContractError(
          'pi_raw_credential_forbidden',
          `Raw credential material is forbidden at ${path}.${key}; pass an admitted credential reference through NARS instead.`,
          { path: `${path}.${key}` },
        );
      }
      assertNoRawCredentialMaterial(nested, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function assertPinnedSdkVersion(actualVersion, expectedVersion) {
  const actual = nonEmpty(actualVersion);
  const expected = nonEmpty(expectedVersion);
  if (actual && expected && actual !== expected) {
    throw new NarsKernelContractError(
      'pi_sdk_version_mismatch',
      `The loaded Pi SDK version '${actual}' does not match the admitted pinned version '${expected}'.`,
      { actual_version: actual, expected_version: expected },
    );
  }
}

function assertAdmittedModelBinding(model, config = {}) {
  if (!model || typeof model !== 'object') return model;
  const expectedProvider = resourceOrFallback(config.provider);
  const expectedModel = resourceOrFallback(config.model);
  const actualProvider = resourceOrFallback(model.provider);
  const actualModel = resourceOrFallback(model.id);
  if (expectedProvider && actualProvider && expectedProvider !== actualProvider) {
    throw new NarsKernelContractError(
      'pi_provider_model_contradictory',
      `The admitted provider '${expectedProvider}' contradicts the Pi model provider '${actualProvider}'.`,
      { provider: expectedProvider, model_provider: actualProvider },
    );
  }
  if (expectedModel && actualModel && expectedModel !== actualModel) {
    throw new NarsKernelContractError(
      'pi_provider_model_contradictory',
      `The admitted model '${expectedModel}' contradicts the supplied Pi model '${actualModel}'.`,
      { model: expectedModel, supplied_model: actualModel },
    );
  }
  return model;
}

function createIsolatedResourceLoader() {
  return Object.freeze({
    getExtensions: () => ({ extensions: [], errors: [], runtime: { pendingProviderRegistrations: [] } }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => undefined,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  });
}

function assertExternalSessionIsolation(session) {
  if (!session || typeof session !== 'object') return session;
  const agentState = session.agent?.state;
  if (agentState && agentState.messages !== undefined && !Array.isArray(agentState.messages)) {
    throw new NarsKernelContractError(
      'pi_sdk_continuation_state_invalid',
      'The admitted Pi SDK exposed a corrupted continuation message collection; the isolated host refuses the session.',
    );
  }
  if (agentState && agentState.tools !== undefined && !Array.isArray(agentState.tools)) {
    throw new NarsKernelContractError(
      'pi_sdk_tool_catalog_invalid',
      'The admitted Pi SDK exposed a malformed tool collection; the isolated host refuses the session.',
    );
  }
  if (session.tools !== undefined && !Array.isArray(session.tools)) {
    throw new NarsKernelContractError(
      'pi_sdk_tool_catalog_invalid',
      'The admitted Pi SDK exposed a malformed session tool collection; the isolated host refuses the session.',
    );
  }
  for (const candidateTools of [agentState?.tools, session.tools]) {
    if (!Array.isArray(candidateTools)) continue;
    const unsafeTool = candidateTools.find((tool) => tool && tool.nars_gateway_proxy !== true);
    if (!unsafeTool) continue;
    throw new NarsKernelContractError(
      'pi_sdk_native_tool_exposed',
      'The admitted Pi SDK exposed a non-NARS gateway tool; the isolated host refuses the session.',
      { tool: unsafeTool.name ?? unsafeTool.tool_name ?? null },
    );
  }
  const storageOwners = [
    session,
    session.agent,
    session.sessionManager,
    session.session_manager,
    session.agent?.sessionManager,
    session.agent?.session_manager,
  ];
  for (const owner of storageOwners) {
    if (!owner || typeof owner !== 'object') continue;
    if (owner.sessionDir || owner.session_dir || owner.sessionPath || owner.session_path
      || owner.sessionFile || owner.session_file || owner.sessionFilePath || owner.session_file_path) {
      throw new NarsKernelContractError(
        'pi_sdk_session_storage_exposed',
        'The admitted Pi SDK exposed a session storage path; the isolated host refuses the session.',
      );
    }
  }
  return session;
}

/**
 * Pi's built-in provider retry is not an authority boundary.  A retry can
 * resend a prompt after the provider has accepted it, while NARS is still
 * deciding whether the admission is known.  Keep retries inside the NARS
 * provider adapter, where admission and idempotency are available.
 */
async function disableExternalPiAutomaticRetry(session) {
  const retryOwners = [session, session?.agent];
  for (const owner of retryOwners) {
    if (typeof owner?.setAutoRetryEnabled === 'function') await owner.setAutoRetryEnabled(false);
  }
  const settingsManager = session?.settingsManager ?? session?.agent?.settingsManager;
  if (typeof settingsManager?.setRetryEnabled === 'function') await settingsManager.setRetryEnabled(false);

  const observedEnabled = retryOwners
    .map((owner) => owner?.autoRetryEnabled)
    .find((value) => value === true);
  const settingsRetryEnabled = typeof settingsManager?.getRetryEnabled === 'function'
    ? await settingsManager.getRetryEnabled()
    : false;
  if (observedEnabled === true || settingsRetryEnabled === true) {
    throw new NarsKernelContractError(
      'pi_sdk_auto_retry_enabled',
      'The isolated Pi session still permits automatic provider retries; NARS must govern retry admission.',
    );
  }
  return session;
}

async function createSdkSession(sdk, options) {
  assertNoRawCredentialMaterial(options.piModel, 'options.piModel');
  assertNoRawCredentialMaterial(options.modelObject, 'options.modelObject');
  if (typeof options.sessionFactory === 'function') {
    const result = await options.sessionFactory(options);
    // Pi's createAgentSession-shaped factories commonly return an envelope
    // (`{ session, ... }`). Keep that SDK detail behind the host boundary.
    return result?.session ?? result;
  }
  if (!sdk) return null;
  if (typeof sdk.createAgentSession === 'function') {
    if (!options.resourceLoader) {
      throw new NarsKernelContractError(
        'pi_sdk_resource_loader_required',
        'An explicitly isolated Pi ResourceLoader is required; ambient Pi resource discovery is forbidden.',
      );
    }
    if (typeof sdk.SessionManager?.inMemory !== 'function') {
      throw new NarsKernelContractError(
        'pi_sdk_session_manager_required',
        'An in-memory Pi SessionManager is required; persistent Pi session storage is forbidden.',
      );
    }
    if (!options.settingsManager && typeof sdk.SettingsManager?.inMemory !== 'function') {
      throw new NarsKernelContractError(
        'pi_sdk_settings_manager_required',
        'An in-memory Pi SettingsManager is required; ambient Pi settings are forbidden.',
      );
    }
    const hasModelRuntimeOptions = Boolean(
      options.modelRuntimeOptions
      && typeof options.modelRuntimeOptions === 'object'
      && Object.keys(options.modelRuntimeOptions).length > 0,
    );
    if (typeof sdk.ModelRuntime?.create === 'function'
      && !options.modelRuntime
      && !hasModelRuntimeOptions
      && !options.credentialStore) {
      throw new NarsKernelContractError(
        'pi_sdk_model_runtime_required',
        'An explicitly admitted Pi ModelRuntime or credential store is required; ambient Pi credentials are forbidden.',
      );
    }
    const modelRuntime = options.modelRuntime
      ?? (typeof sdk.ModelRuntime?.create === 'function'
        ? await sdk.ModelRuntime.create({
          ...(options.modelRuntimeOptions && typeof options.modelRuntimeOptions === 'object'
            ? options.modelRuntimeOptions
            : {}),
          ...(options.credentialStore ? { credentials: options.credentialStore } : {}),
        })
        : null);
    if (!modelRuntime) {
      throw new NarsKernelContractError(
        'pi_sdk_model_runtime_required',
        'The isolated Pi host could not establish an admitted ModelRuntime; ambient provider discovery is forbidden.',
      );
    }
    let model = isPiModel(options.piModel)
      ? options.piModel
      : isPiModel(options.modelObject)
        ? options.modelObject
        : null;
    if (!model && modelRuntime && typeof modelRuntime.getModel === 'function' && options.provider && options.model) {
      model = await modelRuntime.getModel(options.provider, options.model);
    }
    assertAdmittedModelBinding(model, options);
    if (options.model && !model && options.provider) {
      throw new NarsKernelContractError(
        'pi_model_not_admitted',
        `The admitted Pi model '${options.provider}/${options.model}' is not available in the supplied model runtime.`,
      );
    }
    const result = await sdk.createAgentSession({
      ...(options.cwd ? { cwd: options.cwd } : {}),
      modelRuntime,
      sessionManager: sdk.SessionManager.inMemory(),
      settingsManager: options.settingsManager
        ?? sdk.SettingsManager.inMemory({
            ...(options.provider ? { defaultProvider: options.provider } : {}),
            ...(options.model ? { defaultModel: options.model } : {}),
            ...(options.thinking ? { defaultThinkingLevel: options.thinking } : {}),
            packages: [],
            extensions: [],
            skills: [],
            prompts: [],
            themes: [],
            // Pi must never automatically resend a provider request. Provider
            // retries are bounded and admitted by the NARS provider adapter.
            retry: {
              enabled: false,
              maxRetries: 0,
              baseDelayMs: 0,
              provider: { maxRetries: 0 },
            },
          }),
      model,
      thinkingLevel: options.thinking ?? undefined,
      tools: Array.isArray(options.customTools)
        ? options.customTools.map((tool) => tool?.name).filter(Boolean)
        : [],
      customTools: options.customTools ?? [],
      noTools: 'all',
      extensions: [],
      packages: [],
      skills: [],
      nativeTools: [],
      builtinTools: [],
      enableNativeTools: false,
      enableShellTools: false,
      enableFilesystemTools: false,
      loadExtensions: false,
      loadSkills: false,
      sessionDir: null,
      ...(options.resourceLoader ? { resourceLoader: options.resourceLoader } : {}),
    });
    return result?.session ?? result;
  }
  throw new NarsKernelContractError('pi_sdk_operations_missing', 'The admitted Pi SDK does not expose createAgentSession.');
}

async function loadPinnedPiSdk() {
  try {
    return await import('@earendil-works/pi-coding-agent');
  } catch (error) {
    throw new NarsKernelContractError(
      'pi_sdk_package_unavailable',
      'The pinned Pi coding-agent SDK is not available to the admitted runtime.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

/** Isolated Pi SDK host. The host has no authority over NARS records. */
export function createPiSdkHost({
  providerInvoker,
  sdk = null,
  sessionFactory = null,
  now = () => new Date().toISOString(),
  piVersion = null,
  runtimeConfig = {},
  fallbackToCompatibilityHost = null,
} = {}) {
  if (typeof providerInvoker !== 'function') throw new NarsKernelContractError('pi_provider_invoker_required', 'Pi SDK host requires an admitted provider invoker.');
  let session = null;
  let started = false;
  let closed = false;
  let negotiation = null;
  let isolation = null;
  let activeConfig = {};
  let sessionContext = null;
  let sessionOptions = null;
  let sessionUsesSdkModelRuntime = false;
  let currentTurnInput = null;
  let projectedModelRuntime = null;
  const explicitSdkHost = Boolean(
    sdk
    || sessionFactory
    || runtimeConfig.useBundledPiSdk === true
    || runtimeConfig.modelRuntime
    || runtimeConfig.modelRuntimeOptions
    || runtimeConfig.credentialStore,
  );
  const useBundledPiSdk = runtimeConfig.useBundledPiSdk === true;
  let resolvedSdk = sdk;
  const eventListeners = new Set();
  const emit = async (event) => {
    for (const listener of eventListeners) await listener(event);
  };
  async function buildSession(options) {
    assertAdmittedModelBinding(
      isPiModel(options.modelObject) ? options.modelObject : (isPiModel(options.piModel) ? options.piModel : null),
      options,
    );
    const rawSession = await createSdkSession(options.sdk ?? resolvedSdk, options)
      .then(assertExternalSessionIsolation)
      .then(disableExternalPiAutomaticRetry)
      .catch((error) => {
        // Compatibility is a test/compatibility adapter, never an implicit
        // recovery path for an admitted SDK binding.  A caller must opt in
        // explicitly so a broken or unavailable SDK cannot silently change
        // the cognition implementation.
        if (fallbackToCompatibilityHost !== true) throw error;
        return null;
      });
    const allowFallback = fallbackToCompatibilityHost === true;
    if (!rawSession && !allowFallback) {
      throw new NarsKernelContractError(
        'pi_sdk_unavailable',
        'The admitted Pi SDK session is unavailable and compatibility fallback is disabled.',
      );
    }
    return rawSession
      ? { session: adaptExternalPiSession(rawSession, { sessionId: options.sessionId, eventSink: emit }), kind: 'pi-sdk' }
      : { session: createInMemoryPiSession({ providerInvoker, sessionId: options.sessionId, eventSink: emit }), kind: 'pi-compatibility-host' };
  }
  async function reconfigureSession(config = {}) {
    if (closed) throw new NarsKernelContractError('pi_host_closed', 'Pi SDK host is closed.');
    assertNoRawCredentialMaterial(config.modelObject, 'config.modelObject');
    assertNoRawCredentialMaterial(config.piModel, 'config.piModel');
    const nextConfig = {
      ...activeConfig,
      provider: resourceOrFallback(config?.provider, activeConfig.provider),
      model: resourceOrFallback(config?.model, activeConfig.model),
      thinking: nonEmpty(config?.thinking) ?? activeConfig.thinking,
    };
    sessionOptions?.modelRuntime?.setAdmittedBinding?.(nextConfig);
    let modelObject = isPiModel(config?.modelObject) ? config.modelObject : null;
    if (!modelObject && sessionOptions?.modelRuntime && nextConfig.provider && nextConfig.model
      && typeof sessionOptions.modelRuntime.getModel === 'function') {
      modelObject = await sessionOptions.modelRuntime.getModel(nextConfig.provider, nextConfig.model);
    }
    assertAdmittedModelBinding(modelObject, nextConfig);
    if (nextConfig.model && sessionUsesSdkModelRuntime && !modelObject) {
      throw new NarsKernelContractError(
        'pi_sdk_model_not_admitted',
        `The admitted Pi model '${nextConfig.provider ?? '<provider>'}/${nextConfig.model}' is not available in the supplied model runtime.`,
      );
    }
    const result = session?.reconfigure?.({
      ...config,
      ...nextConfig,
      ...(modelObject ? { modelObject } : {}),
    }) ?? { active: nextConfig };
    activeConfig = nextConfig;
    if (sessionOptions) sessionOptions = { ...sessionOptions, ...activeConfig };
    return result;
  }
  return Object.freeze({
    mode: 'sdk',
    async start(context = {}) {
      if (closed) throw new NarsKernelContractError('pi_host_closed', 'Pi SDK host is closed.');
      if (started) return { negotiation, isolation };
      activeConfig = {
        provider: resourceOrFallback(context.provider, resourceOrFallback(runtimeConfig.provider)),
        model: resourceOrFallback(context.model, resourceOrFallback(runtimeConfig.model)),
        thinking: context.thinking ?? runtimeConfig.thinking ?? null,
      };
      if (!resolvedSdk && useBundledPiSdk && !sessionFactory) resolvedSdk = await loadPinnedPiSdk();
      assertPinnedSdkVersion(
        resolvedSdk?.VERSION,
        nonEmpty(piVersion) ?? nonEmpty(runtimeConfig.piVersion),
      );
      if (useBundledPiSdk && !runtimeConfig.modelRuntime && !projectedModelRuntime) {
        projectedModelRuntime = createNarsProjectedPiModelRuntime({
          providerInvoker,
          getCurrentInput: () => currentTurnInput,
        });
      }
      const modelRuntime = runtimeConfig.modelRuntime ?? projectedModelRuntime;
      modelRuntime?.setAdmittedBinding?.(activeConfig);
      const effectivePiVersion = piVersion
        ?? runtimeConfig.piVersion
        ?? resolvedSdk?.VERSION
        ?? 'narada-pi-compat';
      isolation = createPiRuntimeIsolationConfig({
        ...activeConfig,
        sdkVersion: effectivePiVersion,
        mode: explicitSdkHost ? 'sdk' : 'compat',
        tools: context.tools ?? [],
        extensionNames: [],
        packageNames: [],
        credentialRefs: context.credential_refs ?? [],
      });
      assertPiRuntimeIsolation(isolation);
      negotiation = negotiatePiCapabilities({
        piVersion: effectivePiVersion === 'narada-pi-compat' && explicitSdkHost
          ? 'explicit-sdk'
          : effectivePiVersion,
        mode: explicitSdkHost ? 'sdk' : 'compat',
        required: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
      });
      sessionContext = { ...context };
      sessionOptions = {
        ...activeConfig,
        sessionId: context.session_id,
        tools: context.tools ?? [],
        // Startup owns the admitted catalog. `tools` is retained for the
        // compatibility factory; `customTools` is the SDK-facing declaration
        // and must be present before the first turn.
        customTools: context.tools ?? [],
        modelRuntime: modelRuntime ?? null,
        modelRuntimeOptions: runtimeConfig.modelRuntimeOptions ?? null,
        credentialStore: runtimeConfig.credentialStore ?? null,
        piModel: runtimeConfig.piModel ?? null,
        modelObject: runtimeConfig.modelObject ?? null,
        resourceLoader: runtimeConfig.resourceLoader ?? (useBundledPiSdk ? createIsolatedResourceLoader() : null),
        settingsManager: runtimeConfig.settingsManager ?? null,
        // The Site root is not an SDK working-directory authority. A process
        // cwd may be supplied only by the explicitly admitted runtime config.
        cwd: runtimeConfig.cwd ?? null,
        sdk: resolvedSdk,
        sessionFactory,
        providerInvoker,
      };
      const built = await buildSession(sessionOptions);
      session = built.session;
      sessionUsesSdkModelRuntime = Boolean(
        sessionOptions.modelRuntime
        || typeof sessionOptions.sdk?.createAgentSession === 'function',
      );
      await session.start?.(context);
      started = true;
      return { negotiation, isolation, session_id: context.session_id, session_kind: built.kind, started_at: now() };
    },
    async runTurn(input = {}, eventSink = async () => {}) {
      if (!started) throw new NarsKernelContractError('pi_host_not_started', 'Pi SDK host is not started.');
      if (closed) throw new NarsKernelContractError('pi_host_closed', 'Pi SDK host is closed.');
      const listener = (event) => eventSink(event);
      eventListeners.add(listener);
      currentTurnInput = input;
      try {
        if (sessionUsesSdkModelRuntime) {
          const admitted = resolveAdmittedPiModelOptions(input);
          if (admitted.provider || admitted.model || admitted.thinking) {
            await reconfigureSession({
              ...(admitted.provider ? { provider: admitted.provider } : {}),
              ...(admitted.model ? { model: admitted.model } : {}),
              ...(admitted.thinking ? { thinking: admitted.thinking } : {}),
            });
          }
        }
        return await session.runTurn(input);
      } finally {
        currentTurnInput = null;
        eventListeners.delete(listener);
      }
    },
    async steer(input) { return session?.steer?.(input) ?? { accepted: false, reason: 'pi_host_not_started' }; },
    async cancel(reason) { return session?.cancel?.(reason) ?? { requested: false, reason: 'pi_host_not_started' }; },
    async reconfigure(config) { return reconfigureSession(config); },
    async recover({ context = null } = {}) {
      if (!started) return { continuation_state_discarded: false, reason: 'pi_host_not_started' };
      if (closed) throw new NarsKernelContractError('pi_host_closed', 'Pi SDK host is closed.');
      const previous = session;
      session = null;
      await previous?.close?.();
      const built = await buildSession(sessionOptions ?? {
        ...activeConfig,
        sessionId: sessionContext?.session_id ?? null,
        tools: sessionContext?.tools ?? [],
        customTools: sessionContext?.tools ?? [],
        sdk,
        sessionFactory,
        providerInvoker,
      });
      session = built.session;
      sessionUsesSdkModelRuntime = Boolean(
        (sessionOptions ?? {}).modelRuntime
        || typeof (sessionOptions ?? {}).sdk?.createAgentSession === 'function',
      );
      await session.start?.({
        ...(sessionContext ?? {}),
        provider: activeConfig.provider,
        model: activeConfig.model,
        thinking: activeConfig.thinking,
        context_projection: context,
      });
      return { continuation_state_discarded: true, session_recreated: true, session_kind: built.kind };
    },
    async close() { if (closed) return; closed = true; await session?.close?.(); session = null; },
    health() {
      return {
        pi_version: negotiation?.pi_version ?? piVersion ?? 'narada-pi-compat',
        pi_mode: negotiation?.mode ?? 'compat',
        supported_capabilities: negotiation?.capabilities ?? [],
        isolation: isolation ?? null,
        session_state: closed ? 'closed' : started ? 'ready' : 'created',
      };
    },
    adapterVersion: PI_ADAPTER_VERSION,
  });
}
