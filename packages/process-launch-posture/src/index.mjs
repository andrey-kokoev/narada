import { spawn, spawnSync } from 'node:child_process';

const HIDDEN_POSTURES = new Set([
  'browser_open',
  'provider_subprocess',
  'mcp_server',
  'governed_command_execution',
  'test_child',
]);

function browserOpenCommand(target, { platform = process.platform } = {}) {
  if (!target || typeof target !== 'string') throw new Error('browser_open_target_required');
  if (platform === 'win32') return { posture: 'browser_open', command: 'cmd.exe', args: ['/c', 'start', '', target] };
  if (platform === 'darwin') return { posture: 'browser_open', command: 'open', args: [target] };
  return { posture: 'browser_open', command: 'xdg-open', args: [target] };
}

function spawnHiddenPostureProcess(command, args, options = {}) {
  const { posture, spawnImpl = spawn, platform = process.platform, ...restOptions } = options;
  if (!HIDDEN_POSTURES.has(posture)) throw new Error(`hidden_process_posture_required: ${posture ?? 'missing'}`);
  const normalized = normalizeHiddenCommand(command, args, { platform });
  const spawnOptions = {
    ...restOptions,
    windowsHide: true,
  };
  return spawnImpl(normalized.command, normalized.args, spawnOptions);
}

function normalizeHiddenCommand(command, args = [], { platform = process.platform } = {}) {
  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(String(command))) {
    return {
      command: process.env.ComSpec || process.env.COMSPEC || 'cmd.exe',
      args: ['/d', '/s', '/c', String(command), ...args],
    };
  }
  return { command, args };
}

function spawnProviderSubprocess(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'provider_subprocess' });
}

function spawnMcpServer(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'mcp_server' });
}

function runGovernedCommand(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'governed_command_execution' });
}

function spawnTestChild(command, args = [], options = {}) {
  return spawnHiddenPostureProcess(command, args, { ...options, posture: 'test_child' });
}

function openBrowserUrl(target, { platform = process.platform, spawnImpl = spawn } = {}) {
  const plan = browserOpenCommand(target, { platform });
  return new Promise((resolve, reject) => {
    const child = spawnImpl(plan.command, plan.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      resolve({
        ...plan,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        pid: typeof child.pid === 'number' ? child.pid : null,
      });
    });
    child.unref();
  });
}

const OPERATOR_PROJECTION_OPEN_REQUEST_SCHEMA = 'narada.operator_projection_open_request.v1';

function createOperatorProjectionOpenRequest(input = {}, options = {}) {
  const targetRef = input.target_ref ?? input.targetRef ?? input.target ?? null;
  const projectionKind = input.projection_kind ?? input.projectionKind ?? 'browser_url';
  const caller = normalizeOperatorProjectionCaller(input.caller);
  const policy = normalizeOperatorProjectionPolicy(input.policy, input);
  return {
    schema: OPERATOR_PROJECTION_OPEN_REQUEST_SCHEMA,
    projection_kind: String(projectionKind),
    target_ref: targetRef === null || targetRef === undefined ? null : String(targetRef),
    purpose: String(input.purpose ?? 'operator_projection'),
    caller,
    mode: String(input.mode ?? 'execute'),
    policy,
    created_at: options.now instanceof Date ? options.now.toISOString() : new Date().toISOString(),
  };
}

function admitOperatorProjectionOpenRequest(input = {}, options = {}) {
  const request = createOperatorProjectionOpenRequest(input, options);
  if (request.mode === 'plan') {
    return operatorProjectionOpenOutcome(request, 'planned', {
      admission_reason: 'plan_mode',
      mutation_performed: false,
    });
  }
  if (!request.target_ref) {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: 'target_ref_required',
      mutation_performed: false,
    });
  }
  if (request.projection_kind !== 'browser_url') {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: `unsupported_projection_kind:${request.projection_kind}`,
      mutation_performed: false,
    });
  }
  const suppressReason = request.policy.suppress_reason ?? operatorProjectionEnvironmentSuppressReason(options.env ?? process.env, options.platform ?? process.platform);
  if (suppressReason) {
    return operatorProjectionOpenOutcome(request, 'suppressed', {
      admission_reason: suppressReason,
      mutation_performed: false,
    });
  }
  if (request.policy.allow_visible_host_effect !== true) {
    return operatorProjectionOpenOutcome(request, 'refused', {
      admission_reason: 'visible_host_effect_not_admitted',
      mutation_performed: false,
    });
  }
  return operatorProjectionOpenOutcome(request, 'admitted', {
    admission_reason: 'visible_host_effect_admitted',
    mutation_performed: false,
  });
}

