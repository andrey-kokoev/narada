import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REGISTRATION_RELATIVE_PATH = join('.narada', 'agent-carriers', 'narada-native-adapter-registration.v0.json');
const SECRET_KEY_PATTERN = /(api[_-]?key|authorization|bearer|client[_-]?secret|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|sk-[A-Za-z0-9_-]{12,})/i;
const UNSAFE_EVIDENCE_POLICY_KEYS = [
  'raw_prompts_recorded',
  'raw_outputs_recorded',
  'raw_secret_values_recorded',
  'unbounded_transcripts_recorded',
];

function registrationPath(siteRoot) {
  return join(siteRoot, REGISTRATION_RELATIVE_PATH);
}

function inspectSecretBearingConfig(value, path = []) {
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...inspectSecretBearingConfig(item, [...path, String(index)])));
    return findings;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (SECRET_KEY_PATTERN.test(key)) findings.push(childPath.join('.'));
      findings.push(...inspectSecretBearingConfig(child, childPath));
    }
    return findings;
  }
  if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
    findings.push(path.join('.') || '<config>');
  }
  return findings;
}

function sanitizeRegistration(record) {
  return {
    schema: 'narada.narada_native_carrier.adapter_registration.v0',
    adapter_id: record.adapter_id,
    adapter_kind: record.adapter_kind,
    provider_kind: record.provider_kind ?? 'fixture',
    capability_ref: record.capability_ref ?? null,
    model_posture: record.model_posture ?? 'fixture',
    executor_posture: record.executor_posture ?? 'no_effect',
    supported_request_classes: record.supported_request_classes ?? ['prompt_context'],
    supported_response_classes: record.supported_response_classes ?? ['inert_proposal', 'refusal', 'closeout_summary'],
    evidence_policy: {
      raw_prompts_recorded: false,
      raw_outputs_recorded: false,
      raw_secret_values_recorded: false,
      unbounded_transcripts_recorded: false,
    },
    provider_config_summary: {
      keys: Object.keys(record.provider_config ?? {}).sort(),
      values_omitted: true,
    },
    raw_provider_config_recorded: false,
    raw_secret_values_recorded: false,
  };
}

function validateRegistration(record, grantedCapabilities = {}) {
  const secretFindings = [...new Set(inspectSecretBearingConfig(record.provider_config ?? {}))];
  if (secretFindings.length > 0) {
    return {
      status: 'refused',
      reason: 'secret_bearing_configuration',
      diagnostic: `Adapter registration contains secret-like fields at ${secretFindings.join(', ')}. Use capability references instead of raw secrets.`,
      secret_findings: secretFindings,
    };
  }
  const unsafePolicyKeys = UNSAFE_EVIDENCE_POLICY_KEYS.filter((key) => record.evidence_policy?.[key] === true);
  if (unsafePolicyKeys.length > 0) {
    return {
      status: 'refused',
      reason: 'unsafe_evidence_policy',
      diagnostic: `Adapter registration cannot record raw prompts, raw outputs, raw secret values, or unbounded transcripts. Unsafe evidence policy key(s): ${unsafePolicyKeys.join(', ')}.`,
      secret_findings: [],
      unsafe_evidence_policy_keys: unsafePolicyKeys,
    };
  }
  if (record.provider_kind && record.provider_kind !== 'fixture' && !record.capability_ref) {
    return {
      status: 'refused',
      reason: 'missing_capability_ref',
      diagnostic: 'Provider-backed Narada-native adapters require a capability_ref.',
      secret_findings: [],
    };
  }
  if (record.capability_ref && grantedCapabilities[record.capability_ref] !== true) {
    return {
      status: 'refused',
      reason: 'invalid_or_ungranted_capability',
      diagnostic: `Capability reference '${record.capability_ref}' is not granted for this adapter.`,
      secret_findings: [],
    };
  }
  return {
    status: 'accepted',
    reason: record.provider_kind && record.provider_kind !== 'fixture' ? 'provider_adapter_registered' : 'fixture_adapter_registered',
    diagnostic: null,
    secret_findings: [],
  };
}

function registrationReadiness(record = null, grantedCapabilities = {}) {
  if (!record) {
    return {
      schema: 'narada.narada_native_carrier.adapter_registration_readiness.v0',
      status: 'fixture_fallback',
      provider_kind: 'fixture',
      capability_posture: 'not_required_for_fixture',
      registration: sanitizeRegistration({
        adapter_id: 'fixture',
        adapter_kind: 'model_executor_fixture',
        provider_kind: 'fixture',
      }),
      refusal: null,
    };
  }
  if (record._persisted_registration === true
    && record.schema === 'narada.narada_native_carrier.adapter_registration.v0'
    && record.raw_provider_config_recorded === false
    && record.raw_secret_values_recorded === false) {
    return {
      schema: 'narada.narada_native_carrier.adapter_registration_readiness.v0',
      status: record.provider_kind === 'fixture' ? 'fixture_fallback' : 'configured_provider_adapter',
      provider_kind: record.provider_kind,
      capability_posture: record.capability_ref ? 'capability_reference_recorded' : 'not_required_for_fixture',
      registration: {
        ...record,
        _persisted_registration: undefined,
      },
      refusal: null,
    };
  }
  const validation = validateRegistration(record, grantedCapabilities);
  const sanitized = sanitizeRegistration(record);
  return {
    schema: 'narada.narada_native_carrier.adapter_registration_readiness.v0',
    status: validation.status === 'accepted' ? 'configured_provider_adapter' : 'refused',
    provider_kind: sanitized.provider_kind,
    capability_posture: validation.status === 'accepted'
      ? (sanitized.capability_ref ? 'capability_granted' : 'not_required_for_fixture')
      : validation.reason,
    registration: sanitized,
    refusal: validation.status === 'accepted' ? null : validation,
  };
}

function readRegistration(siteRoot) {
  const path = registrationPath(siteRoot);
  if (!existsSync(path)) return null;
  return {
    ...JSON.parse(readFileSync(path, 'utf8')),
    _persisted_registration: true,
  };
}

function writeRegistration(siteRoot, record, grantedCapabilities = {}) {
  const readiness = registrationReadiness(record, grantedCapabilities);
  if (readiness.status === 'refused') return { readiness, path: null };
  const path = registrationPath(siteRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(readiness.registration, null, 2)}\n`, 'utf8');
  return { readiness, path };
}

export {
  REGISTRATION_RELATIVE_PATH,
  inspectSecretBearingConfig,
  readRegistration,
  registrationPath,
  registrationReadiness,
  validateRegistration,
  writeRegistration,
};
