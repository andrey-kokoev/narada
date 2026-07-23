import { NarsKernelContractError } from '@narada2/nars-intelligence-kernel-contract';

export const PI_ADAPTER_VERSION = 'narada-pi-adapter-0.1.0';
export const PI_EVENT_ADAPTER_VERSION = 'narada-pi-events.v1';
export const PI_TOOL_POSTURE_VERSION = 'nars-gateway-only.v1';
export const SUPPORTED_PI_EVENT_KINDS = Object.freeze([
  'assistant_token',
  'assistant_message',
  'provider_telemetry',
  'usage',
  'usage_update',
  'tool_call',
  'tool_result',
  'tool_execution',
  'tool_execution_telemetry',
  'retry',
  'compaction',
  'cancellation',
  'provider_failure',
  'turn_failure',
  'turn_failure_candidate',
  'turn_failed',
  'turn_complete',
  'process_exit',
  // Pi SDK/CLI event vocabulary accepted by the adapter and normalized to
  // the representation-neutral kinds above.
  'message_update',
  'message_start',
  'message_end',
  'tool_execution_start',
  'tool_execution_update',
  'tool_execution_end',
  'turn_start',
  'turn_end',
  'agent_start',
  'agent_end',
  'queue_update',
  'auto_retry_start',
  'auto_retry_end',
  'compaction_start',
  'compaction_end',
  'session_shutdown',
]);
export const SUPPORTED_PI_CAPABILITIES = Object.freeze([
  'provider-cognition',
  'assistant-stream-normalization',
  'usage-telemetry',
  'tool-proxy-visibility',
  'tool-execution-telemetry',
  'provider-retry',
  'compaction-evidence',
  'cancellation',
  'health-projection',
]);

export function negotiatePiCapabilities({
  piVersion = 'narada-pi-compat',
  mode = 'sdk',
  capabilities = SUPPORTED_PI_CAPABILITIES,
  eventKinds = SUPPORTED_PI_EVENT_KINDS,
  required = [],
  peerAdvertised = false,
} = {}) {
  if (typeof piVersion !== 'string' || !piVersion.trim()) {
    throw new NarsKernelContractError('pi_version_required', 'An explicit Pi version is required for capability negotiation.');
  }
  if (!['sdk', 'rpc', 'compat'].includes(mode)) {
    throw new NarsKernelContractError('pi_mode_invalid', `Unsupported Pi mode '${mode}'.`);
  }
  if (!Array.isArray(capabilities) || !Array.isArray(eventKinds)) {
    throw new NarsKernelContractError('pi_capability_profile_invalid', 'Pi capabilities and event kinds must be arrays.');
  }
  if (capabilities.some((capability) => typeof capability !== 'string' || !capability.trim())
    || eventKinds.some((kind) => typeof kind !== 'string' || !kind.trim())) {
    throw new NarsKernelContractError('pi_capability_profile_invalid', 'Pi capabilities and event kinds must contain non-empty strings.');
  }
  if (new Set(capabilities).size !== capabilities.length || new Set(eventKinds).size !== eventKinds.length) {
    throw new NarsKernelContractError('pi_capability_profile_duplicate', 'Pi capability and event-kind advertisements must not contain duplicates.');
  }
  if (typeof peerAdvertised !== 'boolean') {
    throw new NarsKernelContractError('pi_capability_evidence_invalid', 'Pi capability evidence must declare whether a peer advertised the profile.');
  }
  const missing = required.filter((capability) => !capabilities.includes(capability));
  const unsupportedCapabilities = capabilities.filter((capability) => !SUPPORTED_PI_CAPABILITIES.includes(capability));
  const unsupportedEvents = eventKinds.filter((kind) => !SUPPORTED_PI_EVENT_KINDS.includes(kind));
  if (missing.length || unsupportedCapabilities.length || unsupportedEvents.length) {
    throw new NarsKernelContractError('pi_capability_negotiation_failed', 'Pi capability negotiation failed closed.', { missing, unsupported_capabilities: unsupportedCapabilities, unsupported_events: unsupportedEvents });
  }
  return Object.freeze({
    schema: 'narada.nars.pi.capability_negotiation.v1',
    adapter_version: PI_ADAPTER_VERSION,
    pi_version: piVersion.trim(),
    mode,
    capabilities: Object.freeze([...capabilities]),
    event_adapter_version: PI_EVENT_ADAPTER_VERSION,
    tool_posture_version: PI_TOOL_POSTURE_VERSION,
    // Preserve the negotiated peer profile. The adapter's superset is not
    // evidence that a peer supports every event kind.
    supported_event_kinds: Object.freeze([...eventKinds]),
    capabilities_verified: peerAdvertised,
    capability_evidence: peerAdvertised ? 'peer-advertised' : 'adapter-declared',
    ambient_resource_isolation: 'strict-adapter-policy',
  });
}
