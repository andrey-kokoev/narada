import type {
  HostFleetCredentialRollbackIntent,
  HostFleetCredentialRotationIntent,
  HostFleetEnrollmentIntent,
  HostFleetLaunchIntent,
  HostFleetLifecycleIntent,
  HostFleetLifecycleOperation,
  HostGatewayTransport,
  HostPlatform,
  HostRecordInput,
  HostGatewayCredentialClass,
} from '@narada-core/host-fleet/contract';
import type { HostFleetRecord } from './adapter';

export interface HostFleetEnrollmentDraft {
  hostId: string;
  hostInstanceId: string;
  displayName: string;
  platform: HostPlatform;
  naradaVersion: string;
  endpoint: string;
  transport: HostGatewayTransport;
  admittedPaths: string;
  credentialRef: string;
  capabilities: string;
  admittedSites: string;
  allowReenrollment: boolean;
}

export interface HostFleetLaunchDraft {
  siteId: string;
  agentId: string;
  operatorSurface: string;
}

export interface HostFleetCredentialRotationDraft {
  credentialRef: string;
  credentialClass: HostGatewayCredentialClass;
  notBefore: string;
  expiresAt: string;
}

export interface HostFleetCredentialRollbackDraft {
  rollbackToRevision: number | string;
}

function requestId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `${prefix}:${randomUuid}` : `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function listValue(value: string): string[] {
  return [...new Set(value.split(/[\n,]/u).map((item) => item.trim()).filter(Boolean))];
}

export function hostFleetEnrollmentDraftFingerprint(draft: HostFleetEnrollmentDraft): string {
  return JSON.stringify({
    host_id: draft.hostId.trim(),
    host_instance_id: draft.hostInstanceId.trim(),
    display_name: draft.displayName.trim(),
    platform: draft.platform,
    narada_version: draft.naradaVersion.trim() || null,
    endpoint: draft.endpoint.trim(),
    transport: draft.transport,
    admitted_paths: listValue(draft.admittedPaths),
    credential_ref: draft.credentialRef.trim(),
    capabilities: listValue(draft.capabilities),
    admitted_sites: listValue(draft.admittedSites),
    allow_reenrollment: draft.allowReenrollment,
  });
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

export function createHostFleetLifecycleIntent(
  host: HostFleetRecord,
  operation: HostFleetLifecycleOperation,
  reason: string,
): HostFleetLifecycleIntent {
  return {
    schema: 'narada.host_fleet.lifecycle_intent.v1',
    request_id: requestId('host-lifecycle'),
    operation,
    host: { host_id: host.hostId, host_instance_id: host.hostInstanceId },
    expected_revision: host.revision,
    confirmation: `${host.hostId}@${host.hostInstanceId}`,
    reason: reason.trim() || null,
  };
}

export function createHostFleetLaunchIntent(
  host: HostFleetRecord,
  draft: HostFleetLaunchDraft,
): HostFleetLaunchIntent {
  const siteId = required(draft.siteId, 'host_launch_site_id_required');
  const agentId = required(draft.agentId, 'host_launch_agent_id_required');
  const surface = draft.operatorSurface.trim();
  return {
    schema: 'narada.host_fleet.launch_intent.v1',
    request_id: requestId('host-launch'),
    host: { host_id: host.hostId, host_instance_id: host.hostInstanceId },
    expected_revision: host.revision,
    site_id: siteId,
    agent_id: agentId,
    operator_surface: surface || null,
    confirmation: `${host.hostId}@${host.hostInstanceId}`,
  };
}

export function hostFleetCredentialRotationDraftFingerprint(draft: HostFleetCredentialRotationDraft): string {
  return JSON.stringify({
    credential_ref: draft.credentialRef.trim(),
    credential_class: draft.credentialClass,
    not_before: draft.notBefore.trim() || null,
    expires_at: draft.expiresAt.trim() || null,
  });
}

export function createHostFleetCredentialRotationIntent(
  host: HostFleetRecord,
  draft: HostFleetCredentialRotationDraft,
): HostFleetCredentialRotationIntent {
  return {
    schema: 'narada.host_fleet.credential_rotation_intent.v1',
    request_id: requestId('host-credential-rotate'),
    host: { host_id: host.hostId, host_instance_id: host.hostInstanceId },
    expected_revision: host.revision,
    credential_ref: required(draft.credentialRef, 'host_credential_ref_required'),
    credential: {
      schema: 'narada.host_fleet.gateway_credential.v1',
      class: draft.credentialClass,
      not_before: draft.notBefore.trim() || null,
      expires_at: draft.expiresAt.trim() || null,
    },
    confirmation: `${host.hostId}@${host.hostInstanceId}`,
  };
}

export function createHostFleetCredentialRollbackIntent(
  host: HostFleetRecord,
  draft: HostFleetCredentialRollbackDraft,
): HostFleetCredentialRollbackIntent {
  const rollbackToRevision = typeof draft.rollbackToRevision === 'string'
    ? Number(draft.rollbackToRevision.trim())
    : draft.rollbackToRevision;
  if (!Number.isInteger(rollbackToRevision) || rollbackToRevision < 1) throw new Error('host_credential_rollback_target_revision_invalid');
  return {
    schema: 'narada.host_fleet.credential_rollback_intent.v1',
    request_id: requestId('host-credential-rollback'),
    host: { host_id: host.hostId, host_instance_id: host.hostInstanceId },
    expected_revision: host.revision,
    rollback_to_revision: rollbackToRevision,
    confirmation: `${host.hostId}@${host.hostInstanceId}`,
  };
}

export function createHostFleetEnrollmentIntent(
  draft: HostFleetEnrollmentDraft,
  expectedRevision: number | null,
): HostFleetEnrollmentIntent {
  const host: HostRecordInput = {
    host_id: required(draft.hostId, 'host_enrollment_host_id_required'),
    host_instance_id: required(draft.hostInstanceId, 'host_enrollment_host_instance_id_required'),
    display_name: required(draft.displayName, 'host_enrollment_display_name_required'),
    platform: draft.platform,
    narada_version: draft.naradaVersion.trim() || null,
    gateway: {
      endpoint: required(draft.endpoint, 'host_enrollment_endpoint_required'),
      transport: draft.transport,
      admitted_paths: listValue(draft.admittedPaths),
      credential: {
        schema: 'narada.host_fleet.gateway_credential.v1',
        class: 'dedicated_host_gateway',
        not_before: null,
        expires_at: null,
      },
    },
    capabilities: listValue(draft.capabilities),
    admitted_sites: listValue(draft.admittedSites),
    credential_ref: required(draft.credentialRef, 'host_enrollment_credential_ref_required'),
    lifecycle_state: 'pending',
  };
  return {
    schema: 'narada.host_fleet.enrollment_intent.v1',
    request_id: requestId('host-enrollment'),
    host,
    expected_revision: expectedRevision,
    allow_reenrollment: draft.allowReenrollment,
    confirmation: `${host.host_id}@${host.host_instance_id}`,
  };
}