async function executeOperatorProjectionOpenRequest(input = {}, options = {}) {
  const admitted = admitOperatorProjectionOpenRequest(input, options);
  if (admitted.status !== 'admitted') return admitted;
  const executor = options.openUrl
    ? async (target) => {
      await options.openUrl(target);
      return { posture: 'browser_open', command: 'injected_open_url', args: [target], detached: true, stdio: 'ignore', windowsHide: true, pid: null };
    }
    : (options.openBrowserUrl ?? openBrowserUrl);
  try {
    const executorResult = await executor(admitted.target_ref, options.browserOpenOptions ?? {});
    return operatorProjectionOpenOutcome(admitted, 'opened', {
      admission_reason: admitted.admission_reason,
      mutation_performed: true,
      opened_at: options.now instanceof Date ? options.now.toISOString() : new Date().toISOString(),
      executor_result: executorResult,
    });
  } catch (error) {
    return operatorProjectionOpenOutcome(admitted, 'failed', {
      admission_reason: admitted.admission_reason,
      mutation_performed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeOperatorProjectionCaller(caller) {
  const record = caller && typeof caller === 'object' && !Array.isArray(caller) ? caller : {};
  return {
    package: typeof record.package === 'string' ? record.package : null,
    command: typeof record.command === 'string' ? record.command : null,
    module: typeof record.module === 'string' ? record.module : null,
  };
}

function normalizeOperatorProjectionPolicy(policy, input) {
  const record = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
  const allowVisibleHostEffect = record.allow_visible_host_effect ?? record.allowVisibleHostEffect ?? input.allowVisibleHostEffect;
  const suppressReason = record.suppress_reason ?? record.suppressReason ?? input.suppressReason ?? null;
  return {
    allow_visible_host_effect: allowVisibleHostEffect === undefined ? true : allowVisibleHostEffect === true,
    suppress_reason: typeof suppressReason === 'string' && suppressReason.trim() ? suppressReason.trim() : null,
  };
}

function operatorProjectionEnvironmentSuppressReason(env, platform) {
  if (env.NARADA_NO_BROWSER) return 'operator_policy:NARADA_NO_BROWSER';
  if (env.CI) return 'headless:CI';
  if (env.HEADLESS) return 'headless:HEADLESS';
  if (platform === 'linux' && !env.DISPLAY) return 'headless:linux_without_DISPLAY';
  return null;
}

function operatorProjectionOpenOutcome(request, status, fields) {
  return {
    ...request,
    status,
    ...fields,
  };
}

function startOperatorTerminal(command, args = [], options = {}) {
  if (!command || typeof command !== 'string') throw new Error('operator_terminal_command_required');
  const { spawnSyncImpl = spawnSync, ...spawnOptions } = options;
  const stdio = spawnOptions.stdio ?? 'inherit';
  const result = spawnSyncImpl(command, args, {
    ...spawnOptions,
    stdio,
    windowsHide: false,
  });
  return {
    posture: 'operator_terminal',
    command,
    args,
    stdio,
    windowsHide: false,
    result,
  };
}

function startElevatedOrOperatorPrompt(command, args = [], options = {}) {
  const { reason, ...terminalOptions } = options;
  if (!reason || typeof reason !== 'string') throw new Error('elevated_or_operator_prompt_reason_required');
  return {
    ...startOperatorTerminal(command, args, terminalOptions),
    posture: 'elevated_or_operator_prompt',
  };
}

export {
  browserOpenCommand,
  createOperatorProjectionOpenRequest,
  admitOperatorProjectionOpenRequest,
  executeOperatorProjectionOpenRequest,
  normalizeHiddenCommand,
  openBrowserUrl,
  runGovernedCommand,
  spawnMcpServer,
  spawnProviderSubprocess,
  startOperatorTerminal,
  startElevatedOrOperatorPrompt,
  spawnTestChild,
  spawnHiddenPostureProcess,
};

