import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';

export const PI_RUNTIME_ISOLATION_POSTURE = Object.freeze({
  schema: 'narada.nars.pi.runtime_isolation.v1',
  // This is an adapter posture, not an operating-system sandbox claim. The
  // SDK runs in-process; only the RPC mode gets a filtered child boundary.
  process_sandbox: 'not-provided',
  ambient_resource_isolation: 'strict-adapter-policy',
  ambient_extensions: false,
  project_extensions: false,
  ambient_packages: false,
  ambient_credentials: false,
  native_tools: false,
  shell_execution: false,
  filesystem_mutation: false,
  user_session_directory: false,
  session_storage: 'in-memory-derived-continuation',
  provider_selection: 'nars-admitted-plan',
  tool_registration: 'nars-gateway-proxies-only',
});

const forbiddenKeys = new Set([
  'apikey',
  'accesstoken',
  'clientsecret',
  'refreshtoken',
  'password',
  'authorization',
  'credential',
  'secret',
  'token',
  'privatekey',
]);

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isCredentialKey(key) {
  const normalized = normalizedKey(key);
  return forbiddenKeys.has(normalized)
    || normalized.includes('apikey')
    || normalized.includes('accesstoken')
    || normalized.includes('refreshtoken')
    || normalized.includes('clientsecret')
    || normalized.includes('privatekey')
    || normalized.includes('accesskey')
    || normalized.includes('secret')
    || (normalized.includes('credential') && !normalized.endsWith('ref') && !normalized.endsWith('locator'))
    || normalized.endsWith('password')
    || normalized.endsWith('token');
}

function hasCredentialMaterial(value, path = '$') {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = hasCredentialMaterial(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (isCredentialKey(key) && nested != null && String(nested).trim()) return `${path}.${key}`;
    const found = hasCredentialMaterial(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

/** Build explicit Pi host configuration without consulting ambient Pi state. */
export function createPiRuntimeIsolationConfig({
  provider = null,
  model = null,
  thinking = null,
  sdkVersion = null,
  mode = 'sdk',
  tools = [],
  extensionNames = [],
  packageNames = [],
  credentialRefs = [],
  extra = {},
} = {}) {
  if (!['sdk', 'rpc', 'compat'].includes(mode)) {
    throw new NarsKernelContractError('pi_runtime_mode_invalid', `Unsupported Pi runtime mode '${mode}'.`);
  }
  const credentialPath = hasCredentialMaterial(extra);
  if (credentialPath) {
    throw new NarsKernelContractError('pi_raw_credential_forbidden', `Raw credential material is forbidden at ${credentialPath}.`);
  }
  if (extensionNames.length || packageNames.length) {
    throw new NarsKernelContractError('pi_ambient_resources_forbidden', 'Pi extensions and ambient packages must not be loaded.');
  }
  if (!Array.isArray(tools)) throw new NarsKernelContractError('pi_tools_invalid', 'Pi tools must be an array.');
  if (tools.some((tool) => tool?.native === true || tool?.source === 'ambient')) {
    throw new NarsKernelContractError('pi_native_tool_forbidden', 'Pi native or ambient tools cannot be admitted.');
  }
  if (tools.some((tool) => tool?.nars_gateway_proxy !== true)) {
    throw new NarsKernelContractError('pi_gateway_tool_required', 'Pi tools must be explicit NARS capability-gateway proxies.');
  }
  return Object.freeze({
    ...PI_RUNTIME_ISOLATION_POSTURE,
    execution_boundary: mode === 'rpc' ? 'filtered-child-process' : 'in-process-adapter',
    ambient_resource_enforcement: mode === 'rpc'
      ? 'filtered-environment-disposable-cwd'
      : 'configuration-and-adapter-checks',
    provider: nonEmpty(provider),
    model: nonEmpty(model),
    thinking: nonEmpty(thinking),
    pi_version: nonEmpty(sdkVersion),
    mode,
    credential_refs: Object.freeze([...credentialRefs].map((ref) => String(ref))),
    tools: Object.freeze([...tools]),
  });
}

export function assertPiRuntimeIsolation(config) {
  if (!config || typeof config !== 'object') throw new NarsKernelContractError('pi_runtime_isolation_missing', 'Pi isolation configuration is required.');
  for (const [key, expected] of Object.entries(PI_RUNTIME_ISOLATION_POSTURE)) {
    if (config[key] !== expected) {
      throw new NarsKernelContractError('pi_runtime_isolation_violation', `Pi isolation posture '${key}' is not '${expected}'.`, { key, expected, actual: config[key] });
    }
  }
  if (!['sdk', 'rpc', 'compat'].includes(config.mode)) {
    throw new NarsKernelContractError('pi_runtime_mode_invalid', `Unsupported Pi runtime mode '${config.mode}'.`);
  }
  const expectedBoundary = config.mode === 'rpc' ? 'filtered-child-process' : 'in-process-adapter';
  const expectedEnforcement = config.mode === 'rpc'
    ? 'filtered-environment-disposable-cwd'
    : 'configuration-and-adapter-checks';
  if (config.execution_boundary !== expectedBoundary) {
    throw new NarsKernelContractError('pi_runtime_isolation_violation', 'Pi execution boundary does not match its mode.', { expected: expectedBoundary, actual: config.execution_boundary });
  }
  if (config.ambient_resource_enforcement !== expectedEnforcement) {
    throw new NarsKernelContractError('pi_runtime_isolation_violation', 'Pi ambient-resource enforcement does not match its mode.', { expected: expectedEnforcement, actual: config.ambient_resource_enforcement });
  }
  return config;
}
