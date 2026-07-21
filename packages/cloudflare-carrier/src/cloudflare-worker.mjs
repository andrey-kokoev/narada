import { classifyCarrierInputAdmission, classifyToolEffectAdmission } from '@narada2/carrier-protocol';
import { normalizeIntelligenceInvocationControl } from '@narada2/invokable-intelligence-contract';
import { createCloudflareSiteRegistryAdapter } from '@narada2/cloudflare-site-registry';
import {
  SITE_AUTHORITY_ACTIONS,
  SITE_EMBODIMENT_KINDS,
  SITE_MUTATION_CLASSES,
  classifySiteAuthorityRequest,
  createCloudflareSiteAuthorityMap,
} from '@narada2/site-authority-map';
import {
  SITE_CONTINUITY_EMBODIMENT_KINDS,
  SITE_CONTINUITY_EXCHANGE_CLASSES,
  classifySiteContinuityExchangePacket,
  classifySiteContinuityExchange,
  createSiteContinuityExchangePacket,
  createSiteContinuityPacketId,
  createSiteContinuityBinding,
} from '@narada2/site-continuity';

import { createCarrierIntelligenceGateway } from './cloudflare-intelligence-resolution.mjs';
import { executeCloudflareIntelligenceManagement } from './cloudflare-intelligence-management-api.mjs';
import { createCloudflareCarrierConfig } from './cloudflare-carrier-config.mjs';
import { CloudflareCarrierDurableObjectBase } from './cloudflare-carrier-durable-object.mjs';
import { cloudflareCarrierSessionMutates } from './cloudflare-carrier.mjs';
import { createCloudflareCarrierHttpRouter } from './cloudflare-http-router.mjs';
import { createCloudflareProductOperationRegistry } from './cloudflare-product-operation-registry.mjs';
import { createCloudflareProviderAdapter } from './cloudflare-provider-adapter.mjs';
import { createCloudflareD1TaskStoreAdapter as createCloudflareD1TaskStoreAdapterBoundary } from './cloudflare-d1-task-store-adapter.mjs';
import { createCloudflareToolEffectAdapterBoundary } from './cloudflare-tool-effect-adapter.mjs';
import {
  classifyCloudflareAuthorityCommandState,
  classifyCloudflareEvidenceCommandState,
  classifyCloudflareMembershipCommandState,
  classifyCloudflareOperationCommandState,
  classifyCloudflareSessionCommandState,
  classifyCloudflareSiteCommandState,
  classifyCloudflareTaskCommandState,
  renderCloudflareCarrierConsole,
  shouldPromoteOperationOperatorFocus,
} from './cloudflare-operator-console.mjs';
import { renderCloudflareOperatorConsoleAsset } from './cloudflare-operator-console-asset.mjs';

export {
  classifyCloudflareAuthorityCommandState,
  classifyCloudflareEvidenceCommandState,
  classifyCloudflareMembershipCommandState,
  classifyCloudflareOperationCommandState,
  classifyCloudflareSessionCommandState,
  classifyCloudflareSiteCommandState,
  classifyCloudflareTaskCommandState,
  renderCloudflareCarrierConsole,
  shouldPromoteOperationOperatorFocus,
};
const CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF = 'cloudflare-carrier:capability/runtime-metadata-read:v1';
const CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE = 'cloudflare-carrier/runtime-metadata:read-only';
const CLOUDFLARE_KV_GET_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-get:v1';
const CLOUDFLARE_KV_GET_EFFECT_SCOPE = 'cloudflare-kv:read-only:get';
const CLOUDFLARE_KV_PUT_CAPABILITY_REF = 'cloudflare-carrier:capability/kv-put:v1';
const CLOUDFLARE_KV_PUT_EFFECT_SCOPE = 'cloudflare-kv:write:put';
const CLOUDFLARE_TASK_CREATE_CAPABILITY_REF = 'cloudflare-carrier:capability/task-create:v1';
const CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE = 'cloudflare-narada-task:write:create';
const CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF = 'cloudflare-carrier:capability/task-update:v1';
const CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE = 'cloudflare-narada-task:write:update';
const CLOUDFLARE_TASK_LIST_CAPABILITY_REF = 'cloudflare-carrier:capability/task-list:v1';
const CLOUDFLARE_TASK_LIST_EFFECT_SCOPE = 'cloudflare-narada-task:read:list';
const MICROSOFT_OIDC_ISSUER_BASE = 'https://login.microsoftonline.com';
const OPERATOR_SESSION_COOKIE = 'narada_operator_session';
const MICROSOFT_OIDC_PENDING_COOKIE = 'narada_microsoft_oidc_pending';
const DEFAULT_OPERATOR_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MICROSOFT_OIDC_PENDING_TTL_SECONDS = 5 * 60;
const CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_shadow_read.v1';
const CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_observation_primary_with_windows_fallback.v1';
const CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_remote_source_adapter.v1';
const CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_scheduled_source_read.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_direct_remote_metric_source.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_directive_dual_record.v1';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_webhook_delay_directive_primary_with_windows_fallback.v1';
const CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_resident_loop_shadow_read.v1';
const CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA = 'narada.sonar.cloudflare_resident_dispatch_primary_with_windows_fallback.v1';
const CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_SCHEMA = 'narada.sonar.cloudflare_resident_dispatch_windows_fallback_request.v1';
const CLOUDFLARE_MAILBOX_STATUS_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_mailbox_status_shadow_read.v1';
const CLOUDFLARE_MAILBOX_STATUS_SOURCE_READ_SCHEMA = 'narada.sonar.cloudflare_mailbox_status_source_read.v1';
const CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_SCHEMA = 'narada.sonar.cloudflare_mailbox_draft_reply_proposal.v1';
const CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_SCHEMA = 'narada.sonar.cloudflare_mailbox_outlook_draft_create.v1';
const CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA = 'narada.sonar.cloudflare_mailbox_send_accepted.v1';
const CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA = 'narada.sonar.cloudflare_mailbox_send_confirmation.v1';
const CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA = 'narada.sonar.cloudflare_mailbox_send_review.v1';
const CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA = 'narada.sonar.cloudflare_operation_focus_review.v1';
const CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SCHEMA = 'narada.sonar.cloudflare_site_file_change_proposal.v1';
const CLOUDFLARE_SITE_FILE_MATERIALIZATION_SCHEMA = 'narada.sonar.cloudflare_site_file_materialization.v1';
const CLOUDFLARE_LOCAL_INGRESS_REQUEST_SCHEMA = 'narada.sonar.cloudflare_local_ingress_request.v1';
const CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_SCHEMA = 'narada.sonar.cloudflare_local_ingress_evidence.v1';
const CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_SCHEMA = 'narada.sonar.cloudflare_resident_dispatch_windows_fallback_evidence.v1';
const CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_SCHEMA = 'narada.sonar.cloudflare_local_resident_carrier_bridge.v1';
const CLOUDFLARE_LOCAL_INGRESS_PROVIDER_HEARTBEAT_SCHEMA = 'narada.sonar.cloudflare_local_ingress_provider_heartbeat.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_SCHEMA = 'narada.sonar.cloudflare_repository_publication_request.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_SCHEMA = 'narada.sonar.cloudflare_repository_publication_admission.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_SCHEMA = 'narada.sonar.cloudflare_github_repository_publication_execution.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_READINESS_SCHEMA = 'narada.sonar.cloudflare_github_repository_publication_readiness.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SCHEMA = 'narada.sonar.cloudflare_repository_publication_evidence.v1';
const CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_SCHEMA = 'narada.sonar.cloudflare_repository_publication_provider_heartbeat.v1';
const CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_shadow_read.v1';
const CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_write_admission.v1';
const CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_DECISION_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_write_admission_decision.v1';
const CLOUDFLARE_TASK_LIFECYCLE_TASK_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_task.v1';
const CLOUDFLARE_TASK_LIFECYCLE_TASK_CREATE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_task_create.v1';
const CLOUDFLARE_TASK_LIFECYCLE_TASK_CLAIM_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_task_claim.v1';
const CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_task_report.v1';
const CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA = 'narada.sonar.cloudflare_changed_file_evidence.v1';
const CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_task_finish.v1';
const CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_projection_write.v1';
const CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_source_state_write.v1';
const CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_assignment_write.v1';
const CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_role_resolution_write.v1';
const CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA = 'narada.sonar.cloudflare_task_lifecycle_roster_mutation_write.v1';
const CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE = 'cloudflare_shadow_read';
const CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY = 'cloudflare_primary_observation_read';
const CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY = 'cloudflare_webhook_delay_remote_source_adapter';
const CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_AUTHORITY = 'cloudflare_webhook_delay_direct_remote_metric_source_adapter';
const CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY = 'cloudflare_cron_trigger';
const WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY = 'windows_observation_read_fallback';
const CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY = 'cloudflare_directive_dual_recorded';
const CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY = 'cloudflare_primary_directive_delivery';
const CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY = 'cloudflare_primary_dispatcher';
const WINDOWS_PRIMARY_DISPATCH_AUTHORITY = 'windows_primary_dispatcher';
const WINDOWS_FALLBACK_DISPATCH_AUTHORITY = 'windows_fallback_dispatcher';
const CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_AUTHORITY = 'cloudflare_resident_dispatch_windows_fallback_request_queue';
const CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_STORE_AUTHORITY = 'cloudflare_resident_dispatch_windows_fallback_evidence_store';
const CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_AUTHORITY = 'cloudflare_operator_local_resident_carrier_bridge';
const CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_STORE_AUTHORITY = 'cloudflare_local_resident_carrier_bridge_store';
const WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY = 'windows_local_site_resident_loop';
const CLOUDFLARE_MAILBOX_STATUS_SOURCE_AUTHORITY = 'cloudflare_graph_mailbox_status_source';
const CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_AUTHORITY = 'cloudflare_carrier_site';
const CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_AUTHORITY = 'cloudflare_graph_outlook_draft_create';
const CLOUDFLARE_MAILBOX_SEND_AUTHORITY = 'cloudflare_graph_mailbox_send';
const CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_AUTHORITY = 'cloudflare_graph_sent_items_reconciliation';
const CLOUDFLARE_MAILBOX_SEND_REVIEW_AUTHORITY = 'cloudflare_operator_mailbox_send_review';
const CLOUDFLARE_OPERATION_FOCUS_REVIEW_AUTHORITY = 'cloudflare_operator_operation_focus_review';
const CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY = 'cloudflare_local_ingress_request_queue';
const WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY = 'windows_local_ingress_executor';
const CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY = 'cloudflare_local_ingress_provider_liveness_store';
const CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY = 'cloudflare_repository_publication_request_queue';
const CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY = 'cloudflare_repository_publication_admission_controller';
const CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'cloudflare_github_repository_publication_executor';
const WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY = 'windows_repository_publication_executor';
const CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_AUTHORITY = 'cloudflare_repository_publication_evidence_store';
const CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY = 'cloudflare_repository_publication_provider_liveness_store';
const DEFAULT_LOCAL_INGRESS_PROVIDER_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_REPOSITORY_PUBLICATION_PROVIDER_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_SITE_CONTINUITY_LOOP_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES = 15;
const CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_runtime_metadata_read',
  access: 'read_only',
  substrate: 'cloudflare-worker-runtime',
});
const CLOUDFLARE_KV_PUT_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_kv_put',
  description: 'Write one value into the configured Narada Cloudflare KV namespace by key.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      key: Object.freeze({ type: 'string' }),
      value: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['key', 'value']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_CREATE_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_create',
  description: 'Create a Narada task in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      title: Object.freeze({ type: 'string' }),
      description: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['title']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_UPDATE_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_update',
  description: 'Update status or note for a Narada task in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      task_id: Object.freeze({ type: 'string' }),
      status: Object.freeze({ type: 'string' }),
      note: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['task_id']),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_TASK_LIST_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_task_list',
  description: 'List Narada tasks in the active Cloudflare carrier session task store.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_KV_GET_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_kv_get',
  access: 'read_only',
  substrate: 'cloudflare-kv',
});
const CLOUDFLARE_TASK_CREATE_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_create',
  access: 'write',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_TASK_UPDATE_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_update',
  access: 'write',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_TASK_LIST_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_TASK_LIST_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_TASK_LIST_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_task_list',
  access: 'read_only',
  substrate: 'cloudflare-d1-task-store',
});
const CLOUDFLARE_KV_PUT_CAPABILITY = Object.freeze({
  capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
  effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
  tool_name: 'cloudflare_carrier_kv_put',
  access: 'write',
  substrate: 'cloudflare-kv',
});
const CLOUDFLARE_RUNTIME_METADATA_READ_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_runtime_metadata_read',
  description: 'Read non-secret Narada Cloudflare carrier runtime metadata for the active session.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({}),
    additionalProperties: false,
  }),
});
const CLOUDFLARE_KV_GET_TOOL_DEFINITION = Object.freeze({
  name: 'cloudflare_carrier_kv_get',
  description: 'Read one value from the configured Narada Cloudflare KV namespace by key.',
  parameters: Object.freeze({
    type: 'object',
    properties: Object.freeze({
      key: Object.freeze({ type: 'string' }),
    }),
    required: Object.freeze(['key']),
    additionalProperties: false,
  }),
});

export class CloudflareCarrierDurableObject extends CloudflareCarrierDurableObjectBase {
  constructor(state, env = {}) {
    super(state, env, {
      createProviderAdapter: (runtimeEnv, config) => createCloudflareAiProviderAdapter(runtimeEnv, { config }),
      createToolEffectAdapter: (runtimeEnv) => createCloudflareToolEffectAdapter(runtimeEnv),
      createTaskStoreAdapter: (runtimeEnv) => createCloudflareD1TaskStoreAdapter(runtimeEnv),
      recordEvidenceEvents: recordCloudflareCarrierEvidenceEvents,
    });
  }
}

export function normalizeCloudflareOperationPostureOverview(overview = null, route = null, focusedLifecycle = null, operationCount = 0) {
  if (overview?.schema !== 'narada.cloudflare_operation_posture_overview.v1') return overview;
  const focusedLifecycleStatus = focusedLifecycle?.lifecycle_status ?? focusedLifecycle ?? null;
  const focusedWorkflowRoute = focusedLifecycle?.workflow_route ?? null;
  if (
    route?.next_action !== 'monitor_operations'
    || !focusedLifecycleStatus?.health
  ) {
    return overview;
  }
  if (focusedWorkflowRoute?.next_action && focusedWorkflowRoute.next_action !== 'monitor_operation') {
    const focusedStatus = focusedWorkflowRoute.status ?? (focusedLifecycleStatus?.health === 'ready' ? 'ready' : 'needs_attention');
    return {
      ...overview,
      health_counts: focusedStatus === 'ready'
        ? overview.health_counts
        : {
            ready: Math.max(operationCount - 1, 0),
            needs_attention: 1,
          },
      next_status: focusedStatus,
      next_action: focusedWorkflowRoute.next_action,
      next_reason: focusedWorkflowRoute.reason ?? overview.next_reason,
      next_focus_kind: focusedWorkflowRoute.focus_kind ?? overview.next_focus_kind ?? null,
      next_focus_ref: focusedWorkflowRoute.focus_ref ?? overview.next_focus_ref ?? null,
    };
  }
  return {
    ...overview,
    health_counts: {
      ready: operationCount,
      needs_attention: 0,
    },
    action_counts: {
      monitor_operations: operationCount,
    },
    reason_counts: {
      all_operations_monitoring: operationCount,
    },
    command_state_counts: {
      operation_posture_ready: operationCount,
    },
    next_status: 'ready',
    next_action: 'monitor_operations',
    next_reason: 'all_operations_monitoring',
    next_focus_kind: null,
    next_focus_ref: null,
  };
}

function cloudflareSiteProductAttentionAction(attention = [], {
  operationPostureOverview = null,
  operationContinuityDirectionStatus = null,
  continuityLoopStatus = null,
  continuityReconciliationExecutionStatus = null,
} = {}) {
  if (attention.includes('operation_posture')) {
    const postureAction = operationPostureOverview?.next_action ?? null;
    if (['refresh_site_continuity_loop', 'review_site_continuity_reconciliation_execution'].includes(postureAction)) {
      return postureAction;
    }
    return 'focus_next_operation';
  }
  if (attention.includes('continuity_loop_freshness')) {
    return continuityLoopStatus?.next_action ?? 'refresh_site_continuity_loop';
  }
  if (attention.includes('continuity_reconciliation_execution')) {
    return continuityReconciliationExecutionStatus?.next_action ?? 'review_site_continuity_reconciliation_execution';
  }
  if (attention[0] === 'continuity_direction') {
    return operationContinuityDirectionStatus?.next_action ?? 'continuity_direction';
  }
  return attention[0] ?? 'monitor_site';
}

async function resolveCloudflareGithubRepositoryPublicationCredential(env = {}, fetchImpl = fetch) {
  const token = String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN ?? '').trim();
  if (token) return { ok: true, accessToken: token, mode: 'github_token' };
  const config = readCloudflareGithubRepositoryPublicationCredentialConfig(env);
  if (!config.appConfigured) {
    return { ok: false, code: 'cloudflare_repository_publication_github_credential_missing', missing_configuration: config.missingConfiguration };
  }
  const appId = String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID).trim();
  const installationId = String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID).trim();
  const privateKey = String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY).trim();
  const jwt = await createGithubAppJwt(appId, privateKey);
  const response = await fetchImpl(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'narada-cloudflare-carrier',
      'x-github-api-version': '2022-11-28',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) {
    return {
      ok: false,
      code: 'cloudflare_repository_publication_github_app_installation_token_failed',
      github_http_status: Number(response.status ?? 0),
      github_response_summary: summarizeGithubPublicationResponse(body),
    };
  }
  return { ok: true, accessToken: String(body.token), mode: 'github_app_installation' };
}

async function createGithubAppJwt(appId, privateKeyPem) {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const payload = {
    iat: issuedAt,
    exp: issuedAt + 540,
    iss: String(appId),
  };
  const signingInput = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson(payload)}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8Bytes(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function base64UrlJson(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8Bytes(pem) {
  const normalized = String(pem ?? '').replace(/\\n/g, '\n');
  const base64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlToBytes(base64.replace(/\+/g, '-').replace(/\//g, '_'));
}

async function getCloudflareTaskLifecycleTask(db, siteId, taskId) {
  const row = await db.prepare('SELECT * FROM cloudflare_task_lifecycle_tasks WHERE site_id = ? AND task_id = ?')
    .bind(siteId, taskId)
    .first();
  return row ? formatCloudflareTaskLifecycleTask(row) : null;
}

async function importCloudflareContinuityPacket(env = {}, packet, { imported_by_principal_id = 'unknown-principal' } = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  const decision = classifySiteContinuityExchangePacket(packet);
  if (decision.action === SITE_AUTHORITY_ACTIONS.REFUSE || decision.action === 'refuse') {
    return { ok: false, status: 'refused', site_continuity_packet_admission: decision };
  }
  if (!packet?.site_id) {
    return { ok: false, status: 'refused', site_continuity_packet_admission: { ...decision, action: 'refuse', reason: 'site_continuity_packet_site_id_missing' } };
  }
  await ensureCloudflareContinuityPacketSchema(db);
  const packetId = packet.packet_id ?? createSiteContinuityPacketId(packet);
  const existingPacket = await db.prepare(`SELECT packet_id, imported_at
    FROM cloudflare_site_continuity_packets WHERE packet_id = ?`).bind(packetId).first();
  const importedAt = new Date().toISOString();
  const durabilityAction = existingPacket ? 'refreshed_existing_packet' : 'inserted_new_packet';
  await db.prepare(`INSERT INTO cloudflare_site_continuity_packets (
    packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(packet_id) DO UPDATE SET
    admission_action = excluded.admission_action,
    admission_reason = excluded.admission_reason,
    packet_json = excluded.packet_json,
    imported_by_principal_id = excluded.imported_by_principal_id,
    imported_at = excluded.imported_at`).bind(
    packetId,
    packet.site_id,
    packet.relation_id ?? null,
    packet.source_embodiment_kind,
    packet.target_embodiment_kind,
    decision.action,
    decision.reason,
    JSON.stringify(packet),
    imported_by_principal_id,
    importedAt,
  ).run();
  return {
    ok: true,
    status: 'imported',
    site_continuity_packet_admission: decision,
    packet_record: {
      packet_id: packetId,
      site_id: packet.site_id,
      relation_id: packet.relation_id ?? null,
      source_embodiment_kind: packet.source_embodiment_kind,
      target_embodiment_kind: packet.target_embodiment_kind,
      admission_action: decision.action,
      admission_reason: decision.reason,
      imported_at: importedAt,
      durability_action: durabilityAction,
      previous_imported_at: existingPacket?.imported_at ?? null,
    },
  };
}

async function claimCloudflareTaskLifecycleTask(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_claim_requires_task_id' };
  const claimantAgentId = String(params.claimant_agent_id ?? params.agent ?? '').trim();
  const claimantPrincipalId = String(params.claimant_principal_id ?? principal?.principal_id ?? '').trim();
  if (!claimantAgentId && !claimantPrincipalId) return { ok: false, code: 'task_lifecycle_claim_requires_claimant' };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({ ...params, mutation_class: 'task_claim', claimant_principal_id: claimantPrincipalId || params.claimant_principal_id }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, { ...params, mutation_class: 'task_claim', claimant_principal_id: claimantPrincipalId || params.claimant_principal_id }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CLAIM_SCHEMA,
      code: 'task_lifecycle_claim_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CLAIM_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (existing.status !== 'opened') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CLAIM_SCHEMA,
      code: 'task_lifecycle_claim_conflict',
      site_id: siteId,
      task_id: taskId,
      previous_status: existing.status,
      conflict_policy: decision.conflict_policy,
      rollback_posture: decision.rollback_posture,
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  const now = new Date().toISOString();
  const task = {
    ...existing,
    status: 'claimed',
    claimed_by_agent_id: claimantAgentId || null,
    claimed_by_principal_id: claimantPrincipalId || null,
    assignment_authority_ref: decision.assignment_authority_ref,
    claim_cutover_point_ref: decision.cutover_point_ref,
    claim_governed_write_contract_ref: decision.governed_write_contract_ref,
    claim_confirmation_evidence_ref: decision.confirmation_evidence_ref,
    claim_conflict_policy: decision.conflict_policy,
    claim_rollback_posture: decision.rollback_posture,
    claimed_at: now,
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CLAIM_SCHEMA,
    status: 'claimed',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_claim',
    previous_status: existing.status,
    decision,
    admission_record: admission.record,
    task,
  };
}

async function reportCloudflareTaskLifecycleTask(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_report_requires_task_id' };
  const reporterAgentId = String(params.reporter_agent_id ?? params.agent ?? '').trim();
  const reporterPrincipalId = String(params.reporter_principal_id ?? principal?.principal_id ?? '').trim();
  if (!reporterAgentId && !reporterPrincipalId) return { ok: false, code: 'task_lifecycle_report_requires_reporter' };
  const summary = String(params.summary ?? '').trim();
  if (!summary) return { ok: false, code: 'task_lifecycle_report_requires_summary' };
  const verification = parseCloudflareTaskLifecycleVerification(params.verification);
  if (!verification.ok) return { ok: false, code: verification.code, schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA };
  const changedFiles = parseCloudflareTaskLifecycleStringList(params.changed_files ?? params.changedFiles);
  if (!changedFiles.ok) return { ok: false, code: changedFiles.code, schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA };
  const requestedStatus = String(params.resulting_status ?? params.new_status ?? '').trim();
  const reportStatus = String(params.report_status ?? (requestedStatus === 'needs_continuation' ? 'blocked' : 'submitted')).trim();
  const nextStatus = requestedStatus || (reportStatus === 'blocked' ? 'needs_continuation' : 'closed');
  if (!['closed', 'needs_continuation'].includes(nextStatus)) {
    return { ok: false, code: 'task_lifecycle_report_resulting_status_invalid', schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA, resulting_status: nextStatus };
  }
  if (!['submitted', 'blocked'].includes(reportStatus)) {
    return { ok: false, code: 'task_lifecycle_report_status_invalid', schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA, report_status: reportStatus };
  }
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({ ...params, mutation_class: 'task_report', reporter_principal_id: reporterPrincipalId || params.reporter_principal_id, summary }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, { ...params, mutation_class: 'task_report', reporter_principal_id: reporterPrincipalId || params.reporter_principal_id, summary }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA,
      code: 'task_lifecycle_report_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (existing.status !== 'claimed') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA,
      code: 'task_lifecycle_report_conflict',
      site_id: siteId,
      task_id: taskId,
      previous_status: existing.status,
      conflict_policy: 'claimed_only_report_no_overwrite',
      rollback_posture: decision.rollback_posture,
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  if (existing.claimed_by_agent_id && reporterAgentId && existing.claimed_by_agent_id !== reporterAgentId) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA,
      code: 'task_lifecycle_report_reporter_mismatch',
      site_id: siteId,
      task_id: taskId,
      claimed_by_agent_id: existing.claimed_by_agent_id,
      reporter_agent_id: reporterAgentId,
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  const now = new Date().toISOString();
  const reportId = params.report_id ?? `cloudflare-task-lifecycle-report-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  const report = {
    schema: 'narada.sonar.cloudflare_task_lifecycle_report.v1',
    report_id: reportId,
    task_id: taskId,
    task_number: existing.task_number,
    reporter_agent_id: reporterAgentId || null,
    reporter_principal_id: reporterPrincipalId || null,
    report_authority_ref: decision.report_authority_ref,
    report_schema_ref: decision.report_schema_ref,
    summary,
    changed_files: changedFiles.value,
    changed_file_evidence_boundary_ref: decision.changed_file_evidence_boundary_ref,
    changed_file_evidence_admission: 'not_admitted',
    verification: verification.value,
    report_status: reportStatus,
    previous_status: existing.status,
    resulting_status: nextStatus,
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    rollback_posture: decision.rollback_posture,
    reported_at: now,
  };
  const task = {
    ...existing,
    status: nextStatus,
    report,
    report_id: reportId,
    report_status: reportStatus,
    reported_by_agent_id: reporterAgentId || null,
    reported_by_principal_id: reporterPrincipalId || null,
    reported_at: now,
    report_authority_ref: decision.report_authority_ref,
    report_schema_ref: decision.report_schema_ref,
    report_cutover_point_ref: decision.cutover_point_ref,
    report_governed_write_contract_ref: decision.governed_write_contract_ref,
    report_confirmation_evidence_ref: decision.confirmation_evidence_ref,
    changed_file_evidence_boundary_ref: decision.changed_file_evidence_boundary_ref,
    changed_file_evidence_admission: 'not_admitted',
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_REPORT_SCHEMA,
    status: 'reported',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_report',
    previous_status: existing.status,
    new_status: nextStatus,
    report,
    decision,
    admission_record: admission.record,
    task,
  };
}

async function finishCloudflareTaskLifecycleTask(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_finish_requires_task_id' };
  const finalizerAgentId = String(params.finalizer_agent_id ?? params.agent ?? '').trim();
  const finalizerPrincipalId = String(params.finalizer_principal_id ?? principal?.principal_id ?? '').trim();
  if (!finalizerAgentId && !finalizerPrincipalId) return { ok: false, code: 'task_lifecycle_finish_requires_finalizer' };
  const finishVerdict = String(params.finish_verdict ?? '').trim();
  if (finishVerdict !== 'accepted') {
    return { ok: false, code: 'task_lifecycle_finish_verdict_invalid', schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA, finish_verdict: finishVerdict || null };
  }
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({ ...params, mutation_class: 'task_finish', finalizer_principal_id: finalizerPrincipalId || params.finalizer_principal_id }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, { ...params, mutation_class: 'task_finish', finalizer_principal_id: finalizerPrincipalId || params.finalizer_principal_id }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA,
      code: 'task_lifecycle_finish_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (existing.status !== 'closed' || !existing.report_id) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA,
      code: 'task_lifecycle_finish_conflict',
      site_id: siteId,
      task_id: taskId,
      previous_status: existing.status,
      has_report: Boolean(existing.report_id),
      conflict_policy: decision.conflict_policy,
      rollback_posture: decision.rollback_posture,
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  const now = new Date().toISOString();
  const finishId = params.finish_id ?? `cloudflare-task-lifecycle-finish-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  const finish = {
    schema: 'narada.sonar.cloudflare_task_lifecycle_finish.v1',
    finish_id: finishId,
    task_id: taskId,
    task_number: existing.task_number,
    report_id: existing.report_id,
    finalizer_agent_id: finalizerAgentId || null,
    finalizer_principal_id: finalizerPrincipalId || null,
    finish_authority_ref: decision.finish_authority_ref,
    finish_schema_ref: decision.finish_schema_ref,
    finish_verdict: finishVerdict,
    previous_status: existing.status,
    resulting_status: 'finished',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    rollback_posture: decision.rollback_posture,
    finished_at: now,
  };
  const task = {
    ...existing,
    status: 'finished',
    finish,
    finish_id: finishId,
    finish_verdict: finishVerdict,
    finished_by_agent_id: finalizerAgentId || null,
    finished_by_principal_id: finalizerPrincipalId || null,
    finished_at: now,
    finish_authority_ref: decision.finish_authority_ref,
    finish_schema_ref: decision.finish_schema_ref,
    finish_cutover_point_ref: decision.cutover_point_ref,
    finish_governed_write_contract_ref: decision.governed_write_contract_ref,
    finish_confirmation_evidence_ref: decision.confirmation_evidence_ref,
    finish_conflict_policy: decision.conflict_policy,
    finish_rollback_posture: decision.rollback_posture,
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_FINISH_SCHEMA,
    status: 'finished',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_finish',
    previous_status: existing.status,
    new_status: task.status,
    finish,
    decision,
    admission_record: admission.record,
    task,
  };
}

async function recordCloudflareChangedFileEvidence(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'changed_file_evidence_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA };
  const reportId = String(params.report_id ?? '').trim();
  if (!reportId) return { ok: false, code: 'changed_file_evidence_requires_report_id', schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA };
  const filePath = String(params.file_path ?? params.repo_relative_path ?? '').trim();
  if (!filePath) return { ok: false, code: 'changed_file_evidence_requires_file_path', schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA };
  const reporterAgentId = String(params.reporter_agent_id ?? params.agent ?? '').trim();
  const reporterPrincipalId = String(params.reporter_principal_id ?? principal?.principal_id ?? '').trim();
  if (!reporterAgentId && !reporterPrincipalId) return { ok: false, code: 'changed_file_evidence_requires_reporter', schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'changed_file_evidence',
    report_id: reportId,
    file_path: filePath,
    reporter_principal_id: reporterPrincipalId || params.reporter_principal_id,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'changed_file_evidence',
    report_id: reportId,
    file_path: filePath,
    reporter_principal_id: reporterPrincipalId || params.reporter_principal_id,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
      code: 'changed_file_evidence_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (!existing.report_id || existing.report_id !== reportId) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
      code: 'changed_file_evidence_conflict',
      site_id: siteId,
      task_id: taskId,
      report_id: reportId,
      existing_report_id: existing.report_id,
      conflict_policy: 'reported_task_matching_report_only',
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  if (existing.reported_by_agent_id && reporterAgentId && existing.reported_by_agent_id !== reporterAgentId) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
      code: 'changed_file_evidence_conflict',
      site_id: siteId,
      task_id: taskId,
      report_id: reportId,
      reported_by_agent_id: existing.reported_by_agent_id,
      reporter_agent_id: reporterAgentId,
      conflict_policy: 'reporter_match_only',
      decision,
      admission_record: admission.record,
      task: existing,
    };
  }
  const now = new Date().toISOString();
  const evidenceId = params.evidence_id ?? `cloudflare-changed-file-evidence-${safeIdToken(taskId)}-${safeIdToken(filePath)}-${safeIdToken(now)}`;
  const evidence = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
    evidence_id: evidenceId,
    site_id: siteId,
    task_id: taskId,
    report_id: reportId,
    file_path: filePath,
    reporter_agent_id: reporterAgentId || null,
    reporter_principal_id: reporterPrincipalId || null,
    file_evidence_authority_ref: decision.file_evidence_authority_ref,
    file_material_source_ref: decision.file_material_source_ref,
    repository_authority_ref: decision.repository_authority_ref,
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    projection_write_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    changed_file_evidence_records: [...(existing.changed_file_evidence_records ?? []), evidence],
    changed_file_evidence_admission: 'admitted',
    changed_file_evidence_count: (existing.changed_file_evidence_records ?? []).length + 1,
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_CHANGED_FILE_EVIDENCE_SCHEMA,
    status: 'changed_file_evidence_recorded',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'changed_file_evidence_record',
    decision,
    admission_record: admission.record,
    evidence,
    task,
  };
}

async function recordCloudflareTaskLifecycleProjectionWrite(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_projection_write_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA };
  const projectionTargetRef = String(params.projection_target_ref ?? '').trim();
  if (!projectionTargetRef) return { ok: false, code: 'task_lifecycle_projection_write_requires_projection_target_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA };
  const projectionSchemaRef = String(params.projection_schema_ref ?? '').trim();
  if (!projectionSchemaRef) return { ok: false, code: 'task_lifecycle_projection_write_requires_projection_schema_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA };
  const projectionAuthorityRef = String(params.projection_authority_ref ?? '').trim();
  if (!projectionAuthorityRef) return { ok: false, code: 'task_lifecycle_projection_write_requires_projection_authority_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA };
  const sourceEvidenceRef = String(params.source_evidence_ref ?? '').trim();
  if (!sourceEvidenceRef) return { ok: false, code: 'task_lifecycle_projection_write_requires_source_evidence_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'task_projection_write',
    task_id: taskId,
    projection_target_ref: projectionTargetRef,
    projection_schema_ref: projectionSchemaRef,
    projection_authority_ref: projectionAuthorityRef,
    source_evidence_ref: sourceEvidenceRef,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'task_projection_write',
    task_id: taskId,
    projection_target_ref: projectionTargetRef,
    projection_schema_ref: projectionSchemaRef,
    projection_authority_ref: projectionAuthorityRef,
    source_evidence_ref: sourceEvidenceRef,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA,
      code: 'task_lifecycle_projection_write_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  const now = new Date().toISOString();
  const projectionId = params.projection_id ?? `cloudflare-task-lifecycle-projection-${safeIdToken(taskId)}-${safeIdToken(projectionTargetRef)}-${safeIdToken(now)}`;
  const projection = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA,
    projection_id: projectionId,
    site_id: siteId,
    task_id: taskId,
    task_number: existing.task_number,
    task_status: existing.status,
    projection_target_ref: projectionTargetRef,
    projection_schema_ref: projectionSchemaRef,
    projection_authority_ref: projectionAuthorityRef,
    source_evidence_ref: sourceEvidenceRef,
    source_task_lifecycle_mutation_authority: existing.mutation_authority,
    sqlite_mutation_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    task_lifecycle_projection_records: [...(existing.task_lifecycle_projection_records ?? []), projection],
    task_lifecycle_projection_write_admission: 'admitted',
    task_lifecycle_projection_write_count: (existing.task_lifecycle_projection_records ?? []).length + 1,
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_PROJECTION_WRITE_SCHEMA,
    status: 'task_lifecycle_projection_written',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_projection_write',
    decision,
    admission_record: admission.record,
    projection,
    task,
  };
}

async function recordCloudflareTaskLifecycleSourceStateWrite(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_source_state_write_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA };
  const sourceStateAuthorityRef = String(params.source_state_authority_ref ?? '').trim();
  if (!sourceStateAuthorityRef) return { ok: false, code: 'task_lifecycle_source_state_write_requires_source_state_authority_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA };
  const sourceStateSchemaRef = String(params.source_state_schema_ref ?? '').trim();
  if (!sourceStateSchemaRef) return { ok: false, code: 'task_lifecycle_source_state_write_requires_source_state_schema_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA };
  const sourceStateEvidenceRef = String(params.source_state_evidence_ref ?? '').trim();
  if (!sourceStateEvidenceRef) return { ok: false, code: 'task_lifecycle_source_state_write_requires_source_state_evidence_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'task_source_state_write',
    task_id: taskId,
    source_state_authority_ref: sourceStateAuthorityRef,
    source_state_schema_ref: sourceStateSchemaRef,
    source_state_evidence_ref: sourceStateEvidenceRef,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'task_source_state_write',
    task_id: taskId,
    source_state_authority_ref: sourceStateAuthorityRef,
    source_state_schema_ref: sourceStateSchemaRef,
    source_state_evidence_ref: sourceStateEvidenceRef,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA,
      code: 'task_lifecycle_source_state_write_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  const now = new Date().toISOString();
  const sourceStateWriteId = params.source_state_write_id ?? `cloudflare-task-lifecycle-source-state-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  const sourceStateWrite = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA,
    source_state_write_id: sourceStateWriteId,
    site_id: siteId,
    task_id: taskId,
    task_number: existing.task_number,
    task_status: existing.status,
    source_state_authority_ref: sourceStateAuthorityRef,
    source_state_schema_ref: sourceStateSchemaRef,
    source_state_evidence_ref: sourceStateEvidenceRef,
    previous_source_state_authority: 'windows_task_lifecycle_sqlite',
    canonical_source_state_authority: 'cloudflare_task_lifecycle_d1',
    source_state_write_admission: 'admitted',
    windows_sqlite_source_write_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    assignment_authority_admission: 'not_admitted',
    role_resolution_authority_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    task_lifecycle_source_state_write_records: [...(existing.task_lifecycle_source_state_write_records ?? []), sourceStateWrite],
    task_lifecycle_source_state_write_admission: 'admitted',
    task_lifecycle_source_state_write_count: (existing.task_lifecycle_source_state_write_records ?? []).length + 1,
    canonical_source_state_authority: 'cloudflare_task_lifecycle_d1',
    windows_sqlite_source_write_admission: 'not_admitted',
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA,
    status: 'task_lifecycle_source_state_written',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_source_state_write',
    decision,
    admission_record: admission.record,
    source_state_write: sourceStateWrite,
    task,
  };
}

async function recordCloudflareTaskLifecycleAssignmentWrite(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_assignment_write_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA };
  const assigneeAgentId = String(params.assignee_agent_id ?? params.claimant_agent_id ?? params.agent ?? '').trim();
  const assigneePrincipalId = String(params.assignee_principal_id ?? params.claimant_principal_id ?? principal?.principal_id ?? '').trim();
  if (!assigneeAgentId && !assigneePrincipalId) return { ok: false, code: 'task_lifecycle_assignment_write_requires_assignee', schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA };
  const assignmentAuthorityRef = String(params.assignment_authority_ref ?? '').trim();
  if (!assignmentAuthorityRef) return { ok: false, code: 'task_lifecycle_assignment_write_requires_assignment_authority_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA };
  const assignmentSchemaRef = String(params.assignment_schema_ref ?? '').trim();
  if (!assignmentSchemaRef) return { ok: false, code: 'task_lifecycle_assignment_write_requires_assignment_schema_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA };
  const assignmentEvidenceRef = String(params.assignment_evidence_ref ?? '').trim();
  if (!assignmentEvidenceRef) return { ok: false, code: 'task_lifecycle_assignment_write_requires_assignment_evidence_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'task_assignment_write',
    task_id: taskId,
    assignee_agent_id: assigneeAgentId,
    assignee_principal_id: assigneePrincipalId,
    assignment_authority_ref: assignmentAuthorityRef,
    assignment_schema_ref: assignmentSchemaRef,
    assignment_evidence_ref: assignmentEvidenceRef,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'task_assignment_write',
    task_id: taskId,
    assignee_agent_id: assigneeAgentId,
    assignee_principal_id: assigneePrincipalId,
    assignment_authority_ref: assignmentAuthorityRef,
    assignment_schema_ref: assignmentSchemaRef,
    assignment_evidence_ref: assignmentEvidenceRef,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA,
      code: 'task_lifecycle_assignment_write_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (existing.canonical_source_state_authority !== 'cloudflare_task_lifecycle_d1' && Number(existing.task_lifecycle_source_state_write_count ?? 0) < 1) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA,
      code: 'task_lifecycle_assignment_write_requires_source_state_write',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  const now = new Date().toISOString();
  const assignmentWriteId = params.assignment_write_id ?? `cloudflare-task-lifecycle-assignment-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  const assignment = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA,
    assignment_write_id: assignmentWriteId,
    site_id: siteId,
    task_id: taskId,
    task_number: existing.task_number,
    task_status: existing.status,
    assignee_agent_id: assigneeAgentId || null,
    assignee_principal_id: assigneePrincipalId || null,
    assignment_authority_ref: assignmentAuthorityRef,
    assignment_schema_ref: assignmentSchemaRef,
    assignment_evidence_ref: assignmentEvidenceRef,
    assignment_authority_admission: 'admitted',
    roster_mutation_admission: 'not_admitted',
    role_resolution_authority_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    task_lifecycle_assignment_records: [...(existing.task_lifecycle_assignment_records ?? []), assignment],
    task_lifecycle_assignment_write_admission: 'admitted',
    task_lifecycle_assignment_write_count: (existing.task_lifecycle_assignment_records ?? []).length + 1,
    assignment_authority_admission: 'admitted',
    roster_mutation_admission: 'not_admitted',
    role_resolution_authority_admission: 'not_admitted',
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA,
    status: 'task_lifecycle_assignment_written',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_assignment_write',
    decision,
    admission_record: admission.record,
    assignment,
    task,
  };
}

async function recordCloudflareTaskLifecycleRoleResolutionWrite(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const assigneePrincipalId = String(params.assignee_principal_id ?? params.claimant_principal_id ?? principal?.principal_id ?? '').trim();
  if (!assigneePrincipalId) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_assignee_principal', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const roleResolutionAuthorityRef = String(params.role_resolution_authority_ref ?? '').trim();
  if (!roleResolutionAuthorityRef) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_role_resolution_authority_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const rosterSourceRef = String(params.roster_source_ref ?? '').trim();
  if (!rosterSourceRef) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_roster_source_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const roleResolutionSchemaRef = String(params.role_resolution_schema_ref ?? '').trim();
  if (!roleResolutionSchemaRef) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_role_resolution_schema_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const roleResolutionEvidenceRef = String(params.role_resolution_evidence_ref ?? '').trim();
  if (!roleResolutionEvidenceRef) return { ok: false, code: 'task_lifecycle_role_resolution_write_requires_role_resolution_evidence_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'task_role_resolution_write',
    task_id: taskId,
    assignee_principal_id: assigneePrincipalId,
    role_resolution_authority_ref: roleResolutionAuthorityRef,
    roster_source_ref: rosterSourceRef,
    role_resolution_schema_ref: roleResolutionSchemaRef,
    role_resolution_evidence_ref: roleResolutionEvidenceRef,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'task_role_resolution_write',
    task_id: taskId,
    assignee_principal_id: assigneePrincipalId,
    role_resolution_authority_ref: roleResolutionAuthorityRef,
    roster_source_ref: rosterSourceRef,
    role_resolution_schema_ref: roleResolutionSchemaRef,
    role_resolution_evidence_ref: roleResolutionEvidenceRef,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
      code: 'task_lifecycle_role_resolution_write_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (Number(existing.task_lifecycle_assignment_write_count ?? 0) < 1) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
      code: 'task_lifecycle_role_resolution_write_requires_assignment_write',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  const membership = await db.prepare(`
    SELECT role, status
    FROM cloudflare_site_memberships
    WHERE site_id = ? AND principal_id = ?
  `).bind(siteId, assigneePrincipalId).first();
  if (!membership || membership.status !== 'active') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
      code: 'task_lifecycle_role_resolution_principal_not_active_member',
      site_id: siteId,
      task_id: taskId,
      assignee_principal_id: assigneePrincipalId,
      roster_source_ref: rosterSourceRef,
      decision,
      admission_record: admission.record,
    };
  }
  const now = new Date().toISOString();
  const roleResolutionWriteId = params.role_resolution_write_id ?? `cloudflare-task-lifecycle-role-resolution-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  const roleResolution = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
    role_resolution_write_id: roleResolutionWriteId,
    site_id: siteId,
    task_id: taskId,
    task_number: existing.task_number,
    task_status: existing.status,
    assignee_principal_id: assigneePrincipalId,
    resolved_role: membership.role,
    membership_status: membership.status,
    role_resolution_authority_ref: roleResolutionAuthorityRef,
    roster_source_ref: rosterSourceRef,
    role_resolution_schema_ref: roleResolutionSchemaRef,
    role_resolution_evidence_ref: roleResolutionEvidenceRef,
    role_resolution_authority_admission: 'admitted',
    roster_read_admission: 'admitted',
    roster_mutation_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    task_lifecycle_role_resolution_records: [...(existing.task_lifecycle_role_resolution_records ?? []), roleResolution],
    task_lifecycle_role_resolution_write_admission: 'admitted',
    task_lifecycle_role_resolution_write_count: (existing.task_lifecycle_role_resolution_records ?? []).length + 1,
    role_resolution_authority_admission: 'admitted',
    roster_read_admission: 'admitted',
    roster_mutation_admission: 'not_admitted',
    resolved_assignee_principal_id: assigneePrincipalId,
    resolved_assignee_role: membership.role,
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA,
    status: 'task_lifecycle_role_resolution_written',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_role_resolution_write',
    decision,
    admission_record: admission.record,
    role_resolution: roleResolution,
    task,
  };
}

async function recordCloudflareTaskLifecycleRosterMutationWrite(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const taskId = String(params.task_id ?? '').trim();
  if (!taskId) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_task_id', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const assigneePrincipalId = String(params.assignee_principal_id ?? params.claimant_principal_id ?? principal?.principal_id ?? '').trim();
  if (!assigneePrincipalId) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_assignee_principal', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const rosterMutationAuthorityRef = String(params.roster_mutation_authority_ref ?? '').trim();
  if (!rosterMutationAuthorityRef) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_roster_mutation_authority_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const rosterSchemaRef = String(params.roster_schema_ref ?? '').trim();
  if (!rosterSchemaRef) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_roster_schema_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const rosterEvidenceRef = String(params.roster_evidence_ref ?? '').trim();
  if (!rosterEvidenceRef) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_roster_evidence_ref', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const requestedRole = String(params.membership_role ?? '').trim();
  if (!requestedRole) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_membership_role', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const requestedStatus = String(params.membership_status ?? 'active').trim();
  if (!requestedStatus) return { ok: false, code: 'task_lifecycle_roster_mutation_write_requires_membership_status', schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({
    ...params,
    mutation_class: 'task_roster_mutation_write',
    task_id: taskId,
    assignee_principal_id: assigneePrincipalId,
    roster_mutation_authority_ref: rosterMutationAuthorityRef,
    roster_schema_ref: rosterSchemaRef,
    roster_evidence_ref: rosterEvidenceRef,
    membership_role: requestedRole,
    membership_status: requestedStatus,
  }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, {
    ...params,
    mutation_class: 'task_roster_mutation_write',
    task_id: taskId,
    assignee_principal_id: assigneePrincipalId,
    roster_mutation_authority_ref: rosterMutationAuthorityRef,
    roster_schema_ref: rosterSchemaRef,
    roster_evidence_ref: rosterEvidenceRef,
    membership_role: requestedRole,
    membership_status: requestedStatus,
  }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
      code: 'task_lifecycle_roster_mutation_write_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const existing = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
  if (!existing) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
      code: 'task_lifecycle_task_not_found',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (Number(existing.task_lifecycle_role_resolution_write_count ?? 0) < 1) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
      code: 'task_lifecycle_roster_mutation_write_requires_role_resolution_write',
      site_id: siteId,
      task_id: taskId,
      decision,
      admission_record: admission.record,
    };
  }
  if (existing.resolved_assignee_principal_id && existing.resolved_assignee_principal_id !== assigneePrincipalId) {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
      code: 'task_lifecycle_roster_mutation_principal_mismatch',
      site_id: siteId,
      task_id: taskId,
      assignee_principal_id: assigneePrincipalId,
      resolved_assignee_principal_id: existing.resolved_assignee_principal_id,
      decision,
      admission_record: admission.record,
    };
  }
  const membership = await db.prepare(`
    SELECT role, status
    FROM cloudflare_site_memberships
    WHERE site_id = ? AND principal_id = ?
  `).bind(siteId, assigneePrincipalId).first();
  if (!membership || membership.status !== 'active') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
      code: 'task_lifecycle_roster_mutation_principal_not_active_member',
      site_id: siteId,
      task_id: taskId,
      assignee_principal_id: assigneePrincipalId,
      decision,
      admission_record: admission.record,
    };
  }
  const now = new Date().toISOString();
  const rosterMutationWriteId = params.roster_mutation_write_id ?? `cloudflare-task-lifecycle-roster-mutation-${safeIdToken(taskId)}-${safeIdToken(now)}`;
  await db.prepare(`
    INSERT INTO cloudflare_site_memberships (site_id, principal_id, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(site_id, principal_id) DO UPDATE SET role = excluded.role, status = excluded.status, updated_at = excluded.updated_at
  `).bind(siteId, assigneePrincipalId, requestedRole, requestedStatus, now, now).run();
  const rosterMutation = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
    roster_mutation_write_id: rosterMutationWriteId,
    site_id: siteId,
    task_id: taskId,
    task_number: existing.task_number,
    task_status: existing.status,
    assignee_principal_id: assigneePrincipalId,
    previous_membership_role: membership.role,
    previous_membership_status: membership.status,
    membership_role: requestedRole,
    membership_status: requestedStatus,
    roster_mutation_authority_ref: rosterMutationAuthorityRef,
    roster_schema_ref: rosterSchemaRef,
    roster_evidence_ref: rosterEvidenceRef,
    roster_mutation_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  const task = {
    ...existing,
    task_lifecycle_roster_mutation_records: [...(existing.task_lifecycle_roster_mutation_records ?? []), rosterMutation],
    task_lifecycle_roster_mutation_write_admission: 'admitted',
    task_lifecycle_roster_mutation_write_count: (existing.task_lifecycle_roster_mutation_records ?? []).length + 1,
    roster_mutation_admission: 'admitted',
    mailbox_mutation_admission: 'not_admitted',
    filesystem_mutation_admission: 'not_admitted',
    repository_publication_admission: 'not_admitted',
    updated_at: now,
  };
  await db.prepare(`
    UPDATE cloudflare_task_lifecycle_tasks
    SET status = ?, task_json = ?, updated_at = ?
    WHERE site_id = ? AND task_id = ?
  `).bind(
    task.status,
    JSON.stringify(task),
    task.updated_at,
    siteId,
    taskId,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA,
    status: 'task_lifecycle_roster_mutation_written',
    site_id: siteId,
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    write_effect: 'task_lifecycle_roster_mutation_write',
    decision,
    admission_record: admission.record,
    roster_mutation: rosterMutation,
    task,
  };
}

function parseCloudflareTaskLifecycleStringList(value) {
  if (value == null || value === '') return { ok: true, value: [] };
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === 'string')) return { ok: false, code: 'task_lifecycle_report_string_list_invalid' };
    return { ok: true, value };
  }
  const text = String(value).trim();
  if (!text) return { ok: true, value: [] };
  if (text.startsWith('[')) {
    const parsed = parseJsonArray(text);
    if (!parsed.every((entry) => typeof entry === 'string')) return { ok: false, code: 'task_lifecycle_report_string_list_invalid' };
    return { ok: true, value: parsed };
  }
  return { ok: true, value: text.split(',').map((entry) => entry.trim()).filter(Boolean) };
}

function parseCloudflareTaskLifecycleVerification(value) {
  if (value == null || value === '') return { ok: true, value: [] };
  const parsed = Array.isArray(value) ? value : parseJsonArray(String(value));
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || typeof item.command !== 'string' || typeof item.result !== 'string') {
      return { ok: false, code: 'task_lifecycle_report_verification_invalid' };
    }
  }
  return { ok: true, value: parsed.map((item) => ({ command: String(item.command), result: String(item.result) })) };
}

function summarizeCloudflareSiteContinuityLoopStatus(siteId, loopReports = [], { nowMs = Date.now(), staleAfterMs = DEFAULT_SITE_CONTINUITY_LOOP_STALE_AFTER_MS } = {}) {
  const reports = Array.isArray(loopReports) ? loopReports : [];
  const latestReport = reports[0] ?? null;
  const latestStatus = latestReport?.status ?? null;
  const observedAtMs = Date.parse(latestReport?.generated_at ?? latestReport?.recorded_at ?? '');
  const ageMs = latestReport && Number.isFinite(observedAtMs) ? Math.max(0, nowMs - observedAtMs) : null;
  const freshnessState = !latestReport
    ? 'missing'
    : ageMs == null
      ? 'unknown'
      : latestStatus === 'failed'
        ? 'failed'
        : ageMs > staleAfterMs
          ? 'stale'
          : 'fresh';
  return {
    schema: 'narada.cloudflare_site_continuity_loop_status.v1',
    site_id: siteId,
    state: latestReport ? 'loop_report_observed' : 'no_loop_report_observed',
    freshness_state: freshnessState,
    freshness_reason: `site_continuity_loop_report_${freshnessState}`,
    latest_report_age_ms: ageMs,
    stale_after_ms: staleAfterMs,
    report_count: reports.length,
    latest_report_id: latestReport?.report_id ?? null,
    latest_status: latestStatus,
    latest_generated_at: latestReport?.generated_at ?? null,
    latest_recorded_at: latestReport?.recorded_at ?? null,
    cloudflare_push_status: latestReport?.cloudflare_push_status ?? null,
    windows_packet_count: latestReport?.windows_packet_count ?? 0,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
    next_action: !latestReport
      ? 'run_site_continuity_loop'
      : freshnessState === 'fresh'
        ? 'review_continuity_loop_report'
        : 'refresh_site_continuity_loop',
  };
}

function createSiteContinuityLoopReportId(report = {}) {
  return [
    'site-continuity-loop',
    report.site_id || 'unknown-site',
    report.generated_at || report.recorded_at || 'unknown-time',
  ].map((part) => String(part).replace(/[^A-Za-z0-9_.:-]/g, '_')).join(':');
}

function summarizeSiteContinuityLoopReport(report = {}) {
  return {
    report_id: report.report_id ?? createSiteContinuityLoopReportId(report),
    site_id: report.site_id ?? null,
    status: report.status ?? 'unknown',
    generated_at: report.generated_at ?? null,
    cloudflare_source: report.cloudflare_source ?? null,
    cloudflare_push_status: report.cloudflare_push?.status ?? null,
    windows_packet_count: report.windows_packet_count ?? 0,
    cloudflare_credential_source: report.cloudflare_credential_source ?? null,
    authority_boundary: report.authority_boundary ?? {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
  };
}

async function importCloudflareContinuityLoopReport(env = {}, report, { recorded_by_principal_id = 'unknown-principal' } = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!report || typeof report !== 'object') return { ok: false, code: 'missing_site_continuity_loop_report' };
  if (report.schema !== 'narada.site_continuity_productized_loop.v1') return { ok: false, code: 'unsupported_site_continuity_loop_report_schema' };
  if (!report.site_id) return { ok: false, code: 'site_continuity_loop_report_site_id_missing' };
  await ensureCloudflareContinuityLoopReportSchema(db);
  const recordedAt = new Date().toISOString();
  const summary = summarizeSiteContinuityLoopReport(report);
  await db.prepare(`INSERT INTO cloudflare_site_continuity_loop_reports (
    report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status,
    windows_packet_count, cloudflare_credential_source, report_json, recorded_by_principal_id, recorded_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(report_id) DO UPDATE SET
    status = excluded.status,
    generated_at = excluded.generated_at,
    cloudflare_source = excluded.cloudflare_source,
    cloudflare_push_status = excluded.cloudflare_push_status,
    windows_packet_count = excluded.windows_packet_count,
    cloudflare_credential_source = excluded.cloudflare_credential_source,
    report_json = excluded.report_json,
    recorded_by_principal_id = excluded.recorded_by_principal_id,
    recorded_at = excluded.recorded_at`).bind(
    summary.report_id,
    report.site_id,
    summary.status,
    summary.generated_at,
    summary.cloudflare_source,
    summary.cloudflare_push_status,
    summary.windows_packet_count,
    summary.cloudflare_credential_source,
    JSON.stringify(report),
    recorded_by_principal_id,
    recordedAt,
  ).run();
  return {
    ok: true,
    status: 'recorded',
    report_record: {
      ...summary,
      recorded_by_principal_id,
      recorded_at: recordedAt,
    },
  };
}

function summarizeCloudflareSiteContinuityReconciliationExecutionStatus(siteId, executions = []) {
  const records = Array.isArray(executions) ? executions : [];
  const latest = records[0] ?? null;
  const latestStatus = latest?.status ?? null;
  const failedSiteCount = latest?.failed_site_count ?? 0;
  const needsAttention = Boolean(latest && (latestStatus !== 'completed' || failedSiteCount > 0 || latest?.refusal_reason));
  return {
    schema: 'narada.cloudflare_site_continuity_reconciliation_execution_status.v1',
    site_id: siteId,
    state: latest ? 'reconciliation_execution_observed' : 'no_reconciliation_execution_observed',
    health: !latest ? 'unknown' : needsAttention ? 'attention' : 'ready',
    execution_count: records.length,
    latest_execution_id: latest?.execution_id ?? null,
    latest_status: latestStatus,
    latest_generated_at: latest?.generated_at ?? null,
    latest_persisted_at: latest?.persisted_at ?? null,
    latest_recorded_at: latest?.recorded_at ?? null,
    reconciliation_plan_status: latest?.reconciliation_plan_status ?? null,
    selected_site_count: latest?.selected_site_count ?? 0,
    executed_site_count: latest?.executed_site_count ?? 0,
    completed_site_count: latest?.completed_site_count ?? 0,
    failed_site_count: latest?.failed_site_count ?? 0,
    refusal_reason: latest?.refusal_reason ?? null,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'not_admitted_cloudflare_records_windows_reconciliation_evidence_only',
      durable_mutation_authority: 'cloudflare_records_reconciliation_evidence_windows_executes_sync_once',
    },
    next_action: !latest
      ? 'run_site_continuity_reconciliation'
      : needsAttention
        ? 'review_site_continuity_reconciliation_execution'
        : 'monitor_site_continuity_reconciliation',
  };
}

function createSiteContinuityReconciliationExecutionId(execution = {}, siteId = null) {
  return [
    'site-continuity-reconciliation-execution',
    siteId || execution.site_id || execution.plan?.site_id || 'unknown-site',
    execution.generated_at || execution.persisted_at || 'unknown-time',
    execution.status || 'unknown-status',
  ].map((part) => String(part).replace(/[^A-Za-z0-9_.:-]/g, '_')).join(':');
}

function inferSiteIdForReconciliationExecution(execution = {}, fallbackSiteId = null) {
  if (fallbackSiteId) return fallbackSiteId;
  if (execution.site_id) return execution.site_id;
  if (execution.plan?.site_id) return execution.plan.site_id;
  const resultSites = [...new Set((execution.results ?? []).map((result) => result?.site_id).filter(Boolean))];
  if (resultSites.length === 1) return resultSites[0];
  const selectedSites = [...new Set((execution.plan?.reconciliation_plan?.selected_sites ?? []).map((site) => site?.site_id).filter(Boolean))];
  if (selectedSites.length === 1) return selectedSites[0];
  return null;
}

function summarizeSiteContinuityReconciliationExecution(execution = {}, siteId = null) {
  const effectiveSiteId = inferSiteIdForReconciliationExecution(execution, siteId);
  return {
    execution_id: execution.execution_id ?? createSiteContinuityReconciliationExecutionId(execution, effectiveSiteId),
    site_id: effectiveSiteId,
    status: execution.status ?? 'unknown',
    generated_at: execution.generated_at ?? null,
    persisted_at: execution.persisted_at ?? null,
    reconciliation_plan_status: execution.reconciliation_plan_status ?? null,
    selected_site_count: execution.selected_site_count ?? 0,
    executed_site_count: execution.executed_site_count ?? 0,
    completed_site_count: execution.completed_site_count ?? 0,
    failed_site_count: execution.failed_site_count ?? 0,
    refusal_reason: execution.refusal_reason ?? null,
  };
}

async function importCloudflareContinuityReconciliationExecution(env = {}, execution, { site_id = null, recorded_by_principal_id = 'unknown-principal' } = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!execution || typeof execution !== 'object') return { ok: false, code: 'missing_site_continuity_reconciliation_execution' };
  if (execution.schema !== 'narada.cloudflare_carrier.site_continuity_reconciliation_execution.v1') return { ok: false, code: 'unsupported_site_continuity_reconciliation_execution_schema' };
  const summary = summarizeSiteContinuityReconciliationExecution(execution, site_id);
  if (!summary.site_id) return { ok: false, code: 'site_continuity_reconciliation_execution_site_id_missing' };
  await ensureCloudflareContinuityReconciliationExecutionSchema(db);
  const recordedAt = new Date().toISOString();
  await db.prepare(`INSERT INTO cloudflare_site_continuity_reconciliation_executions (
    execution_id, site_id, status, generated_at, persisted_at, reconciliation_plan_status,
    selected_site_count, executed_site_count, completed_site_count, failed_site_count,
    refusal_reason, execution_json, recorded_by_principal_id, recorded_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(execution_id) DO UPDATE SET
    status = excluded.status,
    generated_at = excluded.generated_at,
    persisted_at = excluded.persisted_at,
    reconciliation_plan_status = excluded.reconciliation_plan_status,
    selected_site_count = excluded.selected_site_count,
    executed_site_count = excluded.executed_site_count,
    completed_site_count = excluded.completed_site_count,
    failed_site_count = excluded.failed_site_count,
    refusal_reason = excluded.refusal_reason,
    execution_json = excluded.execution_json,
    recorded_by_principal_id = excluded.recorded_by_principal_id,
    recorded_at = excluded.recorded_at`).bind(
    summary.execution_id,
    summary.site_id,
    summary.status,
    summary.generated_at,
    summary.persisted_at,
    summary.reconciliation_plan_status,
    summary.selected_site_count,
    summary.executed_site_count,
    summary.completed_site_count,
    summary.failed_site_count,
    summary.refusal_reason,
    JSON.stringify(execution),
    recorded_by_principal_id,
    recordedAt,
  ).run();
  return {
    ok: true,
    status: 'recorded',
    execution_record: {
      ...summary,
      recorded_by_principal_id,
      recorded_at: recordedAt,
    },
  };
}

function continuityBindingEmbodiment(binding = {}, embodimentKind) {
  return (binding.embodiments || []).find((embodiment) => embodiment.embodiment_kind === embodimentKind) ?? {};
}

function isDefaultContinuityBridgeRef(value) {
  return ['local-windows-site', 'cloudflare-site', 'site-authority-map:v1'].includes(String(value ?? ''));
}

function continuityBridgeRefQuality(binding = {}) {
  binding = binding ?? {};
  const localWindowsEmbodiment = continuityBindingEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
  const cloudflareEmbodiment = continuityBindingEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
  const refs = [
    binding.local_windows_site_ref ?? localWindowsEmbodiment.site_ref,
    binding.cloudflare_site_ref ?? cloudflareEmbodiment.site_ref,
    binding.authority_map_ref,
  ].filter((ref) => ref != null && ref !== '');
  return refs.filter((ref) => !isDefaultContinuityBridgeRef(ref)).length;
}

function observedContinuityPacketBinding(continuityPackets = []) {
  const packetBindings = (Array.isArray(continuityPackets) ? continuityPackets : [])
    .map((record) => record?.packet?.binding)
    .filter(Boolean);
  return packetBindings.find((binding) => continuityBridgeRefQuality(binding) > 0) ?? packetBindings[0] ?? null;
}

function summarizeLocalCloudContinuityBridge(siteId, continuityPackets = [], siteContinuity = null, continuityStatus = null) {
  const observedBinding = observedContinuityPacketBinding(continuityPackets);
  const fallbackBinding = siteContinuity?.binding ?? {};
  const binding = continuityBridgeRefQuality(observedBinding) >= continuityBridgeRefQuality(fallbackBinding) ? (observedBinding ?? fallbackBinding) : fallbackBinding;
  const localWindowsEmbodiment = continuityBindingEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS);
  const cloudflareEmbodiment = continuityBindingEmbodiment(binding, SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER);
  const directionCounts = continuityStatus?.direction_counts ?? {};
  const authorityBoundary = continuityStatus?.authority_boundary ?? {};
  const cloudflareToLocalWindowsPackets = directionCounts.cloudflare_to_local_windows ?? 0;
  const localWindowsToCloudflarePackets = directionCounts.local_windows_to_cloudflare ?? 0;
  const bridgeState = cloudflareToLocalWindowsPackets > 0 && localWindowsToCloudflarePackets > 0
    ? 'bidirectional_packets_observed'
    : cloudflareToLocalWindowsPackets > 0
      ? 'cloudflare_to_local_windows_observed'
      : localWindowsToCloudflarePackets > 0
        ? 'local_windows_to_cloudflare_observed'
        : 'no_packet_observed';
  const bridgeNextAction = bridgeState === 'bidirectional_packets_observed'
    ? 'review_continuity_packet'
    : bridgeState === 'cloudflare_to_local_windows_observed'
      ? 'return_local_windows_continuity_packet'
      : bridgeState === 'local_windows_to_cloudflare_observed'
        ? 'publish_cloudflare_continuity_packet'
        : 'observe_continuity_packet';
  const siteArg = siteId ? String(siteId) : '<site_id>';
  const loopCommand = `pnpm site:continuity:loop -- sync-cloudflare --site ${siteArg} --url <worker-url> --token-file <token-file>`;
  const syncCommands = {
    loop_command: loopCommand,
    refresh_command: loopCommand,
    pull_command: `pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- pull-cloudflare --site ${siteArg} --url <worker-url> --token-file <token-file>`,
    push_command: `pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- push-cloudflare --site ${siteArg} --url <worker-url> --token-file <token-file> < packet.json`,
    read_command: `pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare -- read-cloudflare --site ${siteArg} --url <worker-url> --token-file <token-file>`,
  };
  return {
    schema: 'narada.local_cloud_continuity_bridge.v1',
    site_id: siteId,
    state: bridgeState,
    local_windows_site_ref: binding.local_windows_site_ref ?? localWindowsEmbodiment.site_ref ?? null,
    cloudflare_site_ref: binding.cloudflare_site_ref ?? cloudflareEmbodiment.site_ref ?? null,
    authority_map_ref: binding.authority_map_ref ?? null,
    expected_exchange_packet_id: continuityStatus?.expected_exchange_packet_id ?? siteContinuity?.exchange_packet?.packet_id ?? null,
    latest_packet_id: continuityStatus?.latest_packet_id ?? continuityPackets?.[0]?.packet_id ?? null,
    latest_imported_at: continuityStatus?.latest_imported_at ?? continuityPackets?.[0]?.imported_at ?? null,
    latest_admission_action: continuityStatus?.latest_admission_action ?? continuityPackets?.[0]?.admission_action ?? null,
    latest_admission_reason: continuityStatus?.latest_admission_reason ?? continuityPackets?.[0]?.admission_reason ?? null,
    cloudflare_to_local_windows_packets: cloudflareToLocalWindowsPackets,
    local_windows_to_cloudflare_packets: localWindowsToCloudflarePackets,
    continuity_packet_count: continuityStatus?.packet_count ?? (Array.isArray(continuityPackets) ? continuityPackets.length : 0),
    executable_cross_embodiment_mutation: authorityBoundary.executable_cross_embodiment_mutation ?? 'refused_by_site_continuity_classifier',
    durable_mutation_authority: authorityBoundary.durable_mutation_authority ?? 'unchanged; routed_by_site_authority_map',
    next_action: bridgeNextAction,
    ...syncCommands,
  };
}

function summarizeCloudflareSiteProductOverview(siteProductStatuses = [], siteProductProjections = []) {
  const statuses = Array.isArray(siteProductStatuses) ? siteProductStatuses : [];
  const projections = Array.isArray(siteProductProjections) ? siteProductProjections : [];
  const healthCounts = { ready: 0, attention: 0, incomplete: 0, other: 0 };
  const actionCounts = {};
  const missingCounts = {};
  const attentionCounts = {};
  for (const status of statuses) {
    if (status?.health === 'ready') healthCounts.ready += 1;
    else if (status?.health === 'attention') healthCounts.attention += 1;
    else if (status?.health === 'incomplete') healthCounts.incomplete += 1;
    else healthCounts.other += 1;
    const action = status?.next_action || 'monitor_site';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    for (const missing of status?.missing || []) missingCounts[missing] = (missingCounts[missing] || 0) + 1;
    for (const attention of status?.attention || []) attentionCounts[attention] = (attentionCounts[attention] || 0) + 1;
  }
  const firstActionable = statuses.find((status) => status?.next_action && status.next_action !== 'monitor_site');
  const actionableProjection = firstActionable
    ? projections.find((projection) => (
      projection?.site?.site_id
      ?? projection?.site_id
      ?? projection?.site_product_status?.site_id
    ) === firstActionable.site_id)
    : null;
  const actionableWorkflowRoute = actionableProjection?.focused_operation_lifecycle?.workflow_route ?? null;
  const actionableOperationId = actionableProjection?.focused_operation_lifecycle?.operation_id ?? null;
  const actionableLifecycleStatus = actionableProjection?.focused_operation_lifecycle?.lifecycle_status ?? null;
  const actionableSessionRecord = actionableOperationId && Array.isArray(actionableProjection?.sessions)
    ? actionableProjection.sessions.find((item) => item?.operation_id === actionableOperationId) ?? actionableProjection.sessions[0] ?? null
    : null;
  const actionableFocusRef = actionableWorkflowRoute?.focus_ref ?? actionableWorkflowRoute?.target ?? null;
  const actionableFocusKind = actionableWorkflowRoute?.focus_kind
    ?? (actionableWorkflowRoute?.next_action === 'review_site_continuity_reconciliation_execution' && actionableFocusRef
      ? 'site_continuity_reconciliation_execution'
      : null);
  const nextReason = firstActionable
    ? (firstActionable.missing || [])[0] || (firstActionable.attention || [])[0] || firstActionable.next_action || 'inspect_site'
    : 'all_sites_monitoring';
  return {
    schema: 'narada.cloudflare_site_product_overview.v1',
    site_count: statuses.length,
    health_counts: healthCounts,
    action_counts: actionCounts,
    missing_counts: missingCounts,
    attention_counts: attentionCounts,
    next_site_id: firstActionable?.site_id ?? null,
    next_health: firstActionable?.health ?? 'ready',
    next_action: actionableOperationId ? 'focus_next_operation' : firstActionable?.next_action ?? 'monitor_sites',
    next_reason: nextReason,
    next_operation_id: actionableProjection?.focused_operation_lifecycle?.operation_id ?? null,
    next_operation_next_action: actionableWorkflowRoute?.next_action ?? null,
    next_operation_reason: actionableWorkflowRoute?.reason ?? null,
    next_operation_active_session_id: actionableSessionRecord?.carrier_session_id ?? actionableSessionRecord?.session_id ?? null,
    next_operation_local_ingress_request_count: actionableLifecycleStatus?.local_ingress_request_count ?? 0,
    next_operation_local_ingress_evidence_count: actionableLifecycleStatus?.local_ingress_evidence_count ?? 0,
    next_operation_local_ingress_provider_heartbeat_count: actionableLifecycleStatus?.local_ingress_provider_heartbeat_count ?? 0,
    next_operation_repository_publication_request_count: actionableLifecycleStatus?.repository_publication_request_count ?? 0,
    next_operation_repository_publication_execution_count: actionableLifecycleStatus?.repository_publication_execution_count ?? 0,
    next_operation_repository_publication_evidence_count: actionableLifecycleStatus?.repository_publication_evidence_count ?? 0,
    next_operation_repository_publication_provider_heartbeat_count: actionableLifecycleStatus?.repository_publication_provider_heartbeat_count ?? 0,
    next_operation_focus_kind: actionableFocusKind,
    next_operation_focus_ref: actionableFocusRef,
  };
}

function summarizeCloudflareOperationPostureOverview(operations = [], product = {}, context = {}) {
  const items = cloudflareOperationWorkQueueItems(operations, product, context);
  const healthCounts = { ready: 0, needs_attention: 0 };
  const actionCounts = {};
  const reasonCounts = {};
  const commandStateCounts = {};
  for (const item of items) {
    healthCounts[item.status] = (healthCounts[item.status] || 0) + 1;
    const action = item.command?.next_action || 'inspect_operation';
    const reason = cloudflareOperationPostureReason(item);
    const commandState = item.command?.command_state || 'not_classified';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    commandStateCounts[commandState] = (commandStateCounts[commandState] || 0) + 1;
  }
  const activeOperationId = context.active_operation_id || product.operation?.operation_id || '';
  const next = items.find((item) => item.status === 'needs_attention')
    || items.find((item) => item.operation.operation_id === activeOperationId)
    || items[0]
    || null;
  const focusedWorkflowRoute = product.focused_operation_lifecycle?.workflow_route ?? product.operation_workflow_route ?? null;
  const focusedOperationId = product.focused_operation_lifecycle?.operation_id ?? product.operation?.operation_id ?? null;
  const nextWorkflowRoute = next?.operation?.operation_id && next.operation.operation_id === focusedOperationId
    ? focusedWorkflowRoute
    : null;
  const continuityReviewFocusRef = next?.operation?.operation_id && next.operation.operation_id === focusedOperationId
    ? product.focused_operation_lifecycle?.lifecycle_status?.site_continuity_reconciliation_execution_status?.latest_execution_id ?? null
    : null;
  const nextFocusRef = next?.command?.focus_ref
    ?? nextWorkflowRoute?.focus_ref
    ?? next?.command?.target
    ?? nextWorkflowRoute?.target
    ?? (next?.command?.next_action === 'review_site_continuity_reconciliation_execution' ? continuityReviewFocusRef : null)
    ?? null;
  const nextFocusKind = next?.command?.focus_kind
    ?? nextWorkflowRoute?.focus_kind
    ?? (next?.command?.next_action === 'review_site_continuity_reconciliation_execution' && nextFocusRef
      ? 'site_continuity_reconciliation_execution'
      : null);
  const route = product.operation_posture_route || null;
  const focusedLifecycle = product.focused_operation_lifecycle?.lifecycle_status || null;
  if (
    items.length > 0
    && route?.next_action === 'monitor_operations'
    && route?.reason === 'all_operations_monitoring'
    && focusedLifecycle?.health === 'ready'
  ) {
    return {
      schema: 'narada.cloudflare_operation_posture_overview.v1',
      operation_count: items.length,
      health_counts: { ready: items.length, needs_attention: 0 },
      action_counts: { monitor_operations: items.length },
      reason_counts: { all_operations_monitoring: items.length },
      command_state_counts: { operation_posture_ready: items.length },
      active_operation_id: activeOperationId || null,
      next_operation_id: next?.operation?.operation_id || null,
      next_status: 'ready',
      next_action: 'monitor_operations',
      next_reason: 'all_operations_monitoring',
      next_focus_kind: null,
      next_focus_ref: null,
    };
  }
  return {
    schema: 'narada.cloudflare_operation_posture_overview.v1',
    operation_count: items.length,
    health_counts: healthCounts,
    action_counts: actionCounts,
    reason_counts: reasonCounts,
    command_state_counts: commandStateCounts,
    active_operation_id: activeOperationId || null,
    next_operation_id: next?.operation?.operation_id || null,
    next_status: next?.status || 'ready',
    next_action: next?.command?.next_action || 'monitor_operations',
    next_reason: next ? cloudflareOperationPostureReason(next) : 'all_operations_monitoring',
    next_focus_kind: nextFocusKind,
    next_focus_ref: nextFocusRef,
  };
}

function summarizeCloudflareSitePostureRoute(overview = {}, focusedSiteId = '') {
  const nextSiteId = overview.next_site_id || '';
  const nextAction = overview.next_action || 'monitor_sites';
  const changesFocus = nextSiteId && nextSiteId !== focusedSiteId;
  const needsAttention = Boolean(
    overview.site_count > 0
    && nextAction
    && nextAction !== 'monitor_sites'
    && changesFocus,
  );
  return {
    schema: 'narada.cloudflare_site_posture_route.v1',
    domain: 'site_posture',
    command_state: needsAttention ? 'site_posture_attention' : 'site_posture_ready',
    command_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
    next_action: needsAttention ? 'focus_next_site' : 'monitor_sites',
    target: nextSiteId || 'none',
    status: needsAttention ? 'needs_attention' : 'ready',
    reason: overview.next_reason || 'all_sites_monitoring',
  };
}

function summarizeCloudflareOperationPostureRoute(overview = {}, activeOperationId = '') {
  const nextOperationId = overview.next_operation_id || '';
  const changesFocus = nextOperationId && nextOperationId !== activeOperationId;
  const needsAttention = Boolean(overview.operation_count > 0 && overview.next_status !== 'ready' && changesFocus);
  return {
    schema: 'narada.cloudflare_operation_posture_route.v1',
    domain: 'operation_posture',
    command_state: needsAttention ? 'operation_posture_attention' : 'operation_posture_ready',
    command_action: needsAttention ? 'focus_next_operation' : 'monitor_operations',
    next_action: needsAttention ? 'focus_next_operation' : 'monitor_operations',
    target: nextOperationId || 'none',
    status: needsAttention ? 'needs_attention' : 'ready',
    reason: overview.next_reason || 'all_operations_monitoring',
  };
}

export function summarizeCloudflareOperationWorkflowRoute({
  operation = null,
  lifecycleStatus = null,
  operationContinuityDirectionStatus = null,
  localCloudContinuityBridge = null,
  persistencePosture = null,
  recoveryPosture = null,
  operationActivityTimeline = null,
  webhookDelayDirectiveRecords = [],
  webhookDelayDirectiveDeliveries = [],
  residentDispatchDecisions = [],
  residentDispatchWindowsFallbackRequests = [],
  residentDispatchWindowsFallbackEvidence = [],
  mailboxSendReviews = [],
  operationFocusReviews = [],
  tasks = [],
} = {}) {
  const operationId = operation?.operation_id ?? lifecycleStatus?.operation_id ?? persistencePosture?.operation_id ?? recoveryPosture?.operation_id ?? null;
  const siteId = operation?.site_id ?? lifecycleStatus?.site_id ?? persistencePosture?.site_id ?? recoveryPosture?.site_id ?? null;
  const openTasks = (Array.isArray(tasks) ? tasks : []).filter((task) => !['done', 'closed', 'cancelled', 'resolved'].includes(String(task.status ?? '').toLowerCase()));
  const directiveRecords = Array.isArray(webhookDelayDirectiveRecords) ? webhookDelayDirectiveRecords : [];
  const directiveDeliveries = Array.isArray(webhookDelayDirectiveDeliveries) ? webhookDelayDirectiveDeliveries : [];
  const dispatchDecisions = Array.isArray(residentDispatchDecisions) ? residentDispatchDecisions : [];
  const fallbackRequests = Array.isArray(residentDispatchWindowsFallbackRequests) ? residentDispatchWindowsFallbackRequests : [];
  const fallbackEvidence = Array.isArray(residentDispatchWindowsFallbackEvidence) ? residentDispatchWindowsFallbackEvidence : [];
  const operationStatus = String(operation?.status ?? '').toLowerCase();
  const suppressClosedContinuityAttention = operationStatus === 'closed';
  const operatorFocus = summarizeCloudflareOperationOperatorFocus(operationActivityTimeline, { mailboxSendReviews, operationFocusReviews });
  const reviewedOperationFocusKeys = cloudflareReviewedOperationFocusKeys(operationFocusReviews);
  const continuityDirectionStatus = operationContinuityDirectionStatus ?? lifecycleStatus?.operation_continuity_direction_status ?? null;
  const latestDispatchDecision = dispatchDecisions.find((decision) => {
    if (!decision) return false;
    if (operationId && decision.operation_id) return decision.operation_id === operationId;
    return true;
  }) ?? null;
  const latestFallbackRequest = fallbackRequests.find((request) => {
    if (!request) return false;
    if (latestDispatchDecision?.dispatch_decision_id) return request.dispatch_decision_id === latestDispatchDecision.dispatch_decision_id;
    if (operationId && request.operation_id) return request.operation_id === operationId;
    return true;
  }) ?? null;
  const latestFallbackEvidence = fallbackEvidence.find((entry) => {
    if (!entry) return false;
    if (latestFallbackRequest?.fallback_request_id) return entry.fallback_request_id === latestFallbackRequest.fallback_request_id;
    if (latestDispatchDecision?.dispatch_decision_id) return entry.dispatch_decision_id === latestDispatchDecision.dispatch_decision_id;
    if (operationId && entry.operation_id) return entry.operation_id === operationId;
    return true;
  }) ?? null;
  const next = (() => {
    if (!operationId) return { action: 'select_operation', target: siteId ?? 'none', reason: 'operation_not_loaded' };
    if (lifecycleStatus?.next_action === 'resume_operation_continuation') {
      return { action: 'resume_operation_continuation', target: operationId, reason: 'operation_lifecycle_needs_continuation' };
    }
    if (lifecycleStatus?.next_action === 'session') {
      if (latestDispatchDecision?.decision_state === 'cloudflare_primary_failed_windows_fallback_available') {
        if (!latestFallbackRequest) {
          return {
            action: 'request_windows_fallback_resident_dispatch',
            target: latestDispatchDecision.dispatch_decision_id ?? operationId,
            reason: 'windows_fallback_request_not_recorded',
            focus_kind: 'resident_dispatch_windows_fallback_request',
            focus_ref: latestDispatchDecision.dispatch_decision_id ?? null,
          };
        }
        if (!latestFallbackEvidence) {
          return {
            action: 'await_windows_fallback_resident_dispatch',
            target: latestFallbackRequest.fallback_request_id ?? operationId,
            reason: 'windows_fallback_request_pending_execution',
            focus_kind: 'resident_dispatch_windows_fallback_request',
            focus_ref: latestFallbackRequest.fallback_request_id ?? null,
          };
        }
        const fallbackEvidenceFocusRef = latestFallbackEvidence.fallback_evidence_id ?? null;
        const fallbackEvidenceReviewKey = fallbackEvidenceFocusRef ? `resident_dispatch_windows_fallback_evidence:${fallbackEvidenceFocusRef}` : null;
        if (!fallbackEvidenceReviewKey || !reviewedOperationFocusKeys.has(fallbackEvidenceReviewKey)) {
          return {
            action: 'review_windows_fallback_resident_dispatch_evidence',
            target: latestFallbackEvidence.fallback_evidence_id ?? latestFallbackRequest.fallback_request_id ?? operationId,
            reason: 'windows_fallback_execution_recorded',
            focus_kind: 'resident_dispatch_windows_fallback_evidence',
            focus_ref: fallbackEvidenceFocusRef,
          };
        }
        return { action: 'start_or_select_session', target: operationId, reason: 'operation_lifecycle_missing_session' };
      }
      return { action: 'start_or_select_session', target: operationId, reason: 'operation_lifecycle_missing_session' };
    }
    if (persistencePosture?.state && persistencePosture.state !== 'durable') {
      return { action: 'review_persistence_posture', target: persistencePosture.next_action || operationId, reason: 'persistence_posture_needs_attention' };
    }
    if (Array.isArray(recoveryPosture?.recovery_gaps) && recoveryPosture.recovery_gaps.length > 0) {
      return { action: 'review_recovery_posture', target: recoveryPosture.next_action || operationId, reason: 'recovery_posture_needs_attention' };
    }
    if (lifecycleStatus?.next_action === 'carrier_evidence') return { action: 'read_operation_evidence', target: operationId, reason: 'operation_lifecycle_missing_carrier_evidence' };
    if (lifecycleStatus?.next_action === 'local_resident_carrier_evidence') {
      return { action: 'bridge_local_resident_carrier_evidence', target: operationId, reason: 'operation_lifecycle_missing_local_resident_carrier_evidence' };
    }
    if (!suppressClosedContinuityAttention && lifecycleStatus?.next_action === 'continuity_packet') return { action: 'review_continuity_packet', target: siteId ?? operationId, reason: 'operation_lifecycle_missing_continuity_packet' };
    if (!suppressClosedContinuityAttention && continuityDirectionStatus?.state && continuityDirectionStatus.state !== 'bidirectional_packets_observed') {
      return {
        action: continuityDirectionStatus.next_action || 'observe_continuity_packet',
        target: siteId ?? operationId,
        reason: 'operation_continuity_direction_needs_attention',
      };
    }
    if (!suppressClosedContinuityAttention && lifecycleStatus?.next_action === 'continuity_loop_report') return { action: 'review_continuity_loop_report', target: siteId ?? operationId, reason: 'operation_lifecycle_missing_continuity_loop_report' };
    if (!suppressClosedContinuityAttention && lifecycleStatus?.next_action === 'refresh_site_continuity_loop') return { action: 'refresh_site_continuity_loop', target: siteId ?? operationId, reason: 'operation_lifecycle_continuity_loop_stale' };
    if (!suppressClosedContinuityAttention && lifecycleStatus?.next_action === 'continuity_reconciliation_execution') {
      const reconciliationFocusRef = lifecycleStatus?.site_continuity_reconciliation_execution_status?.latest_execution_id ?? null;
      const reconciliationReviewKey = reconciliationFocusRef ? `site_continuity_reconciliation_execution:${reconciliationFocusRef}` : null;
      if (!reconciliationReviewKey || !reviewedOperationFocusKeys.has(reconciliationReviewKey)) {
        return {
          action: 'review_site_continuity_reconciliation_execution',
          target: reconciliationFocusRef ?? siteId ?? operationId,
          reason: 'operation_lifecycle_continuity_reconciliation_execution_attention',
          focus_kind: 'site_continuity_reconciliation_execution',
          focus_ref: reconciliationFocusRef,
        };
      }
    }
    if (lifecycleStatus?.next_action === 'carrier_evidence_read_degraded') return { action: 'review_carrier_evidence_replay', target: operationId, reason: 'carrier_evidence_read_degraded' };
    if (lifecycleStatus?.next_action === 'local_ingress_provider_liveness_missing') return { action: 'review_local_ingress_provider_liveness', target: siteId ?? operationId, reason: 'local_ingress_provider_liveness_missing' };
    if (lifecycleStatus?.next_action === 'local_ingress_provider_liveness_stale') return { action: 'review_local_ingress_provider_liveness', target: siteId ?? operationId, reason: 'local_ingress_provider_liveness_stale' };
    if (lifecycleStatus?.next_action === 'repository_publication_provider_liveness_missing') return { action: 'review_repository_publication_provider_liveness', target: siteId ?? operationId, reason: 'repository_publication_provider_liveness_missing' };
    if (lifecycleStatus?.next_action === 'repository_publication_provider_liveness_stale') return { action: 'review_repository_publication_provider_liveness', target: siteId ?? operationId, reason: 'repository_publication_provider_liveness_stale' };
    if (lifecycleStatus?.next_action === 'undelivered_directives' || directiveRecords.length > directiveDeliveries.length) {
      return { action: 'review_directive_delivery', target: directiveRecords[0]?.directive_record_id ?? operationId, reason: 'undelivered_directives' };
    }
    if (lifecycleStatus?.next_action === 'open_tasks' || openTasks.length > 0) {
      return { action: 'focus_open_task', target: openTasks[0]?.task_id ?? operationId, reason: 'open_tasks' };
    }
    if (dispatchDecisions.length === 0 && operation?.status === 'active') {
      return { action: 'start_resident_dispatch', target: operationId, reason: 'resident_dispatch_not_recorded' };
    }
    return { action: 'monitor_operation', target: operationId, reason: 'operation_ready' };
  })();
  const routedNext = operatorFocus && shouldPromoteOperationOperatorFocus(operation, next)
    ? {
        action: operatorFocus.action || 'review_operation_operator_focus',
        target: operatorFocus.focus_ref || operatorFocus.source_ref || operatorFocus.activity_id || operationId,
        reason: 'operation_operator_focus_needs_review',
        focus_kind: operatorFocus.focus_kind || operatorFocus.activity_kind || null,
        focus_ref: operatorFocus.focus_ref || operatorFocus.source_ref || operatorFocus.activity_id || null,
      }
    : next;
  const ready = routedNext.action === 'monitor_operation';
  const actionCommand = routedNext.action === 'refresh_site_continuity_loop'
    ? localCloudContinuityBridge?.refresh_command || localCloudContinuityBridge?.loop_command || null
    : null;
  const actionCommandKind = actionCommand ? 'site_continuity_loop_refresh' : null;
  return {
    schema: 'narada.cloudflare_operation_workflow_route.v1',
    domain: 'operation_workflow',
    site_id: siteId,
    operation_id: operationId,
    command_state: ready ? 'operation_workflow_ready' : 'operation_workflow_attention',
    command_action: routedNext.action,
    next_action: routedNext.action,
    target: routedNext.target,
    ...(routedNext.focus_kind ? { focus_kind: routedNext.focus_kind } : {}),
    ...(routedNext.focus_ref ? { focus_ref: routedNext.focus_ref } : {}),
    status: ready ? 'ready' : 'needs_attention',
    reason: routedNext.reason,
    lifecycle_next_action: lifecycleStatus?.next_action ?? 'unknown',
    continuity_direction_state: continuityDirectionStatus?.state ?? 'unknown',
    continuity_direction_missing: continuityDirectionStatus?.missing_directions ?? [],
    ...(actionCommand ? { action_command: actionCommand, action_command_kind: actionCommandKind } : {}),
    operator_focus: operatorFocus,
  };
}

function cloudflareReviewedMailboxSendFocusKeys(mailboxSendReviews = []) {
  const reviewed = new Set();
  for (const review of Array.isArray(mailboxSendReviews) ? mailboxSendReviews : []) {
    if (review?.review_status !== 'acknowledged') continue;
    if (review.focus_kind && review.focus_ref) reviewed.add(`${review.focus_kind}:${review.focus_ref}`);
    if (review.focus_kind === 'mailbox_send_confirmation' && review.send_accepted_id) {
      reviewed.add(`mailbox_send_accepted:${review.send_accepted_id}`);
    }
  }
  return reviewed;
}

function cloudflareReviewedOperationFocusKeys(operationFocusReviews = []) {
  const reviewed = new Set();
  for (const review of Array.isArray(operationFocusReviews) ? operationFocusReviews : []) {
    if (review?.review_status !== 'acknowledged') continue;
    if (review.focus_kind && review.focus_ref) reviewed.add(`${review.focus_kind}:${review.focus_ref}`);
  }
  return reviewed;
}

export function summarizeCloudflareOperationOperatorFocus(operationActivityTimeline = null, options = {}) {
  const items = Array.isArray(operationActivityTimeline?.items) ? operationActivityTimeline.items : [];
  const reviewedMailboxSendFocusKeys = cloudflareReviewedMailboxSendFocusKeys(options.mailboxSendReviews);
  const reviewedOperationFocusKeys = cloudflareReviewedOperationFocusKeys(options.operationFocusReviews);
  const latestOnlyActivityKinds = new Set([
    'site_continuity_reconciliation_execution',
  ]);
  const priorities = [
    ['mailbox_send_confirmation', 'review_mailbox_send_confirmation'],
    ['mailbox_send_accepted', 'review_mailbox_send_acceptance'],
    ['mailbox_outlook_draft_create', 'review_mailbox_outlook_draft_create'],
    ['mailbox_draft_reply_proposal', 'review_mailbox_draft_reply_proposal'],
    ['local_ingress_request', 'review_local_ingress_request'],
    ['repository_publication_request', 'review_repository_publication_request'],
    ['site_file_change_proposal', 'review_site_file_change_proposal'],
    ['site_continuity_reconciliation_execution', 'review_site_continuity_reconciliation_execution'],
    ['resident_dispatch_windows_fallback_evidence', 'review_windows_fallback_resident_dispatch_evidence'],
  ];
  for (const [activityKind, action] of priorities) {
    const matchingItems = items.filter((entry) => entry?.activity_kind === activityKind);
    if (latestOnlyActivityKinds.has(activityKind)) {
      const item = matchingItems[0] ?? null;
      if (!item) continue;
      const focusKind = item.focus_kind ?? item.activity_kind;
      const focusRef = item.focus_ref ?? item.source_ref ?? item.activity_id ?? null;
      if (focusRef && reviewedMailboxSendFocusKeys.has(`${focusKind}:${focusRef}`)) continue;
      if (focusRef && reviewedOperationFocusKeys.has(`${focusKind}:${focusRef}`)) continue;
      return {
        schema: 'narada.cloudflare_operation_operator_focus.v1',
        action,
        activity_kind: item.activity_kind,
        activity_id: item.activity_id ?? null,
        focus_kind: focusKind,
        focus_ref: focusRef,
        source_ref: item.source_ref ?? null,
        occurred_at: item.occurred_at ?? null,
        title: item.title ?? null,
        summary: item.summary ?? null,
      };
    }
    const item = matchingItems.find((entry) => {
      const focusKind = entry.focus_kind ?? entry.activity_kind;
      const focusRef = entry.focus_ref ?? entry.source_ref ?? entry.activity_id ?? null;
      if (focusRef && reviewedMailboxSendFocusKeys.has(`${focusKind}:${focusRef}`)) return false;
      if (focusRef && reviewedOperationFocusKeys.has(`${focusKind}:${focusRef}`)) return false;
      return true;
    });
    if (item) {
      return {
        schema: 'narada.cloudflare_operation_operator_focus.v1',
        action,
        activity_kind: item.activity_kind,
        activity_id: item.activity_id ?? null,
        focus_kind: item.focus_kind ?? item.activity_kind,
        focus_ref: item.focus_ref ?? item.source_ref ?? item.activity_id ?? null,
        source_ref: item.source_ref ?? null,
        occurred_at: item.occurred_at ?? null,
        title: item.title ?? null,
        summary: item.summary ?? null,
      };
    }
  }
  return null;
}

function cloudflareOperationWorkQueueItems(operations = [], product = {}, context = {}) {
  const activeOperationId = context.active_operation_id || product.operation?.operation_id || '';
  return (Array.isArray(operations) ? operations : []).map((operation) => {
    const path = cloudflareOperationPathContext(operation, product, context);
    const scopeLoaded = cloudflareOperationScopeLoaded(operation, product, context);
    const command = classifyCloudflareOperationCommandState({
      operation_id: operation.operation_id || '',
      is_active: operation.operation_id === activeOperationId,
      scope_loaded: scopeLoaded,
      session_count: path.session_count,
      session_inhabitance_count: path.session_inhabitance_count,
      evidence_loaded: path.evidence_event_count > 0,
      operation_path_next_action: path.next_action || 'read_operation_scope',
    });
    const ready = command.command_state === 'evidence_ready'
      || command.next_action === 'inspect_operation_evidence'
      || (
        command.next_action === 'use_focused_operation'
        && ['inspect_operation_evidence', 'monitor_operation'].includes(command.command_action)
      );
    return { operation, command, path, status: ready ? 'ready' : 'needs_attention' };
  }).sort((left, right) => {
    if (left.status !== right.status) return left.status === 'needs_attention' ? -1 : 1;
    if (left.operation.operation_id === activeOperationId) return -1;
    if (right.operation.operation_id === activeOperationId) return 1;
    return String(right.operation.updated_at || '').localeCompare(String(left.operation.updated_at || ''));
  });
}

export function selectCloudflareFocusedOperation(operations = [], params = {}, response = {}) {
  const requestedOperationId = String(params.operation_id ?? '').trim();
  const candidates = Array.isArray(operations) ? operations : [];
  if (requestedOperationId) {
    const requested = candidates.find((operation) => operation.operation_id === requestedOperationId);
    if (requested) return requested;
  }
  return candidates.find((operation) => operation.status === 'active')
    ?? candidates[0]
    ?? response.operation
    ?? null;
}

function cloudflareOperationPathContext(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.active_operation_id || product.operation?.operation_id || '';
  const sessions = cloudflareOperationSessions(operationId, product);
  const localResidentSessionInhabitanceCount = cloudflareOperationLocalResidentSessionInhabitanceCount(operationId, {
    resident_dispatch_windows_fallback_evidence: product.resident_dispatch_windows_fallback_evidence,
  });
  const effectiveSessionCount = sessions.length > 0 ? sessions.length : localResidentSessionInhabitanceCount;
  const tasks = cloudflareOperationTasks(operation, product, context);
  const events = cloudflareOperationEvents(operation, product);
  const attention = cloudflareOperationAttention(product).filter((item) => !item.operation_id || item.operation_id === operationId);
  const openTasks = tasks.filter((task) => cloudflareTaskLifecycleStatus(task) === 'open');
  const openAttention = attention.filter((item) => item.status !== 'resolved');
  const nextAction = !operationId ? 'select_or_create_operation'
    : effectiveSessionCount === 0 ? 'start_or_select_session'
    : openAttention.length > 0 ? 'inspect_attention'
    : openTasks.length > 0 ? 'inspect_open_task'
    : events.length > 0 ? 'inspect_operation_evidence' : 'read_operation_evidence';
  return {
    operation_id: operationId,
    session_count: sessions.length,
    session_inhabitance_count: effectiveSessionCount,
    task_count: tasks.length,
    open_task_count: openTasks.length,
    attention_count: attention.length,
    open_attention_count: openAttention.length,
    evidence_event_count: events.length,
    next_action: nextAction,
  };
}

function cloudflareOperationScopeLoaded(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.active_operation_id || '';
  return Boolean(operationId && product.operation?.operation_id === operationId);
}

function cloudflareOperationSessions(operationId, product = {}) {
  if (!operationId) return [];
  return (product.sessions || []).filter((session) => !session.operation_id || session.operation_id === operationId);
}

function cloudflareOperationLocalResidentSessionInhabitanceCount(operationId, product = {}) {
  if (!operationId) return 0;
  const fallbackEvidence = Array.isArray(product.resident_dispatch_windows_fallback_evidence)
    ? product.resident_dispatch_windows_fallback_evidence
    : [];
  const sessionRefs = new Set();
  for (const entry of fallbackEvidence) {
    if (!entry || entry.operation_id !== operationId) continue;
    if (String(entry.local_session_start_admission ?? '') !== 'admitted_by_windows_resident_loop') continue;
    const sessionRef = String(entry.local_resident_session_ref ?? '').trim();
    if (!sessionRef) continue;
    sessionRefs.add(sessionRef);
  }
  return sessionRefs.size;
}

export function shouldKeepFocusedOperationProjection(focusedProjection = null, selectedProjection = null) {
  const focusedRoute = focusedProjection?.operation_workflow_route || null;
  const selectedRoute = selectedProjection?.operation_workflow_route || null;
  const focusedStatus = String(focusedProjection?.operation?.status || '').trim();
  const selectedStatus = String(selectedProjection?.operation?.status || '').trim();
  if (focusedStatus !== 'active' || selectedStatus === 'active') return false;
  if (selectedRoute?.next_action === 'monitor_operation') {
    return Boolean(focusedRoute?.next_action && focusedRoute.next_action !== 'monitor_operation');
  }
  if (!focusedRoute?.next_action || focusedRoute.next_action === 'monitor_operation') return false;
  if (!selectedRoute?.next_action || selectedRoute.next_action === 'monitor_operation') return false;
  if (focusedRoute.next_action !== selectedRoute.next_action) return false;
  const focusedRef = String(focusedRoute.focus_ref || focusedRoute.target || '').trim();
  const selectedRef = String(selectedRoute.focus_ref || selectedRoute.target || '').trim();
  return Boolean(focusedRef && focusedRef === selectedRef);
}

function mergeLocalResidentCarrierBridgeSessions(sessions = [], bridgeRecords = []) {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const bridgeList = Array.isArray(bridgeRecords) ? bridgeRecords : [];
  const seenCarrierSessionIds = new Set(
    sessionList
      .map((session) => String(session?.carrier_session_id ?? session?.session_id ?? '').trim())
      .filter(Boolean),
  );
  const bridgedSessions = [];
  for (const record of bridgeList) {
    const carrierSessionId = String(record?.cloudflare_carrier_session_id ?? '').trim();
    if (!carrierSessionId || seenCarrierSessionIds.has(carrierSessionId)) continue;
    seenCarrierSessionIds.add(carrierSessionId);
    bridgedSessions.push({
      carrier_session_id: carrierSessionId,
      session_id: carrierSessionId,
      site_id: record?.site_id ?? null,
      operation_id: record?.operation_id ?? null,
      created_at: record?.recorded_at ?? record?.generated_at ?? null,
      started_at: record?.recorded_at ?? record?.generated_at ?? null,
      status: 'bridged_local_resident_inhabitance',
      source: 'local_resident_carrier_bridge',
      local_resident_session_ref: record?.local_resident_session_ref ?? null,
      cloudflare_session_replay_binding_admission: record?.cloudflare_session_replay_binding_admission ?? null,
      cloudflare_runtime_session_start_admission: record?.cloudflare_runtime_session_start_admission ?? null,
    });
  }
  return bridgedSessions.length > 0 ? [...sessionList, ...bridgedSessions] : sessionList;
}

function mergeLocalResidentCarrierBridgeEvidence(carrierEvidence = [], bridgeRecords = []) {
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const bridgeList = Array.isArray(bridgeRecords) ? bridgeRecords : [];
  const seenCarrierSessionIds = new Set(
    evidenceGroups
      .filter((group) => Array.isArray(group?.events) && group.events.length > 0)
      .map((group) => String(group?.carrier_session_id ?? group?.session_id ?? '').trim())
      .filter(Boolean),
  );
  const bridgedEvidence = [];
  for (const record of bridgeList) {
    const carrierSessionId = String(record?.cloudflare_carrier_session_id ?? '').trim();
    if (!carrierSessionId || seenCarrierSessionIds.has(carrierSessionId)) continue;
    seenCarrierSessionIds.add(carrierSessionId);
    bridgedEvidence.push({
      ok: true,
      source: 'local_resident_carrier_bridge',
      carrier_session_id: carrierSessionId,
      session_id: carrierSessionId,
      events: [{
        sequence: 1,
        event_kind: 'local_resident_carrier_evidence_bridged',
        created_at: record?.recorded_at ?? record?.generated_at ?? null,
        payload: {
          bridge_id: record?.bridge_id ?? null,
          site_id: record?.site_id ?? null,
          operation_id: record?.operation_id ?? null,
          dispatch_decision_id: record?.dispatch_decision_id ?? null,
          fallback_evidence_id: record?.fallback_evidence_id ?? null,
          local_resident_session_ref: record?.local_resident_session_ref ?? null,
          bridge_authority: record?.bridge_authority ?? null,
          cloudflare_session_replay_binding_admission: record?.cloudflare_session_replay_binding_admission ?? null,
          cloudflare_evidence_replay_binding_admission: record?.cloudflare_evidence_replay_binding_admission ?? null,
          cloudflare_runtime_session_start_admission: record?.cloudflare_runtime_session_start_admission ?? null,
        },
      }],
    });
  }
  return bridgedEvidence.length > 0 ? [...evidenceGroups, ...bridgedEvidence] : evidenceGroups;
}

function cloudflareOperationHasOnlyLocalResidentInhabitance(operation = null, {
  sessions = [],
  residentDispatchWindowsFallbackEvidence = [],
} = {}) {
  const sessionCount = Array.isArray(sessions) ? sessions.length : 0;
  if (sessionCount > 0) return false;
  return cloudflareOperationLocalResidentSessionInhabitanceCount(operation?.operation_id ?? null, {
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
  }) > 0;
}

function cloudflareOperationTasks(operation = {}, product = {}, context = {}) {
  const operationId = operation.operation_id || context.active_operation_id || product.operation?.operation_id || '';
  if (!operationId) return [];
  const operationSessionIds = new Set(
    cloudflareOperationSessions(operationId, product)
      .map((session) => String(session?.carrier_session_id ?? '').trim())
      .filter(Boolean),
  );
  return (product.tasks || []).filter((task) => (
    task.operation_id === operationId
    || (task.carrier_session_id && operationSessionIds.has(task.carrier_session_id))
  ));
}

function cloudflareOperationCarrierSessionOperationMap(product = {}) {
  const entries = Array.isArray(product.sessions) ? product.sessions : [];
  return new Map(
    entries
      .map((session) => [String(session?.carrier_session_id ?? '').trim(), String(session?.operation_id ?? '').trim()])
      .filter(([carrierSessionId, operationId]) => carrierSessionId && operationId),
  );
}

function cloudflareOperationEventOperationId(event = {}, product = {}, fallbackCarrierSessionId = '') {
  const explicitOperationId = String(event?.payload?.operation_id ?? event?.payload?.target?.id ?? '').trim();
  if (explicitOperationId) return explicitOperationId;
  const carrierSessionId = String(event?.carrier_session_id ?? fallbackCarrierSessionId ?? '').trim();
  if (!carrierSessionId) return '';
  return cloudflareOperationCarrierSessionOperationMap(product).get(carrierSessionId) || '';
}

function cloudflareOperationEvents(operation = {}, product = {}) {
  const operationId = operation.operation_id || product.operation?.operation_id || '';
  if (!operationId) return [];
  const seen = new Set();
  return (product.carrier_evidence || []).flatMap((entry) => (
    (entry.events || []).filter((event) => {
      const eventOperationId = cloudflareOperationEventOperationId(event, product, entry.carrier_session_id);
      if (eventOperationId !== operationId) return false;
      const key = [entry.carrier_session_id, event.sequence, event.event_kind, JSON.stringify(event.payload || {})].join(':');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((event) => ({ ...event, carrier_session_id: entry.carrier_session_id || event.carrier_session_id || null }))
  ));
}

function cloudflareOperationAttention(product = {}) {
  const tasks = product.tasks || [];
  const sessionOperationMap = cloudflareOperationCarrierSessionOperationMap(product);
  const seen = new Set();
  return (product.carrier_evidence || []).flatMap((entry) => entry.events || [])
    .filter((event) => event.event_kind === 'directive_emitted' && event.payload?.directive_kind === 'operation_attention')
    .map((event) => {
      const payload = event.payload || {};
      const key = payload.directive_id || payload.input_event_id || [event.carrier_session_id, event.sequence].filter(Boolean).join(':');
      if (seen.has(key)) return null;
      seen.add(key);
      const operationId = String(
        payload.operation_id
        || payload.target?.id
        || sessionOperationMap.get(String(entry?.carrier_session_id ?? event?.carrier_session_id ?? '').trim())
        || '',
      ).trim();
      const resolvedByTask = tasks.find((task) => {
        const note = String(task.note || '');
        const status = String(task.status || '').toLowerCase();
        const resolutionStatus = status === 'done' || status === 'resolved' || status === 'closed';
        const inputEventId = String(payload.input_event_id || '');
        return resolutionStatus && (note.includes(key) || (inputEventId && note.includes(inputEventId)));
      }) || null;
      return {
        key,
        operation_id: operationId || null,
        status: resolvedByTask ? 'resolved' : 'open',
      };
    })
    .filter(Boolean);
}

function cloudflareOperationPostureReason(item = {}) {
  const action = item.command?.next_action || 'inspect_operation';
  if (action === 'read_operation_scope') return 'operation_scope';
  if (action === 'start_or_select_session') return 'session';
  if (action === 'inspect_attention') return 'operation_attention';
  if (action === 'inspect_open_task') return 'open_tasks';
  if (action === 'read_operation_evidence') return 'carrier_evidence';
  if (action === 'inspect_operation_evidence') return 'evidence_review';
  return action;
}

function cloudflareTaskLifecycleStatus(task = {}) {
  const status = String(task.status || '').toLowerCase();
  if (status === 'open' || status === 'todo' || status === 'pending') return 'open';
  if (status === 'done' || status === 'resolved' || status === 'closed') return 'closed';
  return status || 'unknown';
}

async function listCloudflareContinuityPackets(env = {}, siteId, limit = 100) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareContinuityPacketSchema(db);
  const result = await db.prepare(`SELECT packet_id, site_id, relation_id, source_embodiment_kind, target_embodiment_kind,
    admission_action, admission_reason, packet_json, imported_by_principal_id, imported_at
    FROM cloudflare_site_continuity_packets WHERE site_id = ? ORDER BY imported_at DESC LIMIT ?`).bind(siteId, boundedContinuityPacketReadLimit(limit)).all();
  return (result.results ?? []).map((row) => ({
    ...row,
    packet: parseCloudflareContinuityPacketJson(row.packet_json),
  }));
}

function parseCloudflareContinuityPacketJson(packetJson) {
  if (!packetJson) return null;
  if (typeof packetJson === 'object') return packetJson;
  try {
    return JSON.parse(packetJson);
  } catch {
    return null;
  }
}

async function listCloudflareContinuityLoopReports(env = {}, siteId, limit = 20) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareContinuityLoopReportSchema(db);
  const result = await db.prepare(`SELECT report_id, site_id, status, generated_at, cloudflare_source, cloudflare_push_status,
    windows_packet_count, cloudflare_credential_source, recorded_by_principal_id, recorded_at
    FROM cloudflare_site_continuity_loop_reports WHERE site_id = ? ORDER BY recorded_at DESC LIMIT ?`).bind(siteId, boundedContinuityPacketReadLimit(limit)).all();
  return result.results ?? [];
}

async function listCloudflareContinuityReconciliationExecutions(env = {}, siteId, limit = 20) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareContinuityReconciliationExecutionSchema(db);
  const result = await db.prepare(`SELECT execution_id, site_id, status, generated_at, persisted_at,
    reconciliation_plan_status, selected_site_count, executed_site_count, completed_site_count,
    failed_site_count, refusal_reason, recorded_by_principal_id, recorded_at
    FROM cloudflare_site_continuity_reconciliation_executions WHERE site_id = ? ORDER BY recorded_at DESC LIMIT ?`).bind(siteId, boundedContinuityPacketReadLimit(limit)).all();
  return result.results ?? [];
}

function summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets = [], siteContinuity = null) {
  const packets = Array.isArray(continuityPackets) ? continuityPackets : [];
  const latestPacket = packets[0] ?? null;
  const directionCounts = {
    cloudflare_to_local_windows: 0,
    local_windows_to_cloudflare: 0,
    other: 0,
  };
  for (const packet of packets) {
    if (
      packet.source_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER
      && packet.target_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS
    ) {
      directionCounts.cloudflare_to_local_windows += 1;
    } else if (
      packet.source_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS
      && packet.target_embodiment_kind === SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER
    ) {
      directionCounts.local_windows_to_cloudflare += 1;
    } else {
      directionCounts.other += 1;
    }
  }
  return {
    schema: 'narada.cloudflare_site_continuity_status.v1',
    site_id: siteId,
    state: packets.length > 0 ? 'packet_observed' : 'no_packet_observed',
    packet_count: packets.length,
    direction_counts: directionCounts,
    latest_packet_id: latestPacket?.packet_id ?? null,
    latest_imported_at: latestPacket?.imported_at ?? null,
    latest_admission_action: latestPacket?.admission_action ?? null,
    latest_admission_reason: latestPacket?.admission_reason ?? null,
    expected_exchange_packet_id: siteContinuity?.exchange_packet?.packet_id ?? null,
    authority_boundary: {
      executable_cross_embodiment_mutation: 'refused_by_site_continuity_classifier',
      durable_mutation_authority: 'unchanged; routed_by_site_authority_map',
    },
  };
}

function summarizeCloudflareOperationContinuityDirectionStatus({
  operation = null,
  siteId = null,
  continuityStatus = null,
  continuityLoopStatus = null,
  localCloudContinuityBridge = null,
} = {}) {
  const directionCounts = continuityStatus?.direction_counts ?? {};
  const cloudflareToLocalWindows = Number(directionCounts.cloudflare_to_local_windows ?? localCloudContinuityBridge?.cloudflare_to_local_windows_packets ?? 0);
  const localWindowsToCloudflare = Number(directionCounts.local_windows_to_cloudflare ?? localCloudContinuityBridge?.local_windows_to_cloudflare_packets ?? 0);
  const missingDirections = [];
  if (cloudflareToLocalWindows <= 0) missingDirections.push('cloudflare_to_local_windows');
  if (localWindowsToCloudflare <= 0) missingDirections.push('local_windows_to_cloudflare');
  const state = missingDirections.length === 0
    ? 'bidirectional_packets_observed'
    : cloudflareToLocalWindows > 0 ? 'cloudflare_to_local_windows_only'
      : localWindowsToCloudflare > 0 ? 'local_windows_to_cloudflare_only'
        : 'no_packet_observed';
  const nextAction = state === 'bidirectional_packets_observed'
    ? (continuityLoopStatus?.state === 'loop_report_observed' ? 'monitor_operation_continuity' : 'review_continuity_loop_report')
    : state === 'cloudflare_to_local_windows_only' ? 'return_local_windows_continuity_packet'
      : state === 'local_windows_to_cloudflare_only' ? 'publish_cloudflare_continuity_packet'
        : 'observe_continuity_packet';
  return {
    schema: 'narada.cloudflare_operation_continuity_direction_status.v1',
    operation_id: operation?.operation_id ?? null,
    site_id: operation?.site_id ?? siteId ?? null,
    state,
    cloudflare_to_local_windows_packet_count: cloudflareToLocalWindows,
    local_windows_to_cloudflare_packet_count: localWindowsToCloudflare,
    missing_directions: missingDirections,
    bridge_state: localCloudContinuityBridge?.state ?? continuityStatus?.state ?? 'unknown',
    loop_state: continuityLoopStatus?.state ?? 'unknown',
    next_action: nextAction,
  };
}

function summarizeCloudflareOperationLifecycleStatus({
  operation = null,
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  carrierEvidenceReadStatus = null,
  continuityStatus = null,
  continuityLoopStatus = null,
  continuityReconciliationExecutionStatus = null,
  operationContinuityDirectionStatus = null,
  residentLoopShadowRuns = [],
  residentDispatchDecisions = [],
  residentDispatchWindowsFallbackEvidence = [],
  localIngressRequests = [],
  localIngressEvidence = [],
  localIngressProviderHeartbeats = [],
  repositoryPublicationRequests = [],
  repositoryPublicationExecutions = [],
  repositoryPublicationEvidence = [],
  repositoryPublicationProviderHeartbeats = [],
  webhookDelayDirectiveRecords = [],
  webhookDelayDirectiveDeliveries = [],
  persistencePosture = null,
  recoveryPosture = null,
} = {}) {
  const sessionCount = Array.isArray(sessions) ? sessions.length : 0;
  const localResidentSessionInhabitanceCount = cloudflareOperationLocalResidentSessionInhabitanceCount(operation?.operation_id ?? null, {
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
  });
  const effectiveSessionCount = sessionCount > 0 ? sessionCount : localResidentSessionInhabitanceCount;
  const taskList = Array.isArray(tasks) ? tasks : [];
  const openTaskCount = taskList.filter((task) => !['done', 'closed', 'cancelled'].includes(String(task.status ?? '').toLowerCase())).length;
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group.events) ? group.events.length : 0), 0);
  const continuityState = continuityStatus?.state ?? 'unknown';
  const continuityLoopState = continuityLoopStatus?.state ?? 'unknown';
  const continuityLoopFreshnessState = continuityLoopStatus?.freshness_state ?? 'unknown';
  const continuityReconciliationExecutionState = continuityReconciliationExecutionStatus?.state ?? 'unknown';
  const continuityReconciliationExecutionHealth = continuityReconciliationExecutionStatus?.health ?? 'unknown';
  const residentLoopCount = Array.isArray(residentLoopShadowRuns) ? residentLoopShadowRuns.length : 0;
  const residentDispatchCount = Array.isArray(residentDispatchDecisions) ? residentDispatchDecisions.length : 0;
  const localResidentOnlyCarrierEvidenceGap = effectiveSessionCount > 0
    && sessionCount === 0
    && localResidentSessionInhabitanceCount > 0
    && evidenceEventCount === 0;
  const directiveRecordCount = Array.isArray(webhookDelayDirectiveRecords) ? webhookDelayDirectiveRecords.length : 0;
  const directiveDeliveryCount = Array.isArray(webhookDelayDirectiveDeliveries) ? webhookDelayDirectiveDeliveries.length : 0;
  const localIngressRequestCount = Array.isArray(localIngressRequests) ? localIngressRequests.length : 0;
  const localIngressEvidenceCount = Array.isArray(localIngressEvidence) ? localIngressEvidence.length : 0;
  const localIngressProviderHeartbeatCount = Array.isArray(localIngressProviderHeartbeats) ? localIngressProviderHeartbeats.length : 0;
  const localIngressProviderLiveness = classifyLocalIngressProviderLiveness(localIngressProviderHeartbeats);
  const localIngressProviderSchedulerPosture = localIngressProviderLiveness.scheduler_posture;
  const localIngressObserved = localIngressRequestCount > 0 || localIngressEvidenceCount > 0 || localIngressProviderHeartbeatCount > 0;
  const repositoryPublicationRequestCount = Array.isArray(repositoryPublicationRequests) ? repositoryPublicationRequests.length : 0;
  const repositoryPublicationExecutionCount = Array.isArray(repositoryPublicationExecutions) ? repositoryPublicationExecutions.length : 0;
  const repositoryPublicationEvidenceCount = Array.isArray(repositoryPublicationEvidence) ? repositoryPublicationEvidence.length : 0;
  const repositoryPublicationProviderHeartbeatCount = Array.isArray(repositoryPublicationProviderHeartbeats) ? repositoryPublicationProviderHeartbeats.length : 0;
  const repositoryPublicationProviderLiveness = classifyRepositoryPublicationProviderLiveness(repositoryPublicationProviderHeartbeats);
  const repositoryPublicationProviderSchedulerPosture = repositoryPublicationProviderLiveness.scheduler_posture;
  const repositoryPublicationObserved = repositoryPublicationRequestCount > 0 || repositoryPublicationExecutionCount > 0 || repositoryPublicationEvidenceCount > 0 || repositoryPublicationProviderHeartbeatCount > 0;
  const needsContinuation = String(operation?.status ?? '').toLowerCase() === 'needs_continuation';
  const missing = [];
  if (effectiveSessionCount === 0) missing.push('session');
  if (evidenceEventCount === 0) missing.push(localResidentOnlyCarrierEvidenceGap ? 'local_resident_carrier_evidence' : 'carrier_evidence');
  if (continuityState !== 'packet_observed') missing.push('continuity_packet');
  if (persistencePosture?.state === 'incomplete') missing.push('cloudflare_persistence_posture');
  if (recoveryPosture?.state === 'not_reconstructable') missing.push('cloudflare_recovery_posture');
  const attention = [];
  if (continuityState === 'packet_observed' && continuityLoopState !== 'loop_report_observed') attention.push('continuity_loop_report');
  if (continuityState === 'packet_observed' && continuityLoopState === 'loop_report_observed' && ['stale', 'failed', 'unknown'].includes(continuityLoopFreshnessState)) attention.push('continuity_loop_freshness');
  if (continuityReconciliationExecutionState === 'reconciliation_execution_observed' && continuityReconciliationExecutionHealth === 'attention') attention.push('continuity_reconciliation_execution');
  if (carrierEvidenceReadStatus?.state === 'degraded') attention.push('carrier_evidence_read_degraded');
  if (persistencePosture?.state === 'degraded') attention.push('cloudflare_persistence_posture');
  if (recoveryPosture?.state === 'partially_reconstructable') attention.push('cloudflare_recovery_posture');
  if (openTaskCount > 0) attention.push('open_tasks');
  if (directiveRecordCount > directiveDeliveryCount) attention.push('undelivered_directives');
  if (localIngressObserved && localIngressProviderLiveness.state === 'missing') attention.push('local_ingress_provider_liveness_missing');
  if (localIngressObserved && localIngressProviderLiveness.state === 'stale') attention.push('local_ingress_provider_liveness_stale');
  if (repositoryPublicationObserved && repositoryPublicationProviderLiveness.state === 'missing') attention.push('repository_publication_provider_liveness_missing');
  if (repositoryPublicationObserved && repositoryPublicationProviderLiveness.state === 'stale') attention.push('repository_publication_provider_liveness_stale');
  const phase = operation?.status === 'active'
    ? (effectiveSessionCount > 0 ? 'inhabited' : 'active_uninhabited')
    : String(operation?.status ?? 'unknown');
  const health = needsContinuation
    ? 'attention'
    : missing.length === 0 && attention.length === 0
    ? 'ready'
    : (effectiveSessionCount === 0 || evidenceEventCount === 0 ? 'incomplete' : 'attention');
  return {
    schema: 'narada.cloudflare_operation_lifecycle_status.v1',
    operation_id: operation?.operation_id ?? null,
    site_id: operation?.site_id ?? null,
    phase,
    health,
    missing,
    attention,
    session_count: sessionCount,
    session_inhabitance_count: effectiveSessionCount,
    local_resident_session_inhabitance_count: localResidentSessionInhabitanceCount,
    local_resident_only_carrier_evidence_gap: localResidentOnlyCarrierEvidenceGap,
    open_task_count: openTaskCount,
    task_count: taskList.length,
    evidence_event_count: evidenceEventCount,
    continuity_state: continuityState,
    continuity_loop_state: continuityLoopState,
    continuity_loop_freshness_state: continuityLoopFreshnessState,
    continuity_loop_report_age_ms: continuityLoopStatus?.latest_report_age_ms ?? null,
    site_continuity_loop_status: continuityLoopStatus,
    continuity_reconciliation_execution_state: continuityReconciliationExecutionState,
    continuity_reconciliation_execution_health: continuityReconciliationExecutionHealth,
    continuity_reconciliation_execution_count: continuityReconciliationExecutionStatus?.execution_count ?? 0,
    site_continuity_reconciliation_execution_status: continuityReconciliationExecutionStatus,
    continuity_direction_state: operationContinuityDirectionStatus?.state ?? 'unknown',
    continuity_direction_missing: operationContinuityDirectionStatus?.missing_directions ?? [],
    operation_continuity_direction_status: operationContinuityDirectionStatus,
    continuity_loop_report_count: continuityLoopStatus?.report_count ?? 0,
    resident_loop_shadow_run_count: residentLoopCount,
    resident_dispatch_decision_count: residentDispatchCount,
    local_ingress_request_count: localIngressRequestCount,
    local_ingress_evidence_count: localIngressEvidenceCount,
    local_ingress_provider_heartbeat_count: localIngressProviderHeartbeatCount,
    local_ingress_provider_liveness_authority: localIngressProviderHeartbeatCount > 0 ? CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY : 'not_observed',
    local_ingress_provider_liveness: localIngressProviderLiveness,
    local_ingress_provider_scheduler_posture: localIngressProviderSchedulerPosture,
    repository_publication_request_count: repositoryPublicationRequestCount,
    repository_publication_execution_count: repositoryPublicationExecutionCount,
    repository_publication_evidence_count: repositoryPublicationEvidenceCount,
    repository_publication_provider_heartbeat_count: repositoryPublicationProviderHeartbeatCount,
    repository_publication_provider_liveness_authority: repositoryPublicationProviderHeartbeatCount > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY : 'not_observed',
    repository_publication_provider_liveness: repositoryPublicationProviderLiveness,
    repository_publication_provider_scheduler_posture: repositoryPublicationProviderSchedulerPosture,
    directive_record_count: directiveRecordCount,
    directive_delivery_count: directiveDeliveryCount,
    carrier_evidence_read_status: carrierEvidenceReadStatus,
    cloudflare_persistence_posture: persistencePosture,
    cloudflare_recovery_posture: recoveryPosture,
    next_action: needsContinuation ? 'resume_operation_continuation' : missing[0] ?? (attention[0] === 'continuity_loop_freshness' ? continuityLoopStatus?.next_action ?? 'refresh_site_continuity_loop' : attention[0]) ?? 'monitor_operation',
  };
}

function summarizeCloudflareLocalIngressOperationPosture({
  localIngressRequests = [],
  localIngressEvidence = [],
  localIngressProviderHeartbeats = [],
} = {}) {
  const requests = Array.isArray(localIngressRequests) ? localIngressRequests : [];
  const evidence = Array.isArray(localIngressEvidence) ? localIngressEvidence : [];
  const heartbeats = Array.isArray(localIngressProviderHeartbeats) ? localIngressProviderHeartbeats : [];
  const evidenceRequestIds = new Set(evidence.map((item) => item?.local_ingress_request_id).filter(Boolean));
  const pendingRequests = requests.filter((request) => !evidenceRequestIds.has(request?.local_ingress_request_id));
  const providerLiveness = classifyLocalIngressProviderLiveness(heartbeats);
  const observed = requests.length > 0 || evidence.length > 0 || heartbeats.length > 0;
  const completedEvidenceCount = evidence.filter((item) => String(item?.local_execution_status ?? '') === 'completed').length;
  const refusedEvidenceCount = evidence.filter((item) => {
    const executionStatus = String(item?.local_execution_status ?? '');
    const admissionAction = String(item?.windows_admission_action ?? '');
    return executionStatus === 'refused' || admissionAction === 'refuse';
  }).length;
  const latestRequest = requests[0] ?? null;
  const latestEvidence = evidence[0] ?? null;
  const latestHeartbeat = heartbeats[0] ?? null;
  const authorityPartition = evidence.length > 0
    ? 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority'
    : requests.length > 0
      ? 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence'
      : heartbeats.length > 0
        ? 'cloudflare_records_windows_local_ingress_provider_liveness_without_direct_filesystem_authority'
        : 'local_ingress_not_observed_windows_authority_retained';
  let state = 'not_observed';
  let nextAction = 'queue_governed_local_ingress_request';
  if (pendingRequests.length > 0) {
    state = ['missing', 'stale', 'failed'].includes(providerLiveness.state) ? 'attention' : 'waiting_for_windows_executor';
    nextAction = ['missing', 'stale', 'failed'].includes(providerLiveness.state)
      ? 'restore_windows_local_ingress_executor'
      : 'run_windows_local_ingress_executor';
  } else if (evidence.length > 0) {
    state = 'evidence_recorded';
    nextAction = 'review_local_ingress_evidence';
  } else if (heartbeats.length > 0) {
    state = providerLiveness.state === 'fresh' ? 'provider_ready' : 'attention';
    nextAction = providerLiveness.state === 'fresh' ? 'monitor_local_ingress_provider' : 'restore_windows_local_ingress_executor';
  }
  return {
    schema: 'narada.cloudflare_local_ingress_operation_posture.v1',
    state,
    local_ingress_request_count: requests.length,
    local_ingress_evidence_count: evidence.length,
    local_ingress_provider_heartbeat_count: heartbeats.length,
    pending_request_count: pendingRequests.length,
    completed_evidence_count: completedEvidenceCount,
    refused_evidence_count: refusedEvidenceCount,
    latest_request_id: latestRequest?.local_ingress_request_id ?? null,
    latest_evidence_id: latestEvidence?.local_ingress_evidence_id ?? null,
    latest_provider_heartbeat_id: latestHeartbeat?.local_ingress_provider_heartbeat_id ?? null,
    provider_liveness_authority: heartbeats.length > 0 ? CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY : 'not_observed',
    provider_liveness: providerLiveness,
    request_authority: requests.length > 0 ? CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY : 'not_observed',
    evidence_authority: evidence.length > 0 ? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY : 'not_observed',
    evidence_store_authority: evidence.length > 0 ? 'cloudflare_local_ingress_evidence_store' : 'not_observed',
    executor_authority: observed ? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY : 'not_observed',
    direct_cloudflare_filesystem_mutation_admission: observed ? 'not_admitted' : 'retained',
    repository_publication_admission: observed ? 'not_admitted' : 'retained',
    authority_partition: authorityPartition,
    next_action: nextAction,
  };
}

function summarizeCloudflareRepositoryPublicationOperationPosture({
  repositoryPublicationRequests = [],
  repositoryPublicationAdmissions = [],
  repositoryPublicationExecutions = [],
  repositoryPublicationEvidence = [],
  repositoryPublicationProviderHeartbeats = [],
} = {}) {
  const requests = Array.isArray(repositoryPublicationRequests) ? repositoryPublicationRequests : [];
  const admissions = Array.isArray(repositoryPublicationAdmissions) ? repositoryPublicationAdmissions : [];
  const executions = Array.isArray(repositoryPublicationExecutions) ? repositoryPublicationExecutions : [];
  const evidence = Array.isArray(repositoryPublicationEvidence) ? repositoryPublicationEvidence : [];
  const heartbeats = Array.isArray(repositoryPublicationProviderHeartbeats) ? repositoryPublicationProviderHeartbeats : [];
  const resolvedRequestIds = new Set([
    ...executions.map((item) => item?.repository_publication_request_id).filter(Boolean),
    ...evidence.map((item) => item?.repository_publication_request_id).filter(Boolean),
  ]);
  const pendingRequests = requests.filter((request) => !resolvedRequestIds.has(request?.repository_publication_request_id));
  const admittedRequestIds = new Set(admissions.filter((item) => item?.admission_action === 'admit').map((item) => item.repository_publication_request_id).filter(Boolean));
  const pendingUnadmittedRequests = pendingRequests.filter((request) => !admittedRequestIds.has(request?.repository_publication_request_id));
  const providerLiveness = classifyRepositoryPublicationProviderLiveness(heartbeats);
  const observed = requests.length > 0 || admissions.length > 0 || executions.length > 0 || evidence.length > 0 || heartbeats.length > 0;
  const completedExecutionCount = executions.filter((item) => String(item?.publication_status ?? '') === 'completed').length;
  const failedExecutionCount = executions.filter((item) => String(item?.publication_status ?? '') === 'failed').length;
  const completedEvidenceCount = evidence.filter((item) => String(item?.publication_status ?? '') === 'completed').length;
  const refusedEvidenceCount = evidence.filter((item) => {
    const publicationStatus = String(item?.publication_status ?? '');
    const admissionAction = String(item?.windows_admission_action ?? '');
    return publicationStatus === 'refused' || admissionAction === 'refuse';
  }).length;
  const latestRequest = requests[0] ?? null;
  const latestAdmission = admissions[0] ?? null;
  const latestExecution = executions[0] ?? null;
  const latestEvidence = evidence[0] ?? null;
  const latestHeartbeat = heartbeats[0] ?? null;
  const authorityPartition = executions.length > 0
    ? 'cloudflare_admits_and_executes_github_repository_publication'
    : evidence.length > 0
    ? 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence'
    : admissions.length > 0
      ? 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence'
      : requests.length > 0
        ? 'cloudflare_queues_repository_publication_request_waiting_for_cloudflare_admission'
      : heartbeats.length > 0
        ? 'cloudflare_records_windows_repository_publication_provider_liveness_without_direct_repository_authority'
        : 'repository_publication_not_observed_windows_authority_retained';
  let state = 'not_observed';
  let nextAction = 'queue_governed_repository_publication_request';
  if (pendingUnadmittedRequests.length > 0) {
    state = 'waiting_for_cloudflare_publication_admission';
    nextAction = 'classify_cloudflare_repository_publication_admission';
  } else if (pendingRequests.length > 0) {
    state = 'waiting_for_cloudflare_github_publication_executor';
    nextAction = 'run_cloudflare_github_repository_publication_executor';
  } else if (executions.length > 0) {
    state = failedExecutionCount > 0 ? 'attention' : 'execution_recorded';
    nextAction = failedExecutionCount > 0 ? 'review_cloudflare_github_repository_publication_execution' : 'review_repository_publication_execution';
  } else if (evidence.length > 0) {
    state = 'evidence_recorded';
    nextAction = 'review_repository_publication_evidence';
  } else if (heartbeats.length > 0) {
    state = providerLiveness.state === 'fresh' ? 'provider_ready' : 'attention';
    nextAction = providerLiveness.state === 'fresh' ? 'monitor_repository_publication_provider' : 'restore_windows_repository_publication_provider';
  }
  return {
    schema: 'narada.cloudflare_repository_publication_operation_posture.v1',
    state,
    repository_publication_request_count: requests.length,
    repository_publication_admission_count: admissions.length,
    repository_publication_execution_count: executions.length,
    repository_publication_evidence_count: evidence.length,
    repository_publication_provider_heartbeat_count: heartbeats.length,
    pending_request_count: pendingRequests.length,
    pending_unadmitted_request_count: pendingUnadmittedRequests.length,
    completed_evidence_count: completedEvidenceCount,
    completed_execution_count: completedExecutionCount,
    failed_execution_count: failedExecutionCount,
    refused_evidence_count: refusedEvidenceCount,
    latest_request_id: latestRequest?.repository_publication_request_id ?? null,
    latest_admission_id: latestAdmission?.repository_publication_admission_id ?? null,
    latest_execution_id: latestExecution?.repository_publication_execution_id ?? null,
    latest_evidence_id: latestEvidence?.repository_publication_evidence_id ?? null,
    latest_provider_heartbeat_id: latestHeartbeat?.repository_publication_provider_heartbeat_id ?? null,
    provider_liveness_authority: heartbeats.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY : 'not_observed',
    provider_liveness: providerLiveness,
    request_authority: requests.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY : 'not_observed',
    admission_authority: admissions.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : 'not_observed',
    repository_publication_admission: latestAdmission?.repository_publication_admission ?? (pendingUnadmittedRequests.length > 0 ? 'waiting_for_cloudflare_publication_admission' : 'not_observed'),
    dispatch_authority: requests.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY : 'not_observed',
    execution_authority: executions.length > 0 ? CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
    evidence_authority: evidence.length > 0 ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
    evidence_store_authority: evidence.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_AUTHORITY : 'not_observed',
    executor_authority: executions.length > 0 ? CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : observed ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
    cloudflare_git_push_admission: observed ? 'not_admitted' : 'retained',
    direct_cloudflare_repository_mutation_admission: executions.length > 0 ? 'admitted_by_cloudflare_github_repository_publication' : observed ? 'not_admitted' : 'retained',
    authority_partition: authorityPartition,
    next_action: nextAction,
  };
}

function summarizeCloudflareAuthorityTransferPosture({
  mailboxStatusShadowReads = [],
  mailboxStatusSourceReads = [],
  mailboxDraftReplyProposals = [],
  mailboxOutlookDraftCreates = [],
  mailboxSendAcceptedRecords = [],
  mailboxSendConfirmations = [],
  siteFileChangeProposals = [],
  siteFileMaterializations = [],
  localIngressOperationPosture = null,
  repositoryPublicationOperationPosture = null,
  taskLifecycleTasks = [],
} = {}) {
  const classifyCounted = (count, observedClassification, retainedClassification = 'windows_retained') => (count > 0 ? observedClassification : retainedClassification);
  const mailboxStatusSourceCount = Array.isArray(mailboxStatusSourceReads) ? mailboxStatusSourceReads.length : 0;
  const mailboxStatusShadowCount = Array.isArray(mailboxStatusShadowReads) ? mailboxStatusShadowReads.length : 0;
  const mailboxSendAcceptedCount = Array.isArray(mailboxSendAcceptedRecords) ? mailboxSendAcceptedRecords.length : 0;
  const mailboxSendConfirmationCount = Array.isArray(mailboxSendConfirmations) ? mailboxSendConfirmations.length : 0;
  const mailboxOutlookDraftCreateCount = Array.isArray(mailboxOutlookDraftCreates) ? mailboxOutlookDraftCreates.length : 0;
  const siteFileMaterializationCount = Array.isArray(siteFileMaterializations) ? siteFileMaterializations.length : 0;
  const mailboxSendRemaining = mailboxSendAcceptedCount > 0 ? [] : ['mailbox_send'];
  const mailboxSendConfirmationRemaining = mailboxSendAcceptedCount > 0 && mailboxSendConfirmationCount === 0 ? ['mailbox_delivery_confirmation'] : [];
  const mailboxOutlookDraftCreateRemaining = mailboxOutlookDraftCreateCount > 0 ? [] : ['outlook_draft_create'];
  const repositoryPublicationRemaining = Number(repositoryPublicationOperationPosture?.repository_publication_execution_count ?? 0) > 0 ? [] : ['repository_publication'];
  const siteFileMaterializationRemaining = [...(siteFileMaterializationCount > 0 ? [] : ['site_file_materialization']), ...repositoryPublicationRemaining];
  const cloudflareSiteMutationPathReady = siteFileMaterializationRemaining.length === 0;
  const mailboxStatusClassification = mailboxStatusSourceCount > 0
    ? 'cloudflare_owned'
    : mailboxStatusShadowCount > 0 ? 'cloudflare_recorded_windows_owned' : 'windows_retained';
  const taskList = Array.isArray(taskLifecycleTasks) ? taskLifecycleTasks : [];
  const taskLifecycleCloudflareWriteCount = taskList.reduce((count, task) => count
    + Number(task.task_lifecycle_roster_mutation_write_count ?? 0)
    + Number(task.task_lifecycle_role_resolution_write_count ?? 0)
    + Number(task.task_lifecycle_assignment_write_count ?? 0)
    + Number(task.task_lifecycle_source_state_write_count ?? 0)
    + Number(task.task_lifecycle_projection_write_count ?? 0)
    + Number(task.changed_file_evidence_count ?? 0)
    + (task.finish_id ? 1 : 0)
    + (task.report_id ? 1 : 0)
    + (task.assignment_authority_ref ? 1 : 0), 0);
  const mailboxExternalEffectsReady = mailboxStatusSourceCount > 0
    && mailboxOutlookDraftCreateCount > 0
    && mailboxSendAcceptedCount > 0
    && mailboxSendConfirmationCount > 0;
  const taskLifecycleExternalEffectsReady = taskLifecycleCloudflareWriteCount > 0
    && mailboxExternalEffectsReady
    && cloudflareSiteMutationPathReady;
  const domains = [
    {
      domain: 'mailbox_status',
      classification: mailboxStatusClassification,
      observed_count: mailboxStatusSourceCount + mailboxStatusShadowCount,
      authority_partition: mailboxStatusSourceCount > 0 ? (mailboxSendAcceptedCount > 0 ? (mailboxSendConfirmationCount > 0 ? 'mailbox_status_source_read_send_and_confirmation_cloudflare_owned_mutation_not_admitted' : 'mailbox_status_source_read_and_send_cloudflare_owned_confirmation_and_mutation_not_admitted') : 'mailbox_status_source_read_cloudflare_owned_send_and_mutation_not_admitted') : mailboxStatusShadowCount > 0 ? (mailboxSendAcceptedCount > 0 ? (mailboxSendConfirmationCount > 0 ? 'mailbox_status_shadow_read_cloudflare_recorded_send_and_confirmation_cloudflare_owned_mutation_windows_owned' : 'mailbox_status_shadow_read_cloudflare_recorded_send_cloudflare_owned_confirmation_and_mutation_windows_owned') : 'mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned') : 'mailbox_windows_owned',
      remaining_windows_authority: mailboxStatusSourceCount > 0 ? [] : ['mailbox_status_source'],
    },
    {
      domain: 'mailbox_draft_reply',
      classification: classifyCounted(Array.isArray(mailboxDraftReplyProposals) ? mailboxDraftReplyProposals.length : 0, 'cloudflare_recorded_windows_owned'),
      observed_count: Array.isArray(mailboxDraftReplyProposals) ? mailboxDraftReplyProposals.length : 0,
      authority_partition: Array.isArray(mailboxDraftReplyProposals) && mailboxDraftReplyProposals.length > 0 ? (mailboxSendAcceptedCount > 0 ? (mailboxSendConfirmationCount > 0 ? 'mailbox_draft_reply_proposal_cloudflare_recorded_send_and_confirmation_cloudflare_owned_outlook_draft_and_mutation_not_admitted' : 'mailbox_draft_reply_proposal_cloudflare_recorded_send_cloudflare_owned_confirmation_outlook_draft_and_mutation_not_admitted') : 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted') : 'mailbox_draft_reply_windows_owned',
      remaining_windows_authority: [...mailboxOutlookDraftCreateRemaining, ...mailboxSendRemaining, ...mailboxSendConfirmationRemaining],
    },
    {
      domain: 'mailbox_outlook_draft_create',
      classification: classifyCounted(Array.isArray(mailboxOutlookDraftCreates) ? mailboxOutlookDraftCreates.length : 0, 'cloudflare_owned'),
      observed_count: Array.isArray(mailboxOutlookDraftCreates) ? mailboxOutlookDraftCreates.length : 0,
      authority_partition: Array.isArray(mailboxOutlookDraftCreates) && mailboxOutlookDraftCreates.length > 0 ? (mailboxSendAcceptedCount > 0 ? (mailboxSendConfirmationCount > 0 ? 'mailbox_outlook_draft_create_send_and_confirmation_cloudflare_owned_other_mutation_not_admitted' : 'mailbox_outlook_draft_create_and_send_cloudflare_owned_confirmation_and_other_mutation_not_admitted') : 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted') : 'mailbox_outlook_draft_create_not_observed',
      remaining_windows_authority: mailboxOutlookDraftCreateCount > 0 ? [...mailboxSendRemaining, ...mailboxSendConfirmationRemaining] : ['outlook_draft_create', ...mailboxSendRemaining, ...mailboxSendConfirmationRemaining],
    },
    {
      domain: 'site_file_change_proposal',
      classification: classifyCounted(Array.isArray(siteFileChangeProposals) ? siteFileChangeProposals.length : 0, 'cloudflare_recorded_windows_owned'),
      observed_count: Array.isArray(siteFileChangeProposals) ? siteFileChangeProposals.length : 0,
      authority_partition: Array.isArray(siteFileChangeProposals) && siteFileChangeProposals.length > 0 ? 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned' : 'filesystem_and_publication_windows_owned',
      remaining_windows_authority: siteFileMaterializationRemaining,
    },
    {
      domain: 'site_file_materialization',
      classification: classifyCounted(siteFileMaterializationCount, 'cloudflare_owned'),
      observed_count: siteFileMaterializationCount,
      authority_partition: siteFileMaterializationCount > 0 ? 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted' : 'materialization_not_observed_filesystem_and_publication_windows_owned',
      remaining_windows_authority: siteFileMaterializationRemaining,
    },
    {
      domain: 'local_ingress',
      classification: cloudflareSiteMutationPathReady ? 'cloudflare_owned' : localIngressOperationPosture?.local_ingress_request_count > 0 || localIngressOperationPosture?.local_ingress_evidence_count > 0 || localIngressOperationPosture?.local_ingress_provider_heartbeat_count > 0 ? 'cloudflare_governed_windows_executed' : 'windows_retained',
      observed_count: Number(localIngressOperationPosture?.local_ingress_request_count ?? 0) + Number(localIngressOperationPosture?.local_ingress_evidence_count ?? 0) + Number(localIngressOperationPosture?.local_ingress_provider_heartbeat_count ?? 0),
      authority_partition: cloudflareSiteMutationPathReady ? 'local_ingress_windows_bridge_superseded_by_cloudflare_site_file_and_repository_publication' : localIngressOperationPosture?.authority_partition ?? 'local_ingress_not_observed_windows_authority_retained',
      remaining_windows_authority: cloudflareSiteMutationPathReady ? [] : ['windows_local_ingress_executor', 'local_filesystem_mutation'],
    },
    {
      domain: 'repository_publication',
      classification: repositoryPublicationOperationPosture?.repository_publication_execution_count > 0 ? 'cloudflare_owned' : repositoryPublicationOperationPosture?.repository_publication_request_count > 0 || repositoryPublicationOperationPosture?.repository_publication_evidence_count > 0 || repositoryPublicationOperationPosture?.repository_publication_provider_heartbeat_count > 0 ? 'cloudflare_governed_windows_executed' : 'windows_retained',
      observed_count: Number(repositoryPublicationOperationPosture?.repository_publication_request_count ?? 0) + Number(repositoryPublicationOperationPosture?.repository_publication_execution_count ?? 0) + Number(repositoryPublicationOperationPosture?.repository_publication_evidence_count ?? 0) + Number(repositoryPublicationOperationPosture?.repository_publication_provider_heartbeat_count ?? 0),
      authority_partition: repositoryPublicationOperationPosture?.authority_partition ?? 'repository_publication_not_observed_windows_authority_retained',
      remaining_windows_authority: repositoryPublicationOperationPosture?.repository_publication_execution_count > 0 ? [] : ['windows_repository_publication_executor', 'git_push'],
    },
    {
      domain: 'task_lifecycle',
      classification: taskLifecycleExternalEffectsReady ? 'cloudflare_owned' : taskLifecycleCloudflareWriteCount > 0 ? 'cloudflare_owned_partial' : 'windows_retained',
      observed_count: taskList.length,
      authority_partition: taskLifecycleExternalEffectsReady ? 'task_lifecycle_cloudflare_writes_and_external_effects_cloudflare_owned' : taskLifecycleCloudflareWriteCount > 0 ? 'task_lifecycle_cloudflare_writes_observed_remaining_windows_effects' : 'windows_all_observed_mutations',
      remaining_windows_authority: taskLifecycleExternalEffectsReady ? [] : taskLifecycleCloudflareWriteCount > 0 ? ['external_effects'] : ['task_lifecycle_sqlite', 'external_effects'],
    },
  ];
  const counts = domains.reduce((acc, item) => {
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    return acc;
  }, {});
  const remainingWindowsDomains = domains.filter((item) => item.remaining_windows_authority.length > 0).map((item) => item.domain);
  const remainingWindowsAuthorities = domains.flatMap((item) => item.remaining_windows_authority.map((authority) => ({ domain: item.domain, authority })));
  return {
    schema: 'narada.cloudflare_authority_transfer_posture.v1',
    transfer_complete: remainingWindowsDomains.length === 0,
    domain_count: domains.length,
    cloudflare_owned_count: (counts.cloudflare_owned ?? 0) + (counts.cloudflare_owned_partial ?? 0),
    cloudflare_governed_windows_executed_count: counts.cloudflare_governed_windows_executed ?? 0,
    cloudflare_recorded_windows_owned_count: counts.cloudflare_recorded_windows_owned ?? 0,
    windows_retained_count: counts.windows_retained ?? 0,
    remaining_windows_domain_count: remainingWindowsDomains.length,
    remaining_windows_domains: remainingWindowsDomains,
    remaining_windows_authority_count: remainingWindowsAuthorities.length,
    remaining_windows_authorities: remainingWindowsAuthorities,
    next_action: remainingWindowsAuthorities.length === 0 ? 'verify_full_cloudflare_authority' : `transfer_${remainingWindowsAuthorities[0].authority}_authority`,
    domains,
  };
}

function summarizeTaskLifecycleSurfaceWriteAdmissionPosture(taskLifecycleTasks = [], externalEffectsReady = false) {
  const tasks = Array.isArray(taskLifecycleTasks) ? taskLifecycleTasks : [];
  if (tasks.some((task) => task.task_lifecycle_roster_mutation_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_admitted' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted_remaining_external_effects_not_admitted';
  if (tasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_external_effects_admitted' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted_remaining_external_effects_not_admitted';
  if (tasks.some((task) => task.task_lifecycle_assignment_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_external_effects_admitted' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted_remaining_external_effects_not_admitted';
  if (tasks.some((task) => task.task_lifecycle_source_state_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_external_effects_admitted' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted_remaining_external_effects_not_admitted';
  if (tasks.some((task) => task.task_lifecycle_projection_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_external_effects_admitted' : 'task_create_claim_report_finish_changed_file_evidence_and_projection_write_admitted_remaining_writes_not_admitted';
  if (tasks.some((task) => task.changed_file_evidence_count > 0)) return tasks.some((task) => task.finish_id) ? (externalEffectsReady ? 'task_create_claim_report_finish_and_changed_file_evidence_and_external_effects_admitted' : 'task_create_claim_report_finish_and_changed_file_evidence_admitted_remaining_writes_not_admitted') : (externalEffectsReady ? 'task_create_claim_report_and_changed_file_evidence_and_external_effects_admitted' : 'task_create_claim_report_and_changed_file_evidence_admitted_remaining_writes_not_admitted');
  if (tasks.some((task) => task.finish_id)) return externalEffectsReady ? 'task_create_claim_report_finish_and_external_effects_admitted' : 'task_create_claim_report_and_finish_admitted_remaining_writes_not_admitted';
  if (tasks.some((task) => task.report_id)) return externalEffectsReady ? 'task_create_claim_report_and_external_effects_admitted' : 'task_create_claim_and_report_admitted_remaining_writes_not_admitted';
  if (tasks.some((task) => task.status === 'claimed')) return externalEffectsReady ? 'task_create_claim_and_external_effects_admitted' : 'task_create_and_claim_admitted_remaining_writes_not_admitted';
  if (tasks.length > 0) return externalEffectsReady ? 'task_create_and_external_effects_admitted' : 'task_create_admitted_remaining_writes_not_admitted';
  return 'writes_not_admitted';
}

function summarizeTaskLifecycleSurfaceAuthorityPartition(taskLifecycleTasks = [], externalEffectsReady = false) {
  const tasks = Array.isArray(taskLifecycleTasks) ? taskLifecycleTasks : [];
  if (tasks.some((task) => task.task_lifecycle_roster_mutation_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_roster_mutation_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects';
  if (tasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects';
  if (tasks.some((task) => task.task_lifecycle_assignment_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects';
  if (tasks.some((task) => task.task_lifecycle_source_state_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects';
  if (tasks.some((task) => task.task_lifecycle_projection_write_count > 0)) return externalEffectsReady ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_changed_file_evidence_and_projection_write_cloudflare_remaining_windows';
  if (tasks.some((task) => task.changed_file_evidence_count > 0)) return tasks.some((task) => task.finish_id) ? (externalEffectsReady ? 'task_create_claim_report_finish_and_changed_file_evidence_and_external_effects_cloudflare_owned' : 'task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows') : (externalEffectsReady ? 'task_create_claim_report_and_changed_file_evidence_and_external_effects_cloudflare_owned' : 'task_create_claim_report_and_changed_file_evidence_cloudflare_remaining_windows');
  if (tasks.some((task) => task.finish_id)) return externalEffectsReady ? 'task_create_claim_report_finish_and_external_effects_cloudflare_owned' : 'task_create_claim_report_and_finish_cloudflare_remaining_windows';
  if (tasks.some((task) => task.report_id)) return externalEffectsReady ? 'task_create_claim_report_and_external_effects_cloudflare_owned' : 'task_create_claim_and_report_cloudflare_remaining_windows';
  if (tasks.some((task) => task.status === 'claimed')) return externalEffectsReady ? 'task_create_claim_and_external_effects_cloudflare_owned' : 'task_create_and_claim_cloudflare_remaining_windows';
  if (tasks.length > 0) return externalEffectsReady ? 'task_create_and_external_effects_cloudflare_owned' : 'task_create_cloudflare_remaining_windows';
  return 'windows_all_observed_mutations';
}

function summarizeCloudflareOperationStatusHistory(authorityEvents = [], operation = null) {
  const operationId = operation?.operation_id ?? null;
  const transitions = (Array.isArray(authorityEvents) ? authorityEvents : [])
    .filter((event) => event?.event_kind === 'site_operation_status_updated')
    .filter((event) => !operationId || event?.evidence?.operation_id === operationId)
    .map((event) => ({
      event_id: event.event_id,
      operation_id: event.evidence?.operation_id ?? operationId,
      from_status: event.evidence?.previous_status ?? null,
      to_status: event.evidence?.status ?? null,
      principal_id: event.principal_id ?? null,
      actor_role: event.evidence?.actor_role ?? null,
      reason: event.reason ?? null,
      recorded_at: event.recorded_at ?? null,
    }))
    .sort((left, right) => String(left.recorded_at || '').localeCompare(String(right.recorded_at || '')));
  return {
    schema: 'narada.cloudflare_operation_status_history.v1',
    operation_id: operationId,
    current_status: operation?.status ?? null,
    transition_count: transitions.length,
    latest_transition: transitions.at(-1) ?? null,
    transitions,
  };
}

function summarizeCloudflareOperationActivityTimeline({
  operation = null,
  statusHistory = null,
  authorityEvents = [],
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  continuityPackets = [],
  continuityLoopReports = [],
  continuityReconciliationExecutions = [],
  webhookDelayDirectiveRecords = [],
  webhookDelayDirectiveDeliveries = [],
  residentLoopShadowRuns = [],
  mailboxDraftReplyProposals = [],
  mailboxOutlookDraftCreates = [],
  mailboxSendAcceptedRecords = [],
  mailboxSendConfirmations = [],
  mailboxSendReviews = [],
  operationFocusReviews = [],
  siteFileChangeProposals = [],
  localIngressRequests = [],
  localIngressEvidence = [],
  localIngressProviderHeartbeats = [],
  repositoryPublicationRequests = [],
  repositoryPublicationEvidence = [],
  repositoryPublicationProviderHeartbeats = [],
  residentDispatchDecisions = [],
} = {}) {
  const operationId = operation?.operation_id ?? null;
  const items = [];
  const push = (item) => {
    if (!item?.activity_kind) return;
    items.push({
      activity_id: item.activity_id || `${item.activity_kind}:${items.length}`,
      activity_kind: item.activity_kind,
      occurred_at: item.occurred_at || null,
      title: item.title || item.activity_kind,
      summary: item.summary || 'recorded',
      source_ref: item.source_ref || null,
      focus_kind: item.focus_kind || item.activity_kind,
      focus_ref: item.focus_ref || item.source_ref || null,
      principal_id: item.principal_id || null,
    });
  };
  for (const transition of statusHistory?.transitions || []) {
    push({
      activity_id: transition.event_id,
      activity_kind: 'operation_status_transition',
      occurred_at: transition.recorded_at,
      title: `Operation ${transition.to_status || 'status changed'}`,
      summary: `${transition.from_status || 'unknown'} -> ${transition.to_status || 'unknown'}`,
      source_ref: transition.operation_id || operationId,
      focus_kind: 'operation_authority_event',
      focus_ref: transition.event_id,
      principal_id: transition.principal_id,
    });
  }
  for (const event of authorityEvents || []) {
    push({
      activity_id: event.event_id,
      activity_kind: event.event_kind === 'site_operation_status_updated' ? 'operation_authority_status_event' : 'operation_authority_event',
      occurred_at: event.recorded_at,
      title: event.event_kind,
      summary: [event.action, event.reason].filter(Boolean).join(' / ') || 'authority event recorded',
      source_ref: event.evidence?.operation_id || event.carrier_session_id || operationId,
      focus_kind: 'operation_authority_event',
      focus_ref: event.event_id,
      principal_id: event.principal_id,
    });
  }
  for (const session of sessions || []) {
    push({
      activity_id: `operation_session:${session.carrier_session_id}`,
      activity_kind: 'operation_session_binding',
      occurred_at: session.created_at || session.updated_at,
      title: 'Session Bound',
      summary: [session.binding_status, session.agent_id].filter(Boolean).join(' / ') || 'session bound',
      source_ref: session.carrier_session_id,
      focus_kind: 'operation_session',
      focus_ref: session.carrier_session_id,
      principal_id: session.bound_by_principal_id,
    });
  }
  for (const task of tasks || []) {
    push({
      activity_id: `operation_task:${task.task_id}`,
      activity_kind: 'operation_task',
      occurred_at: task.updated_at || task.created_at,
      title: task.title || task.task_id || 'Task',
      summary: [task.status, task.carrier_session_id].filter(Boolean).join(' / ') || 'task recorded',
      source_ref: task.task_id,
      focus_kind: 'operation_task',
      focus_ref: task.task_id,
    });
  }
  for (const packet of continuityPackets || []) {
    push({
      activity_id: `continuity_packet:${packet.packet_id}`,
      activity_kind: 'site_continuity_packet',
      occurred_at: packet.imported_at || packet.created_at,
      title: 'Continuity Packet',
      summary: [packet.admission_action, packet.exchange_class].filter(Boolean).join(' / ') || 'continuity packet recorded',
      source_ref: packet.packet_id,
      focus_kind: 'site_continuity_packet',
      focus_ref: packet.packet_id,
      principal_id: packet.imported_by_principal_id,
    });
  }
  for (const report of continuityLoopReports || []) {
    push({
      activity_id: `continuity_loop_report:${report.report_id}`,
      activity_kind: 'site_continuity_loop_report',
      occurred_at: report.recorded_at || report.generated_at,
      title: 'Continuity Loop Report',
      summary: [report.status, report.cloudflare_push_status, String(report.windows_packet_count ?? 0) + ' windows packet(s)'].filter(Boolean).join(' / '),
      source_ref: report.report_id,
      focus_kind: 'site_continuity_loop_report',
      focus_ref: report.report_id,
      principal_id: report.recorded_by_principal_id,
    });
  }
  for (const execution of continuityReconciliationExecutions || []) {
    push({
      activity_id: `site_continuity_reconciliation_execution:${execution.execution_id}`,
      activity_kind: 'site_continuity_reconciliation_execution',
      occurred_at: execution.recorded_at || execution.persisted_at || execution.generated_at,
      title: 'Site Continuity Reconciliation Execution',
      summary: [execution.status, String(execution.completed_site_count ?? 0) + ' completed', String(execution.failed_site_count ?? 0) + ' failed'].filter(Boolean).join(' / '),
      source_ref: execution.execution_id,
      focus_kind: 'site_continuity_reconciliation_execution',
      focus_ref: execution.execution_id,
      principal_id: execution.recorded_by_principal_id,
    });
  }
  for (const entry of carrierEvidence || []) {
    for (const event of entry.events || []) {
      push({
        activity_id: `carrier_event:${entry.carrier_session_id}:${event.sequence ?? event.event_id ?? items.length}`,
        activity_kind: 'carrier_evidence_event',
        occurred_at: event.created_at || event.recorded_at,
        title: event.event_kind || 'carrier_event',
        summary: [entry.carrier_session_id, event.payload?.tool_name || event.payload?.provider || event.payload?.status].filter(Boolean).join(' / ') || 'carrier evidence recorded',
        source_ref: entry.carrier_session_id,
        focus_kind: 'carrier_evidence_event',
        focus_ref: `${entry.carrier_session_id}:${event.sequence ?? event.event_id ?? event.event_kind ?? ''}`,
      });
    }
  }
  for (const record of webhookDelayDirectiveRecords || []) {
    push({
      activity_id: `directive_record:${record.directive_record_id}`,
      activity_kind: 'webhook_delay_directive_record',
      occurred_at: record.recorded_at || record.generated_at,
      title: 'Directive Intent',
      summary: [record.classification_state, record.directive_action, record.fallback_status].filter(Boolean).join(' / ') || 'directive recorded',
      source_ref: record.directive_record_id,
      focus_kind: 'webhook_delay_directive_record',
      focus_ref: record.directive_record_id,
      principal_id: record.recorded_by_principal_id,
    });
  }
  for (const delivery of webhookDelayDirectiveDeliveries || []) {
    push({
      activity_id: `directive_delivery:${delivery.delivery_id}`,
      activity_kind: 'webhook_delay_directive_delivery',
      occurred_at: delivery.recorded_at || delivery.delivery?.completed_at,
      title: 'Directive Delivery',
      summary: [delivery.delivery_state, delivery.carrier_session_id, delivery.fallback_status].filter(Boolean).join(' / ') || 'directive delivery recorded',
      source_ref: delivery.delivery_id,
      focus_kind: 'webhook_delay_directive_delivery',
      focus_ref: delivery.delivery_id,
      principal_id: delivery.recorded_by_principal_id,
    });
  }
  for (const run of residentLoopShadowRuns || []) {
    push({
      activity_id: `resident_loop:${run.loop_run_id}`,
      activity_kind: 'resident_loop_shadow_read',
      occurred_at: run.run_started_at || run.recorded_at,
      title: 'Resident Loop Shadow Read',
      summary: [run.loop_status, 'steps=' + (run.step_count ?? 'unknown'), 'attention=' + (run.operator_attention_count ?? 'unknown')].join(' / '),
      source_ref: run.loop_run_id,
      focus_kind: 'resident_loop_shadow_read',
      focus_ref: run.loop_run_id,
      principal_id: run.recorded_by_principal_id,
    });
  }
  for (const proposal of mailboxDraftReplyProposals || []) {
    push({
      activity_id: `mailbox_draft_reply_proposal:${proposal.proposal_id}`,
      activity_kind: 'mailbox_draft_reply_proposal',
      occurred_at: proposal.recorded_at || proposal.generated_at,
      title: 'Mailbox Draft Reply Proposal',
      summary: [proposal.account_ref, proposal.source_message_ref, proposal.proposal_posture].filter(Boolean).join(' / ') || 'draft reply proposal recorded',
      source_ref: proposal.proposal_id,
      focus_kind: 'mailbox_draft_reply_proposal',
      focus_ref: proposal.proposal_id,
      principal_id: proposal.recorded_by_principal_id,
    });
  }
  for (const draft of mailboxOutlookDraftCreates || []) {
    push({
      activity_id: `mailbox_outlook_draft_create:${draft.draft_create_id}`,
      activity_kind: 'mailbox_outlook_draft_create',
      occurred_at: draft.recorded_at || draft.generated_at,
      title: 'Mailbox Outlook Draft Created',
      summary: [draft.account_ref, draft.outlook_draft_id, draft.mailbox_send_admission].filter(Boolean).join(' / ') || 'outlook draft created',
      source_ref: draft.draft_create_id,
      focus_kind: 'mailbox_outlook_draft_create',
      focus_ref: draft.draft_create_id,
      principal_id: draft.recorded_by_principal_id,
    });
  }
  for (const send of mailboxSendAcceptedRecords || []) {
    push({
      activity_id: `mailbox_send_accepted:${send.send_accepted_id}`,
      activity_kind: 'mailbox_send_accepted',
      occurred_at: send.recorded_at || send.generated_at,
      title: 'Mailbox Send Accepted',
      summary: [send.account_ref, send.outlook_draft_id, send.graph_status].filter(Boolean).join(' / ') || 'graph send accepted',
      source_ref: send.send_accepted_id,
      focus_kind: 'mailbox_send_accepted',
      focus_ref: send.send_accepted_id,
      principal_id: send.recorded_by_principal_id,
    });
  }
  for (const confirmation of mailboxSendConfirmations || []) {
    push({
      activity_id: `mailbox_send_confirmation:${confirmation.send_confirmation_id}`,
      activity_kind: 'mailbox_send_confirmation',
      occurred_at: confirmation.recorded_at || confirmation.sent_at || confirmation.generated_at,
      title: 'Mailbox Send Confirmation Read',
      summary: [confirmation.account_ref, confirmation.sent_message_ref, confirmation.graph_status].filter(Boolean).join(' / ') || 'graph sent message observed',
      source_ref: confirmation.send_confirmation_id,
      focus_kind: 'mailbox_send_confirmation',
      focus_ref: confirmation.send_confirmation_id,
      principal_id: confirmation.recorded_by_principal_id,
    });
  }
  for (const review of mailboxSendReviews || []) {
    push({
      activity_id: `mailbox_send_review:${review.review_id}`,
      activity_kind: 'mailbox_send_review_acknowledgement',
      occurred_at: review.recorded_at || review.generated_at,
      title: 'Mailbox Send Review Acknowledged',
      summary: [review.review_status, review.focus_kind, review.focus_ref].filter(Boolean).join(' / ') || 'mailbox send review acknowledged',
      source_ref: review.review_id,
      focus_kind: 'mailbox_send_review',
      focus_ref: review.review_id,
      principal_id: review.recorded_by_principal_id,
    });
  }
  for (const review of operationFocusReviews || []) {
    push({
      activity_id: `operation_focus_review:${review.review_id}`,
      activity_kind: 'operation_focus_review_acknowledgement',
      occurred_at: review.recorded_at || review.generated_at,
      title: 'Operation Focus Reviewed',
      summary: [review.review_status, review.focus_kind, review.focus_ref].filter(Boolean).join(' / ') || 'operation focus reviewed',
      source_ref: review.review_id,
      focus_kind: 'operation_focus_review',
      focus_ref: review.review_id,
      principal_id: review.recorded_by_principal_id,
    });
  }
  for (const proposal of siteFileChangeProposals || []) {
    push({
      activity_id: `site_file_change_proposal:${proposal.proposal_id}`,
      activity_kind: 'site_file_change_proposal',
      occurred_at: proposal.recorded_at || proposal.generated_at,
      title: 'Site File Change Proposal',
      summary: [proposal.proposal_summary, proposal.file_count == null ? null : String(proposal.file_count) + ' file(s)'].filter(Boolean).join(' / ') || 'site file change proposal recorded',
      source_ref: proposal.proposal_id,
      focus_kind: 'site_file_change_proposal',
      focus_ref: proposal.proposal_id,
      principal_id: proposal.recorded_by_principal_id,
    });
  }
  for (const request of localIngressRequests || []) {
    push({
      activity_id: `local_ingress_request:${request.local_ingress_request_id}`,
      activity_kind: 'local_ingress_request',
      occurred_at: request.recorded_at || request.generated_at,
      title: 'Local Ingress Request',
      summary: [request.local_execution_admission, request.requested_action_ref, request.target_authority_locus].filter(Boolean).join(' / ') || 'local ingress request queued',
      source_ref: request.local_ingress_request_id,
      focus_kind: 'local_ingress_request',
      focus_ref: request.local_ingress_request_id,
      principal_id: request.recorded_by_principal_id,
    });
  }
  for (const evidence of localIngressEvidence || []) {
    push({
      activity_id: `local_ingress_evidence:${evidence.local_ingress_evidence_id}`,
      activity_kind: 'local_ingress_evidence',
      occurred_at: evidence.recorded_at || evidence.generated_at,
      title: 'Local Ingress Evidence',
      summary: [evidence.local_execution_status, evidence.local_filesystem_mutation_admission, evidence.local_executor_authority].filter(Boolean).join(' / ') || 'local ingress evidence recorded',
      source_ref: evidence.local_ingress_evidence_id,
      focus_kind: 'local_ingress_evidence',
      focus_ref: evidence.local_ingress_evidence_id,
      principal_id: evidence.recorded_by_principal_id,
    });
  }
  for (const heartbeat of localIngressProviderHeartbeats || []) {
    push({
      activity_id: `local_ingress_provider_heartbeat:${heartbeat.local_ingress_provider_heartbeat_id}`,
      activity_kind: 'local_ingress_provider_heartbeat',
      occurred_at: heartbeat.recorded_at || heartbeat.last_run_at || heartbeat.generated_at,
      title: 'Local Ingress Provider Heartbeat',
      summary: [heartbeat.status, heartbeat.provider_id, heartbeat.provider_authority].filter(Boolean).join(' / ') || 'local ingress provider liveness recorded',
      source_ref: heartbeat.local_ingress_provider_heartbeat_id,
      focus_kind: 'local_ingress_provider_heartbeat',
      focus_ref: heartbeat.local_ingress_provider_heartbeat_id,
      principal_id: heartbeat.recorded_by_principal_id,
    });
  }
  for (const request of repositoryPublicationRequests || []) {
    push({
      activity_id: `repository_publication_request:${request.repository_publication_request_id}`,
      activity_kind: 'repository_publication_request',
      occurred_at: request.recorded_at || request.generated_at,
      title: 'Repository Publication Request',
      summary: [request.repository_publication_admission, request.publication_ref, request.repository_ref].filter(Boolean).join(' / ') || 'repository publication request queued',
      source_ref: request.repository_publication_request_id,
      focus_kind: 'repository_publication_request',
      focus_ref: request.repository_publication_request_id,
      principal_id: request.recorded_by_principal_id,
    });
  }
  for (const evidence of repositoryPublicationEvidence || []) {
    push({
      activity_id: `repository_publication_evidence:${evidence.repository_publication_evidence_id}`,
      activity_kind: 'repository_publication_evidence',
      occurred_at: evidence.recorded_at || evidence.generated_at,
      title: 'Repository Publication Evidence',
      summary: [evidence.publication_status, evidence.windows_admission_action, evidence.published_commit_ref].filter(Boolean).join(' / ') || 'repository publication evidence recorded',
      source_ref: evidence.repository_publication_evidence_id,
      focus_kind: 'repository_publication_evidence',
      focus_ref: evidence.repository_publication_evidence_id,
      principal_id: evidence.recorded_by_principal_id,
    });
  }
  for (const heartbeat of repositoryPublicationProviderHeartbeats || []) {
    push({
      activity_id: `repository_publication_provider_heartbeat:${heartbeat.repository_publication_provider_heartbeat_id}`,
      activity_kind: 'repository_publication_provider_heartbeat',
      occurred_at: heartbeat.recorded_at || heartbeat.last_run_at || heartbeat.generated_at,
      title: 'Repository Publication Provider Heartbeat',
      summary: [heartbeat.status, heartbeat.provider_id, heartbeat.provider_authority].filter(Boolean).join(' / ') || 'repository publication provider liveness recorded',
      source_ref: heartbeat.repository_publication_provider_heartbeat_id,
      focus_kind: 'repository_publication_provider_heartbeat',
      focus_ref: heartbeat.repository_publication_provider_heartbeat_id,
      principal_id: heartbeat.recorded_by_principal_id,
    });
  }
  for (const decision of residentDispatchDecisions || []) {
    push({
      activity_id: `resident_dispatch:${decision.dispatch_decision_id}`,
      activity_kind: 'resident_dispatch_decision',
      occurred_at: decision.recorded_at || decision.session_start?.started_at,
      title: 'Resident Dispatch',
      summary: [decision.decision_state, decision.dispatch_action, decision.fallback_status].filter(Boolean).join(' / ') || 'dispatch decision recorded',
      source_ref: decision.dispatch_decision_id || decision.carrier_session_id,
      focus_kind: 'resident_dispatch_decision',
      focus_ref: decision.dispatch_decision_id || decision.carrier_session_id,
      principal_id: decision.recorded_by_principal_id,
    });
  }
  const sorted = items.sort((left, right) => {
    const timeCompare = String(right.occurred_at || '').localeCompare(String(left.occurred_at || ''));
    return timeCompare || String(right.activity_id).localeCompare(String(left.activity_id));
  });
  return {
    schema: 'narada.cloudflare_operation_activity_timeline.v1',
    operation_id: operationId,
    activity_count: sorted.length,
    latest_activity: sorted[0] ?? null,
    items: sorted.slice(0, 100),
  };
}

function summarizeCloudflareCarrierEvidenceReadStatus({ sessions = [], carrierEvidence = [], params = {} } = {}) {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const sessionIds = sessionList.map((session) => session.carrier_session_id).filter(Boolean);
  const boundedSessionOffset = clampInteger(params.session_offset, 0, sessionIds.length, 0);
  const boundedSessionLimit = clampInteger(params.session_limit, 0, 50, 25);
  const attemptedSessionIds = sessionIds.slice(boundedSessionOffset, boundedSessionOffset + boundedSessionLimit);
  const evidenceBySession = new Map(evidenceGroups.map((entry) => [entry?.carrier_session_id, entry]).filter(([id]) => Boolean(id)));
  const missingSessionIds = attemptedSessionIds.filter((sessionId) => !evidenceBySession.has(sessionId));
  const nextSessionOffset = boundedSessionOffset + attemptedSessionIds.length;
  const truncatedSessionCount = Math.max(0, sessionIds.length - nextSessionOffset);
  const failed = evidenceGroups.filter((entry) => entry?.ok !== true);
  const readable = evidenceGroups.filter((entry) => entry?.ok === true);
  const eventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group?.events) ? group.events.length : 0), 0);
  const state = sessionIds.length === 0
    ? 'no_sessions'
    : (failed.length > 0 || missingSessionIds.length > 0 ? 'degraded' : truncatedSessionCount > 0 ? 'partial' : 'loaded');
  return {
    schema: 'narada.cloudflare_carrier_evidence_read_status.v1',
    state,
    session_count: sessionIds.length,
    attempted_session_count: attemptedSessionIds.length,
    readable_session_count: readable.length,
    failed_session_count: failed.length,
    missing_session_count: missingSessionIds.length,
    truncated_session_count: truncatedSessionCount,
    session_read_offset: boundedSessionOffset,
    session_read_limit: boundedSessionLimit,
    next_session_offset: truncatedSessionCount > 0 ? nextSessionOffset : null,
    event_count: eventCount,
    missing_session_ids: missingSessionIds,
    failures: failed.map((entry) => ({
      carrier_session_id: entry.carrier_session_id ?? null,
      error: entry.error ?? 'carrier_evidence_read_failed',
    })),
  };
}

function summarizeCloudflarePersistencePosture(env = {}, {
  siteId = null,
  operation = null,
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  continuityPackets = [],
  continuityLoopReports = [],
  continuityReconciliationExecutions = [],
  operationFocusReviews = [],
  carrierEvidenceReadStatus = null,
} = {}) {
  const hasCarrierSessions = Boolean(env.CLOUDFLARE_CARRIER_SESSIONS);
  const hasSiteRegistry = Boolean(env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB);
  const hasTaskStore = Boolean(env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB);
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const taskList = Array.isArray(tasks) ? tasks : [];
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const continuityPacketList = Array.isArray(continuityPackets) ? continuityPackets : [];
  const continuityLoopReportList = Array.isArray(continuityLoopReports) ? continuityLoopReports : [];
  const continuityReconciliationExecutionList = Array.isArray(continuityReconciliationExecutions) ? continuityReconciliationExecutions : [];
  const operationFocusReviewList = Array.isArray(operationFocusReviews) ? operationFocusReviews : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group?.events) ? group.events.length : 0), 0);
  const durableBoundaries = [
    { key: 'session_snapshot', substrate: 'cloudflare_durable_object_storage', status: hasCarrierSessions ? 'available' : 'missing', authority: 'carrier_session_ordered_lane' },
    { key: 'site_registry', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'site_membership_operation_authority' },
    { key: 'carrier_evidence_index', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'reconstructable_carrier_evidence_projection' },
    { key: 'site_continuity_packet_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'local_cloud_continuity_packet_projection' },
    { key: 'site_continuity_loop_report_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'cloudflare_site_continuity_loop_report' },
    { key: 'site_continuity_reconciliation_execution_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'cloudflare_site_continuity_reconciliation_execution' },
    { key: 'operation_focus_review_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: CLOUDFLARE_OPERATION_FOCUS_REVIEW_AUTHORITY },
    { key: 'site_file_materialization_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: 'cloudflare_site_file_materialization_record' },
    { key: 'local_ingress_request_queue', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY },
    { key: 'repository_publication_request_queue', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY },
    { key: 'repository_publication_evidence_store', substrate: 'cloudflare_d1_site_registry', status: hasSiteRegistry ? 'available' : 'missing', authority: CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_AUTHORITY },
    { key: 'task_lifecycle_store', substrate: 'cloudflare_d1_task_store', status: hasTaskStore ? 'available' : 'missing', authority: 'task_lifecycle_projection' },
  ];
  const missing = durableBoundaries.filter((boundary) => boundary.status !== 'available').map((boundary) => boundary.key);
  const warnings = [];
  if (sessionList.length > 0 && evidenceEventCount === 0) warnings.push('session_without_replayed_evidence');
  if (taskList.length > 0 && !hasTaskStore) warnings.push('task_projection_without_task_store_binding');
  if (carrierEvidenceReadStatus?.state === 'degraded') warnings.push('carrier_evidence_replay_degraded');
  const state = missing.length > 0
    ? 'incomplete'
    : (warnings.length > 0 ? 'degraded' : 'durable');
  return {
    schema: 'narada.cloudflare_persistence_posture.v1',
    site_id: siteId ?? operation?.site_id ?? null,
    operation_id: operation?.operation_id ?? null,
    state,
    durable_boundary_count: durableBoundaries.length,
    active_boundary_count: durableBoundaries.length - missing.length,
    missing_boundaries: missing,
    warnings,
    durable_boundaries: durableBoundaries,
    session_count: sessionList.length,
    task_count: taskList.length,
    carrier_evidence_group_count: evidenceGroups.length,
    carrier_evidence_event_count: evidenceEventCount,
    continuity_packet_count: continuityPacketList.length,
    continuity_loop_report_count: continuityLoopReportList.length,
    continuity_reconciliation_execution_count: continuityReconciliationExecutionList.length,
    operation_focus_review_count: operationFocusReviewList.length,
    evidence_read_state: carrierEvidenceReadStatus?.state ?? 'unknown',
    carrier_evidence_truncated_session_count: carrierEvidenceReadStatus?.truncated_session_count ?? 0,
    next_action: missing[0] ?? warnings[0] ?? 'monitor_persistence_posture',
  };
}

function summarizeCloudflareRecoveryPosture({
  persistencePosture = null,
  sessions = [],
  carrierEvidence = [],
  carrierEvidenceReadStatus = null,
  residentDispatchWindowsFallbackEvidence = [],
  operation = null,
  siteId = null,
} = {}) {
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const localResidentSessionInhabitanceCount = cloudflareOperationLocalResidentSessionInhabitanceCount(operation?.operation_id ?? null, {
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
  });
  const localResidentOnlyCarrierEvidenceGap = sessionList.length === 0 && localResidentSessionInhabitanceCount > 0;
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group?.events) ? group.events.length : 0), 0);
  const evidenceSources = [...new Set(evidenceGroups.map((group) => group?.source).filter(Boolean))];
  const evidenceSessionIds = new Set(evidenceGroups.filter((group) => group?.ok === true && (group.events || []).length > 0).map((group) => group.carrier_session_id));
  const missingEvidenceSessionIds = Array.isArray(carrierEvidenceReadStatus?.missing_session_ids)
    ? carrierEvidenceReadStatus.missing_session_ids
    : sessionList.map((session) => session.carrier_session_id).filter((sessionId) => sessionId && !evidenceSessionIds.has(sessionId));
  const sessionSnapshotBoundary = (persistencePosture?.durable_boundaries || []).find((boundary) => boundary.key === 'session_snapshot');
  const evidenceIndexBoundary = (persistencePosture?.durable_boundaries || []).find((boundary) => boundary.key === 'carrier_evidence_index');
  const recoveryBoundaries = (persistencePosture?.durable_boundaries || []).map((boundary) => ({
    key: boundary.key,
    substrate: boundary.substrate,
    status: boundary.status === 'available' ? 'recoverable' : 'unavailable',
    authority: boundary.authority,
  }));
  const unavailableRecoveryBoundaries = recoveryBoundaries.filter((boundary) => boundary.status !== 'recoverable').map((boundary) => boundary.key);
  const snapshotReload = sessionSnapshotBoundary?.status === 'available' ? 'available' : 'unavailable';
  const evidenceReplay = localResidentOnlyCarrierEvidenceGap && evidenceGroups.length === 0
    ? 'not_admitted_to_cloudflare_carrier_session'
    : carrierEvidenceReadStatus?.state ?? (evidenceGroups.length > 0 ? 'loaded' : 'unknown');
  const gaps = [];
  if (snapshotReload !== 'available') gaps.push('session_snapshot_reload_unavailable');
  if (evidenceIndexBoundary?.status !== 'available') gaps.push('carrier_evidence_index_unavailable');
  for (const boundary of unavailableRecoveryBoundaries) gaps.push(`${boundary}_recovery_unavailable`);
  if (sessionList.length > 0 && evidenceEventCount === 0) gaps.push('no_replayed_evidence');
  if (localResidentOnlyCarrierEvidenceGap && evidenceEventCount === 0) gaps.push('local_resident_carrier_evidence_not_admitted');
  if (missingEvidenceSessionIds.length > 0) gaps.push('session_evidence_missing');
  if (carrierEvidenceReadStatus?.state === 'degraded') gaps.push('carrier_evidence_replay_degraded');
  const state = gaps.length === 0
    ? (sessionList.length > 0 ? 'reconstructable' : 'ready_no_sessions')
    : localResidentOnlyCarrierEvidenceGap
      ? 'local_resident_inhabitance_not_replayable'
      : (snapshotReload === 'available' && evidenceEventCount > 0 ? 'partially_reconstructable' : 'not_reconstructable');
  return {
    schema: 'narada.cloudflare_recovery_posture.v1',
    site_id: siteId ?? operation?.site_id ?? persistencePosture?.site_id ?? null,
    operation_id: operation?.operation_id ?? persistencePosture?.operation_id ?? null,
    state,
    snapshot_reload: snapshotReload,
    evidence_replay: evidenceReplay,
    evidence_sources: evidenceSources,
    recovery_boundary_count: recoveryBoundaries.length,
    recoverable_boundary_count: recoveryBoundaries.length - unavailableRecoveryBoundaries.length,
    recovery_boundaries: recoveryBoundaries,
    recovery_gaps: gaps,
    missing_evidence_session_ids: missingEvidenceSessionIds,
    truncated_evidence_session_count: carrierEvidenceReadStatus?.truncated_session_count ?? 0,
    session_count: sessionList.length,
    local_resident_session_inhabitance_count: localResidentSessionInhabitanceCount,
    local_resident_only_carrier_evidence_gap: localResidentOnlyCarrierEvidenceGap,
    evidence_session_count: evidenceSessionIds.size,
    evidence_event_count: evidenceEventCount,
    next_action: gaps[0] ?? 'monitor_recovery_posture',
  };
}

function summarizeCloudflareSiteProductStatus({
  site = null,
  operations = [],
  memberships = [],
  authorityEvents = [],
  sessions = [],
  tasks = [],
  carrierEvidence = [],
  carrierEvidenceReadStatus = null,
  continuityStatus = null,
  continuityLoopStatus = null,
  continuityReconciliationExecutionStatus = null,
  operationContinuityDirectionStatus = null,
  operationPostureOverview = null,
  focusedOperationLifecycle = null,
} = {}) {
  const operationList = Array.isArray(operations) ? operations : [];
  const membershipList = Array.isArray(memberships) ? memberships : [];
  const authorityEventList = Array.isArray(authorityEvents) ? authorityEvents : [];
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const taskList = Array.isArray(tasks) ? tasks : [];
  const evidenceGroups = Array.isArray(carrierEvidence) ? carrierEvidence : [];
  const evidenceEventCount = evidenceGroups.reduce((count, group) => count + (Array.isArray(group.events) ? group.events.length : 0), 0);
  const activeOperationCount = operationList.filter((operation) => String(operation.status ?? '').toLowerCase() === 'active').length;
  const activeMembershipCount = membershipList.filter((membership) => String(membership.status ?? '').toLowerCase() === 'active').length;
  const openTaskCount = taskList.filter((task) => !['done', 'closed', 'cancelled'].includes(String(task.status ?? '').toLowerCase())).length;
  const continuityState = continuityStatus?.state ?? 'unknown';
  const continuityLoopState = continuityLoopStatus?.state ?? 'unknown';
  const continuityLoopFreshnessState = continuityLoopStatus?.freshness_state ?? 'unknown';
  const continuityReconciliationExecutionState = continuityReconciliationExecutionStatus?.state ?? 'unknown';
  const continuityDirectionState = operationContinuityDirectionStatus?.state ?? 'unknown';
  const missing = [];
  if (activeMembershipCount === 0) missing.push('active_membership');
  if (operationList.length === 0) missing.push('operation');
  if (sessionList.length === 0) missing.push('session');
  if (evidenceEventCount === 0) missing.push('carrier_evidence');
  if (continuityState !== 'packet_observed') missing.push('continuity_packet');
  const attention = [];
  if (operationPostureOverview?.next_status === 'needs_attention') attention.push('operation_posture');
  if (continuityState === 'packet_observed' && continuityDirectionState !== 'bidirectional_packets_observed') attention.push('continuity_direction');
  if (continuityState === 'packet_observed' && continuityLoopState !== 'loop_report_observed') attention.push('continuity_loop_report');
  if (continuityState === 'packet_observed' && continuityLoopState === 'loop_report_observed' && ['stale', 'failed', 'unknown'].includes(continuityLoopFreshnessState)) attention.push('continuity_loop_freshness');
  if (continuityReconciliationExecutionState === 'reconciliation_execution_observed' && continuityReconciliationExecutionStatus?.health === 'attention') attention.push('continuity_reconciliation_execution');
  if (carrierEvidenceReadStatus?.state === 'degraded') attention.push('carrier_evidence_read_degraded');
  if (openTaskCount > 0) attention.push('open_tasks');
  const health = missing.length === 0 && attention.length === 0
    ? 'ready'
    : (activeMembershipCount === 0 || operationList.length === 0 || sessionList.length === 0 || evidenceEventCount === 0 ? 'incomplete' : 'attention');
  return {
    schema: 'narada.cloudflare_site_product_status.v1',
    site_id: site?.site_id ?? continuityStatus?.site_id ?? null,
    site_status: site?.status ?? 'unknown',
    health,
    missing,
    attention,
    operation_count: operationList.length,
    active_operation_count: activeOperationCount,
    membership_count: membershipList.length,
    active_membership_count: activeMembershipCount,
    session_count: sessionList.length,
    task_count: taskList.length,
    open_task_count: openTaskCount,
    carrier_evidence_group_count: evidenceGroups.length,
    carrier_evidence_event_count: evidenceEventCount,
    carrier_evidence_read_status: carrierEvidenceReadStatus,
    authority_event_count: authorityEventList.length,
    continuity_state: continuityState,
    continuity_direction_state: continuityDirectionState,
    continuity_direction_missing: operationContinuityDirectionStatus?.missing_directions ?? [],
    operation_continuity_direction_status: operationContinuityDirectionStatus,
    continuity_loop_state: continuityLoopState,
    continuity_packet_count: continuityStatus?.packet_count ?? 0,
    continuity_loop_report_count: continuityLoopStatus?.report_count ?? 0,
    continuity_reconciliation_execution_count: continuityReconciliationExecutionStatus?.execution_count ?? 0,
    continuity_reconciliation_execution_state: continuityReconciliationExecutionState,
    site_continuity_reconciliation_execution_status: continuityReconciliationExecutionStatus,
    continuity_loop_freshness_state: continuityLoopFreshnessState,
    continuity_loop_report_age_ms: continuityLoopStatus?.latest_report_age_ms ?? null,
    site_continuity_loop_status: continuityLoopStatus,
    next_action: missing[0] ?? cloudflareSiteProductAttentionAction(attention, {
      operationPostureOverview,
      operationContinuityDirectionStatus,
      continuityLoopStatus,
      continuityReconciliationExecutionStatus,
    }),
    focused_operation_id: focusedOperationLifecycle?.operation_id ?? null,
  };
}

function normalizeCloudflareSiteProductStatus(status = null, operationPostureOverview = null, focusedOperationLifecycle = null) {
  if (status?.schema !== 'narada.cloudflare_site_product_status.v1') return status;
  if (operationPostureOverview?.next_status !== 'needs_attention') return status;
  const attention = Array.isArray(status.attention) ? status.attention : [];
  const operationReason = operationPostureOverview?.next_reason || focusedOperationLifecycle?.workflow_route?.reason || 'operation_posture';
  const normalizedAttention = attention.includes('operation_posture') ? attention : ['operation_posture', ...attention];
  return {
    ...status,
    health: status.health === 'incomplete' ? 'incomplete' : 'attention',
    attention: normalizedAttention,
    next_action: cloudflareSiteProductAttentionAction(normalizedAttention, {
      operationPostureOverview,
      operationContinuityDirectionStatus: status.operation_continuity_direction_status,
      continuityLoopStatus: status.site_continuity_loop_status,
      continuityReconciliationExecutionStatus: status.site_continuity_reconciliation_execution_status,
    }),
    focused_operation_id: focusedOperationLifecycle?.operation_id ?? status.focused_operation_id ?? null,
    operation_posture_reason: operationReason,
  };
}

function summarizeCloudflareProductSurfaceReadiness({
  siteProductStatus = null,
  persistencePosture = null,
  recoveryPosture = null,
  localCloudContinuityBridge = null,
} = {}) {
  const requiredChecks = [
    {
      key: 'site_product_status',
      status: siteProductStatus?.health === 'ready' ? 'ready' : siteProductStatus?.health === 'attention' ? 'attention' : 'incomplete',
      evidence: siteProductStatus?.schema ?? null,
      next_action: siteProductStatus?.next_action ?? 'read_site_product_status',
    },
    {
      key: 'persistence_posture',
      status: persistencePosture?.state === 'durable' ? 'ready' : 'incomplete',
      evidence: persistencePosture?.schema ?? null,
      next_action: persistencePosture?.next_action ?? 'inspect_persistence_posture',
    },
    {
      key: 'recovery_posture',
      status: recoveryPosture?.state === 'reconstructable' ? 'ready' : 'incomplete',
      evidence: recoveryPosture?.schema ?? null,
      next_action: recoveryPosture?.next_action ?? 'inspect_recovery_posture',
    },
    {
      key: 'local_cloud_continuity_bridge',
      status: localCloudContinuityBridge?.state === 'bidirectional_packets_observed' ? 'ready' : 'attention',
      evidence: localCloudContinuityBridge?.schema ?? null,
      next_action: localCloudContinuityBridge?.next_action ?? 'observe_continuity_packet',
    },
  ];
  const incomplete = requiredChecks.filter((check) => check.status === 'incomplete');
  const attention = requiredChecks.filter((check) => check.status === 'attention');
  const nextCheck = incomplete[0] ?? attention[0] ?? null;
  const status = incomplete.length > 0 ? 'incomplete' : attention.length > 0 ? 'attention' : 'ready';
  return {
    schema: 'narada.cloudflare_product_surface_readiness.v1',
    status,
    coverage: 'cloudflare_product_surface_worker_visible_boundaries',
    full_product_gate_command: 'pnpm cloudflare:product:readiness',
    full_product_gate_coverage: 'operator_host_cloudflare_worker_and_local_windows_schedulers',
    site_id: siteProductStatus?.site_id ?? localCloudContinuityBridge?.site_id ?? null,
    required_checks: requiredChecks,
    required_failure_count: incomplete.length,
    attention_count: attention.length,
    next_action: nextCheck?.next_action ?? 'monitor_product_surface_readiness',
    next_check: nextCheck?.key ?? null,
  };
}

function boundedContinuityPacketReadLimit(value = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.max(1, Math.min(500, Math.trunc(numeric)));
}

async function ensureCloudflareContinuityPacketSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_packets (
    packet_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    relation_id TEXT,
    source_embodiment_kind TEXT NOT NULL,
    target_embodiment_kind TEXT NOT NULL,
    admission_action TEXT NOT NULL,
    admission_reason TEXT NOT NULL,
    packet_json TEXT NOT NULL,
    imported_by_principal_id TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_continuity_packets_site_idx ON cloudflare_site_continuity_packets(site_id, imported_at)').run();
}

async function ensureCloudflareContinuityLoopReportSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_loop_reports (
    report_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL,
    generated_at TEXT,
    cloudflare_source TEXT,
    cloudflare_push_status TEXT,
    windows_packet_count INTEGER NOT NULL,
    cloudflare_credential_source TEXT,
    report_json TEXT NOT NULL,
    recorded_by_principal_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_continuity_loop_reports_site_idx ON cloudflare_site_continuity_loop_reports(site_id, recorded_at)').run();
}

async function ensureCloudflareContinuityReconciliationExecutionSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_site_continuity_reconciliation_executions (
    execution_id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    status TEXT NOT NULL,
    generated_at TEXT,
    persisted_at TEXT,
    reconciliation_plan_status TEXT,
    selected_site_count INTEGER NOT NULL,
    executed_site_count INTEGER NOT NULL,
    completed_site_count INTEGER NOT NULL,
    failed_site_count INTEGER NOT NULL,
    refusal_reason TEXT,
    execution_json TEXT NOT NULL,
    recorded_by_principal_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_site_continuity_reconciliation_executions_site_idx ON cloudflare_site_continuity_reconciliation_executions(site_id, recorded_at)').run();
}

async function validateCarrierSiteBindingForRequest(body, principal, env = {}) {
  if (body?.operation !== 'session.start') return null;
  const registry = createCloudflareSiteRegistryAdapter(env);
  if (!registry) return null;
  const params = body.params ?? {};
  return registry.validateCarrierSiteBinding({
    site_id: params.site_id,
    site_ref: params.site_ref ?? params.site_root,
    operation_id: params.operation_id,
    carrier_session_id: params.carrier_session_id ?? body.carrier_session_id,
    agent_id: params.agent_id,
    principal,
    request_id: body.request_id,
  });
}

function validateCarrierSessionAuthorityForRequest(body, env = {}) {
  if (!cloudflareCarrierSessionMutates(body?.operation)) return null;
  const params = body.params ?? {};
  const siteId = params.site_id ?? body.site_id ?? 'unknown-site';
  return classifyCloudflareSiteAuthority(env, siteId, SITE_MUTATION_CLASSES.HOSTED_CARRIER_SESSION_EVENTS).decision;
}

export const cloudflareProductOperationRegistry = createCloudflareProductOperationRegistry({
  dispatch: ({ body, principal, env, operation }) => handleSiteProductApiRequestLegacy(
    { ...body, operation },
    principal,
    env,
  ),
});

const cloudflareCarrierHttpRouter = createCloudflareCarrierHttpRouter({
  authenticateCarrierApiRequest,
  isSiteProductOperation,
  handleSiteProductApiRequest,
  routeCarrierSessionRequest,
  withPrincipalEvidence,
  jsonResponse,
});

export async function handleCloudflareWorkerRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/auth/')) {
    return handleOperatorAuthRequest(request, env);
  }
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/console')) {
    return htmlResponse(renderCloudflareOperatorConsoleAsset().body);
  }
  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true, carrier_kind: 'cloudflare-carrier', product_surface: 'web-console' });
  }
  if (url.pathname === '/api/intelligence') {
    if (request.method !== 'POST') return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
    const auth = await authenticateCarrierApiRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);
    const result = await executeCloudflareIntelligenceManagement(await request.json(), auth.principal, env);
    return jsonResponse(result.body, result.status);
  }
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'method_not_allowed' }, 405);
  }
  if (url.pathname !== '/' && url.pathname !== '/api/carrier' && url.pathname !== '/control') {
    return jsonResponse({ ok: false, code: 'not_found' }, 404);
  }
  return handleCarrierApiRequest(request, env);
}

export async function handleCloudflareScheduled(controller, env, ctx) {
  const run = runCloudflareWebhookDelayScheduledSourceRead(env, {
    cron: controller?.cron ?? null,
    scheduled_time: controller?.scheduledTime ? new Date(controller.scheduledTime).toISOString() : new Date().toISOString(),
    trigger_kind: 'cloudflare_cron',
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(run);
  else await run;
}

export default {
  fetch: handleCloudflareWorkerRequest,
  scheduled: handleCloudflareScheduled,
};

async function handleCarrierApiRequest(request, env) {
  return cloudflareCarrierHttpRouter(request, env);
}

async function routeCarrierSessionRequest(requestUrl, body, principal, env) {
    const carrierSessionId = body.carrier_session_id ?? body.params?.carrier_session_id;
    if (!carrierSessionId) return { status: 400, body: { ok: false, code: 'missing_carrier_session_id' } };
    if (!env?.CLOUDFLARE_CARRIER_SESSIONS) {
      return { status: 500, body: { ok: false, code: 'missing_durable_object_binding' } };
    }
    const registryAdmission = await validateCarrierSiteBindingForRequest(body, principal, env);
    if (registryAdmission?.ok === false) {
      return { status: 403, body: {
        ok: false,
        code: 'carrier_site_binding_denied',
        site_registry_code: registryAdmission.code,
        site_registry_reason: registryAdmission.reason ?? registryAdmission.code,
      } };
    }
    const sessionAuthorityDecision = validateCarrierSessionAuthorityForRequest(body, env);
    if (sessionAuthorityDecision && sessionAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
      return { status: 403, body: {
        ok: false,
        code: 'site_authority_route_denied',
        operation: body.operation,
        site_authority_decision: sessionAuthorityDecision,
      } };
    }
    const routedBody = (registryAdmission?.evidence || sessionAuthorityDecision)
      ? {
          ...body,
          params: {
            ...(body.params ?? {}),
            ...(registryAdmission?.evidence ? { site_binding_evidence: registryAdmission.evidence } : {}),
            ...(sessionAuthorityDecision ? { site_authority_decision: sessionAuthorityDecision } : {}),
          },
        }
      : body;
    const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
    const authenticatedRequest = new Request(requestUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...routedBody, principal }),
    });
    const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(authenticatedRequest);
    const responseBody = await durableResponse.json();
    return { status: durableResponse.status, body: responseBody };
}

function isSiteProductOperation(operation) {
  return cloudflareProductOperationRegistry.has(operation);
}

function cloudflareSiteAuthorityMap(env = {}, siteId = 'unknown-site') {
  return createCloudflareSiteAuthorityMap({
    site_id: siteId,
    cloudflare_carrier_authority_locus: env.CLOUDFLARE_CARRIER_AUTHORITY_LOCUS ?? 'cloudflare-carrier',
    local_windows_authority_locus: env.NARADA_LOCAL_WINDOWS_AUTHORITY_LOCUS ?? 'local-windows-site-authority',
    task_artifact_authority_locus: env.CLOUDFLARE_CARRIER_TASK_AUTHORITY_LOCUS ?? 'cloudflare-carrier-task-store',
  });
}

function classifyCloudflareSiteAuthority(env = {}, siteId = 'unknown-site', mutationClass) {
  const map = cloudflareSiteAuthorityMap(env, siteId);
  const decision = classifySiteAuthorityRequest(map, {
    mutation_class: mutationClass,
    embodiment_kind: SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
  });
  return { map, decision };
}

function cloudflareSiteAuthorityReadModel(env = {}, siteId = 'unknown-site') {
  const map = cloudflareSiteAuthorityMap(env, siteId);
  return {
    map,
    decisions: map.entries.map((entry) => classifySiteAuthorityRequest(map, {
      mutation_class: entry.mutation_class,
      embodiment_kind: SITE_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    })),
  };
}

function cloudflareSiteContinuityReadModel(env = {}, siteId = 'unknown-site') {
  const binding = createSiteContinuityBinding({
    site_id: siteId,
    local_windows_site_ref: env.NARADA_LOCAL_WINDOWS_SITE_REF ?? 'local-windows-site',
    cloudflare_site_ref: env.CLOUDFLARE_SITE_REF ?? 'cloudflare-site',
    local_windows_authority_locus: env.NARADA_LOCAL_WINDOWS_AUTHORITY_LOCUS ?? 'local-windows-site-authority',
    cloudflare_authority_locus: env.CLOUDFLARE_CARRIER_AUTHORITY_LOCUS ?? 'cloudflare-carrier',
    authority_map_ref: env.CLOUDFLARE_SITE_AUTHORITY_MAP_REF ?? 'site-authority-map:v1',
  });
  const fromCloudflareToLocal = {
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    site_id: siteId,
  };
  const fromLocalToCloudflare = {
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    site_id: siteId,
  };
  const decisions = [
      classifySiteContinuityExchange(binding, {
        ...fromLocalToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.SITE_IDENTITY_BINDING,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.AUTHORITY_MAP_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromLocalToCloudflare,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.MUTATION_EVIDENCE_REFERENCE,
      }),
      classifySiteContinuityExchange(binding, {
        ...fromCloudflareToLocal,
        exchange_class: SITE_CONTINUITY_EXCHANGE_CLASSES.CROSS_EMBODIMENT_MUTATION_EXECUTION,
      }),
    ];
  const exchangePacket = createSiteContinuityExchangePacket({
    binding,
    source_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.CLOUDFLARE_CARRIER,
    target_embodiment_kind: SITE_CONTINUITY_EMBODIMENT_KINDS.LOCAL_WINDOWS,
    decisions,
    projections: [{
      projection_class: SITE_CONTINUITY_EXCHANGE_CLASSES.READ_MODEL_PROJECTION,
      source_cursor: 'cloudflare-site-read',
      summary: 'Cloudflare Site continuity read-model projection',
    }],
    evidence_refs: [],
  });
  return {
    binding,
    decisions,
    exchange_packet: exchangePacket,
    exchange_packet_admission: classifySiteContinuityExchangePacket(exchangePacket),
  };
}

function siteAuthorityDeniedBody(decision, operation) {
  return {
    ok: false,
    code: 'site_authority_route_denied',
    operation,
    site_authority_decision: decision,
  };
}

async function handleSiteProductApiRequest(body, principal, env = {}) {
  if (!cloudflareProductOperationRegistry.has(body?.operation)) {
    return {
      status: 404,
      body: {
        ok: false,
        code: 'cloudflare_operation_not_registered',
        operation: body?.operation ?? null,
      },
    };
  }
  return cloudflareProductOperationRegistry.dispatch(body.operation, { body, principal, env });
}

async function handleSiteProductApiRequestLegacy(body, principal, env = {}) {
  const registry = createCloudflareSiteRegistryAdapter(env);
  if (!registry) return { status: 500, body: { ok: false, code: 'missing_site_registry_binding' } };
  const params = body.params ?? {};
  const requestedSiteId = params.site_id ?? body.site_id ?? 'unknown-site';
  if (body.operation === 'resident_dispatch.primary_with_fallback.start') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await startCloudflareResidentDispatchWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_dispatch.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const dispatchDecisions = await listCloudflareResidentDispatchDecisions(env, requestedSiteId, params.resident_dispatch_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        dispatch_decisions: dispatchDecisions,
      },
    };
  }
  if (body.operation === 'task_lifecycle.write_admission.classify') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleWriteAdmission(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.write_admission.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const decisions = await listCloudflareTaskLifecycleWriteAdmissions(env, requestedSiteId, params.task_lifecycle_write_admission_limit ?? params.limit);
    const hasCloudflareTaskCreateAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_create'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskClaimAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_claim'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskReportAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_report'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskFinishAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_finish'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareChangedFileEvidenceAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'changed_file_evidence'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskProjectionWriteAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_projection_write'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskSourceStateWriteAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_source_state_write'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskAssignmentWriteAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_assignment_write'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskRoleResolutionWriteAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_role_resolution_write'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskRosterMutationWriteAdmission = decisions.some((decision) => {
      return decision.mutation_class === 'task_roster_mutation_write'
        && decision.admission_action === 'admit'
        && decision.mutation_authority === 'cloudflare_task_lifecycle_d1';
    });
    const hasCloudflareTaskLifecycleAdmission = hasCloudflareTaskCreateAdmission || hasCloudflareTaskClaimAdmission || hasCloudflareTaskReportAdmission || hasCloudflareTaskFinishAdmission || hasCloudflareChangedFileEvidenceAdmission || hasCloudflareTaskProjectionWriteAdmission || hasCloudflareTaskSourceStateWriteAdmission || hasCloudflareTaskAssignmentWriteAdmission || hasCloudflareTaskRoleResolutionWriteAdmission || hasCloudflareTaskRosterMutationWriteAdmission;
    const cloudflareWriteAdmission = hasCloudflareTaskRosterMutationWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted'
      : hasCloudflareTaskRoleResolutionWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted'
      : hasCloudflareTaskAssignmentWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted'
      : hasCloudflareTaskSourceStateWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted'
      : hasCloudflareTaskProjectionWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_and_projection_write_admitted'
      : hasCloudflareChangedFileEvidenceAdmission ? (hasCloudflareTaskFinishAdmission ? 'task_create_claim_report_finish_and_changed_file_evidence_admitted' : 'task_create_claim_report_and_changed_file_evidence_admitted')
      : hasCloudflareTaskFinishAdmission ? 'task_create_claim_report_and_finish_admitted'
      : hasCloudflareTaskReportAdmission ? 'task_create_claim_and_report_admitted'
      : hasCloudflareTaskClaimAdmission ? 'task_create_and_claim_admitted'
      : hasCloudflareTaskCreateAdmission ? 'task_create_admitted'
        : 'not_admitted';
    const writeEffect = hasCloudflareTaskRosterMutationWriteAdmission ? 'task_lifecycle_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation'
      : hasCloudflareTaskRoleResolutionWriteAdmission ? 'task_lifecycle_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution'
      : hasCloudflareTaskAssignmentWriteAdmission ? 'task_lifecycle_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment'
      : hasCloudflareTaskSourceStateWriteAdmission ? 'task_lifecycle_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state'
      : hasCloudflareTaskProjectionWriteAdmission ? 'task_lifecycle_create_claim_report_finish_changed_file_evidence_and_projection_write'
      : hasCloudflareChangedFileEvidenceAdmission ? (hasCloudflareTaskFinishAdmission ? 'task_lifecycle_create_claim_report_finish_and_changed_file_evidence' : 'task_lifecycle_create_claim_report_and_changed_file_evidence')
      : hasCloudflareTaskFinishAdmission ? 'task_lifecycle_create_claim_report_and_finish'
      : hasCloudflareTaskReportAdmission ? 'task_lifecycle_create_claim_and_report'
      : hasCloudflareTaskClaimAdmission ? 'task_lifecycle_create_and_claim'
      : hasCloudflareTaskCreateAdmission ? 'task_lifecycle_create'
        : 'none';
    const authorityPartition = hasCloudflareTaskRosterMutationWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_cloudflare_remaining_windows_effects'
      : hasCloudflareTaskRoleResolutionWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_cloudflare_remaining_windows_effects'
      : hasCloudflareTaskAssignmentWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_cloudflare_remaining_windows_effects'
      : hasCloudflareTaskSourceStateWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_cloudflare_remaining_windows_effects'
      : hasCloudflareTaskProjectionWriteAdmission ? 'task_create_claim_report_finish_changed_file_evidence_and_projection_write_cloudflare_remaining_windows'
      : hasCloudflareChangedFileEvidenceAdmission ? (hasCloudflareTaskFinishAdmission ? 'task_create_claim_report_finish_and_changed_file_evidence_cloudflare_remaining_windows' : 'task_create_claim_report_and_changed_file_evidence_cloudflare_remaining_windows')
      : hasCloudflareTaskFinishAdmission ? 'task_create_claim_report_and_finish_cloudflare_remaining_windows'
      : hasCloudflareTaskReportAdmission ? 'task_create_claim_and_report_cloudflare_remaining_windows'
      : hasCloudflareTaskClaimAdmission ? 'task_create_and_claim_cloudflare_remaining_windows'
      : hasCloudflareTaskCreateAdmission ? 'task_create_cloudflare_remaining_windows'
        : 'windows_all_observed_mutations';
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mutation_authority: hasCloudflareTaskLifecycleAdmission ? 'split_by_mutation_class' : 'windows_task_lifecycle_sqlite',
        cloudflare_write_admission: cloudflareWriteAdmission,
        write_effect: writeEffect,
        authority_partition: authorityPartition,
        decisions,
      },
    };
  }
  if (body.operation === 'task_lifecycle.task_create.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await createCloudflareTaskLifecycleTask(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_create_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.task_claim.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await claimCloudflareTaskLifecycleTask(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_claim_not_admitted' ? 403 : result.code === 'task_lifecycle_claim_conflict' ? 409 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.task_report.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await reportCloudflareTaskLifecycleTask(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_report_not_admitted' ? 403 : result.code === 'task_lifecycle_report_conflict' ? 409 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.task_finish.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await finishCloudflareTaskLifecycleTask(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_finish_not_admitted' ? 403 : result.code === 'task_lifecycle_finish_conflict' ? 409 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.changed_file_evidence.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareChangedFileEvidence(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'changed_file_evidence_not_admitted' ? 403 : result.code === 'changed_file_evidence_conflict' ? 409 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.projection_write.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleProjectionWrite(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_projection_write_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.source_state_write.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleSourceStateWrite(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_source_state_write_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.assignment_write.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleAssignmentWrite(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_assignment_write_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.role_resolution_write.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleRoleResolutionWrite(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_role_resolution_write_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.roster_mutation_write.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleRosterMutationWrite(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'task_lifecycle_roster_mutation_write_not_admitted' ? 403 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.task.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const tasks = await listCloudflareTaskLifecycleTasks(env, requestedSiteId, params.task_lifecycle_task_limit ?? params.limit, params);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mutation_authority: tasks.length > 0 ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
        mutation_class: 'task_create',
        cloudflare_write_admission: tasks.length > 0 ? 'admitted' : 'not_observed',
        tasks,
      },
    };
  }
  if (body.operation === 'webhook_delay.directive.dual_record.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayDirectiveDualRecord(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.directive.dual_record.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const directiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, requestedSiteId, params.webhook_delay_directive_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        directive_action: 'record_directive_emission_intent',
        directive_records: directiveRecords,
      },
    };
  }
  if (body.operation === 'webhook_delay.directive.primary_with_fallback.deliver') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await deliverCloudflareWebhookDelayDirectiveWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.directive.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const directiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, requestedSiteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
        fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
        delivery_action: 'cloudflare_carrier_input_deliver',
        directive_deliveries: directiveDeliveries,
      },
    };
  }
  if (body.operation === 'resident_loop.shadow_read.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareResidentLoopShadowRun(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_loop.shadow_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const loopRuns = await listCloudflareResidentLoopShadowRuns(env, requestedSiteId, params.resident_loop_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
        dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        loop_runs: loopRuns,
      },
    };
  }
  if (body.operation === 'mailbox.status_shadow.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareMailboxStatusShadowRead(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'mailbox.status_shadow.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const reads = await listCloudflareMailboxStatusShadowReads(env, requestedSiteId, params.mailbox_status_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_STATUS_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_status_authority: 'windows_mailbox_status_source',
        shadow_target_locus: 'cloudflare_carrier_site',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        reads,
      },
    };
  }
  if (body.operation === 'mailbox.status_source.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareMailboxStatusSource(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'graph_credentials_missing' ? 401 : 400, body: result };
  }
  if (body.operation === 'mailbox.status_source.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const reads = await listCloudflareMailboxStatusSourceReads(env, requestedSiteId, params.mailbox_status_source_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_STATUS_SOURCE_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_status_authority: reads.length > 0 ? CLOUDFLARE_MAILBOX_STATUS_SOURCE_AUTHORITY : 'not_observed',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        reads,
      },
    };
  }
  if (body.operation === 'mailbox.draft_reply_proposal.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareMailboxDraftReplyProposal(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'mailbox.draft_reply_proposal.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const proposals = await listCloudflareMailboxDraftReplyProposals(env, requestedSiteId, params.mailbox_draft_reply_proposal_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        proposal_authority: proposals.length > 0 ? CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_AUTHORITY : 'not_observed',
        mailbox_outlook_draft_create_admission: 'not_admitted',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        authority_partition: 'mailbox_draft_reply_proposal_cloudflare_recorded_outlook_draft_send_and_mutation_not_admitted',
        proposals,
      },
    };
  }
  if (body.operation === 'mailbox.outlook_draft.create') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await createCloudflareMailboxOutlookDraft(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'graph_credentials_missing' ? 401 : 400, body: result };
  }
  if (body.operation === 'mailbox.outlook_draft.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const drafts = await listCloudflareMailboxOutlookDraftCreates(env, requestedSiteId, params.mailbox_outlook_draft_create_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_outlook_draft_create_authority: drafts.length > 0 ? CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_AUTHORITY : 'not_observed',
        mailbox_outlook_draft_create_admission: drafts.length > 0 ? 'admitted' : 'not_observed',
        mailbox_send_admission: 'not_admitted',
        mailbox_mutation_admission: 'not_admitted',
        authority_partition: 'mailbox_outlook_draft_create_cloudflare_owned_send_and_other_mutation_not_admitted',
        drafts,
      },
    };
  }
  if (body.operation === 'mailbox.outlook_draft.send') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await sendCloudflareMailboxOutlookDraft(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'graph_credentials_missing' ? 401 : result.code?.startsWith?.('mailbox_send_requires') || result.code?.includes?.('admission') ? 403 : 400, body: result };
  }
  if (body.operation === 'mailbox.send_accepted.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const sends = await listCloudflareMailboxSendAcceptedRecords(env, requestedSiteId, params.mailbox_send_accepted_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_send_authority: sends.length > 0 ? CLOUDFLARE_MAILBOX_SEND_AUTHORITY : 'not_observed',
        mailbox_send_admission: sends.length > 0 ? 'admitted' : 'not_observed',
        mailbox_mutation_admission: 'not_admitted',
        delivery_confirmation_admission: 'not_admitted',
        authority_partition: sends.length > 0 ? 'mailbox_send_cloudflare_owned_delivery_not_confirmed_other_mutation_not_admitted' : 'mailbox_send_not_observed',
        sends,
      },
    };
  }
  if (body.operation === 'mailbox.send_confirmation.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareMailboxSendConfirmation(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'graph_credentials_missing' ? 401 : result.code?.startsWith?.('mailbox_send_confirmation') ? 403 : 400, body: result };
  }
  if (body.operation === 'mailbox.send_confirmation.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const confirmations = await listCloudflareMailboxSendConfirmations(env, requestedSiteId, params.mailbox_send_confirmation_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_send_confirmation_authority: confirmations.length > 0 ? CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_AUTHORITY : 'not_observed',
        delivery_confirmation_admission: confirmations.length > 0 ? 'admitted' : 'not_observed',
        mailbox_mutation_admission: 'not_admitted',
        authority_partition: confirmations.length > 0 ? 'mailbox_send_confirmation_cloudflare_owned_other_mutation_not_admitted' : 'mailbox_send_confirmation_not_observed',
        confirmations,
      },
    };
  }
  if (body.operation === 'mailbox.send_review.acknowledge') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareMailboxSendReview(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code?.startsWith?.('mailbox_send_review_requires') ? 403 : 400, body: result };
  }
  if (body.operation === 'mailbox.send_review.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const reviews = await listCloudflareMailboxSendReviews(env, requestedSiteId, params.mailbox_send_review_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        mailbox_send_review_authority: reviews.length > 0 ? CLOUDFLARE_MAILBOX_SEND_REVIEW_AUTHORITY : 'not_observed',
        review_admission: reviews.length > 0 ? 'admitted' : 'not_observed',
        mailbox_mutation_admission: 'not_admitted',
        authority_partition: reviews.length > 0 ? 'mailbox_send_review_cloudflare_operator_owned_mailbox_mutation_not_admitted' : 'mailbox_send_review_not_observed',
        reviews,
      },
    };
  }
  if (body.operation === 'operation_focus_review.acknowledge') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareOperationFocusReview(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : result.code === 'operation_focus_review_requires_existing_focus' ? 403 : 400, body: result };
  }
  if (body.operation === 'operation_focus_review.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const reviews = await listCloudflareOperationFocusReviews(env, requestedSiteId, params.operation_focus_review_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        operation_focus_review_authority: reviews.length > 0 ? CLOUDFLARE_OPERATION_FOCUS_REVIEW_AUTHORITY : 'not_observed',
        review_admission: reviews.length > 0 ? 'admitted' : 'not_observed',
        reviews,
      },
    };
  }
  if (body.operation === 'site_file_change_proposal.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareSiteFileChangeProposal(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'site_file_change_proposal.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const proposals = await listCloudflareSiteFileChangeProposals(env, requestedSiteId, params.site_file_change_proposal_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        proposal_authority: 'cloudflare_carrier_site',
        filesystem_executor_authority: 'windows_filesystem_executor',
        filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        authority_partition: 'site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned',
        proposals,
      },
    };
  }
  if (body.operation === 'site_file_materialization.admit') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareSiteFileMaterialization(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'site_file_materialization.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const materializations = await listCloudflareSiteFileMaterializations(env, requestedSiteId, params.site_file_materialization_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_SITE_FILE_MATERIALIZATION_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        site_file_materialization_authority: materializations.length > 0 ? 'cloudflare_carrier_site' : 'not_observed',
        cloudflare_site_file_materialization_admission: materializations.length > 0 ? 'admitted' : 'not_observed',
        filesystem_executor_authority: materializations.length > 0 ? 'cloudflare_site_file_store' : 'not_observed',
        windows_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        authority_partition: 'site_file_materialization_cloudflare_owned_windows_filesystem_and_publication_not_admitted',
        materializations,
      },
    };
  }
  if (body.operation === 'resident_dispatch.windows_fallback_request.create') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await createCloudflareResidentDispatchWindowsFallbackRequest(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_dispatch.windows_fallback_request.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const requests = await listCloudflareResidentDispatchWindowsFallbackRequests(
      env,
      requestedSiteId,
      params.resident_dispatch_windows_fallback_request_limit ?? params.limit,
      {
        operation_id: params.operation_id ?? null,
        dispatch_decision_id: params.dispatch_decision_id ?? null,
      },
    );
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_SCHEMA,
        status: requests.length > 0 ? 'selected' : 'not_observed',
        site_id: requestedSiteId,
        resident_dispatch_windows_fallback_request_authority: requests.length > 0 ? CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_AUTHORITY : 'not_observed',
        local_executor_authority: requests.length > 0 ? WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY : 'not_observed',
        local_execution_admission: requests.length > 0 ? 'pending_windows_admission' : 'not_observed',
        direct_cloudflare_session_start_admission: 'not_admitted',
        authority_partition: 'cloudflare_records_windows_resident_fallback_request_windows_executes_and_returns_evidence',
        requests,
      },
    };
  }
  if (body.operation === 'resident_dispatch.windows_fallback_evidence.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareResidentDispatchWindowsFallbackEvidence(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_dispatch.windows_fallback_evidence.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const evidence = await listCloudflareResidentDispatchWindowsFallbackEvidence(env, requestedSiteId, params);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_SCHEMA,
        status: evidence.length > 0 ? 'selected' : 'not_observed',
        site_id: requestedSiteId,
        resident_dispatch_windows_fallback_evidence_authority: evidence.length > 0 ? WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY : 'not_observed',
        cloudflare_evidence_store_authority: evidence.length > 0 ? CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_STORE_AUTHORITY : 'not_observed',
        local_session_start_admission: evidence[0]?.local_session_start_admission ?? 'not_observed',
        direct_cloudflare_session_start_admission: evidence[0]?.direct_cloudflare_session_start_admission ?? 'not_observed',
        authority_partition: 'windows_resident_loop_executes_fallback_cloudflare_records_session_start_evidence',
        evidence,
      },
    };
  }
  if (body.operation === 'resident_dispatch.local_resident_carrier_bridge.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareLocalResidentCarrierBridge(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'resident_dispatch.local_resident_carrier_bridge.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const bridge_records = await listCloudflareLocalResidentCarrierBridgeRecords(env, requestedSiteId, params);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_SCHEMA,
        status: bridge_records.length > 0 ? 'selected' : 'not_observed',
        site_id: requestedSiteId,
        local_resident_carrier_bridge_authority: bridge_records.length > 0 ? CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_AUTHORITY : 'not_observed',
        local_resident_carrier_bridge_store_authority: bridge_records.length > 0 ? CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_STORE_AUTHORITY : 'not_observed',
        cloudflare_session_replay_binding_admission: bridge_records[0]?.cloudflare_session_replay_binding_admission ?? 'not_observed',
        cloudflare_evidence_replay_binding_admission: bridge_records[0]?.cloudflare_evidence_replay_binding_admission ?? 'not_observed',
        cloudflare_runtime_session_start_admission: bridge_records[0]?.cloudflare_runtime_session_start_admission ?? 'not_observed',
        authority_partition: 'cloudflare_records_local_resident_carrier_replay_bridge_without_runtime_session_start',
        bridge_records,
      },
    };
  }
  if (body.operation === 'local_ingress.request.create') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await createCloudflareLocalIngressRequest(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'local_ingress.request.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const requests = await listCloudflareLocalIngressRequests(env, requestedSiteId, params.local_ingress_request_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_LOCAL_INGRESS_REQUEST_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        local_ingress_request_authority: requests.length > 0 ? CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY : 'not_observed',
        local_executor_authority: requests.length > 0 ? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY : 'not_observed',
        local_execution_admission: requests.length > 0 ? 'pending_windows_admission' : 'not_observed',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
        requests,
      },
    };
  }
  if (body.operation === 'local_ingress.evidence.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareLocalIngressEvidence(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'local_ingress.evidence.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const evidence = await listCloudflareLocalIngressEvidence(env, requestedSiteId, params.local_ingress_evidence_limit ?? params.limit, params.local_ingress_request_id);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        local_ingress_evidence_authority: evidence.length > 0 ? 'windows_local_ingress_executor' : 'not_observed',
        cloudflare_evidence_store_authority: evidence.length > 0 ? 'cloudflare_local_ingress_evidence_store' : 'not_observed',
        local_filesystem_mutation_admission: evidence.length > 0 ? 'admitted_by_windows_local_ingress' : 'not_observed',
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
        evidence,
      },
    };
  }
  if (body.operation === 'local_ingress.provider_heartbeat.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareLocalIngressProviderHeartbeat(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'local_ingress.provider_heartbeat.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const providerHeartbeats = await listCloudflareLocalIngressProviderHeartbeats(env, requestedSiteId, params.local_ingress_provider_heartbeat_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_HEARTBEAT_SCHEMA,
        site_id: requestedSiteId,
        local_ingress_provider_heartbeats: providerHeartbeats,
        local_ingress_provider_heartbeat_count: providerHeartbeats.length,
        local_ingress_provider_liveness: classifyLocalIngressProviderLiveness(providerHeartbeats),
        provider_liveness_authority: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY,
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
      },
    };
  }
  if (body.operation === 'repository_publication.request.create') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await createCloudflareRepositoryPublicationRequest(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'repository_publication.request.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const requests = await listCloudflareRepositoryPublicationRequests(env, requestedSiteId, params.repository_publication_request_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        repository_publication_request_authority: requests.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY : 'not_observed',
        repository_publication_executor_authority: requests.length > 0 ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
        repository_publication_admission: requests.length > 0 ? 'pending_windows_publication_admission' : 'not_observed',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_queues_governed_repository_publication_request_windows_admits_publishes_and_returns_evidence',
        requests,
      },
    };
  }
  if (body.operation === 'repository_publication.request.next') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const selection = await nextCloudflareRepositoryPublicationRequest(env, requestedSiteId, params.repository_publication_request_limit ?? params.limit);
    const request = selection?.request ?? null;
    const admission = selection?.admission ?? null;
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_SCHEMA,
        status: request ? 'selected' : (selection?.pending_unadmitted_count > 0 ? 'awaiting_cloudflare_admission' : 'drained'),
        site_id: requestedSiteId,
        repository_publication_request_authority: request ? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY : 'not_observed',
        repository_publication_dispatch_authority: request ? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY : 'not_observed',
        repository_publication_executor_authority: request ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
        repository_publication_admission_authority: request ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : (selection?.pending_unadmitted_count > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : 'not_observed'),
        repository_publication_admission: request ? 'admitted_by_cloudflare_repository_publication' : (selection?.pending_unadmitted_count > 0 ? 'waiting_for_cloudflare_publication_admission' : 'not_observed'),
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
        admission,
        pending_unadmitted_count: selection?.pending_unadmitted_count ?? 0,
        request,
      },
    };
  }
  if (body.operation === 'repository_publication.admission.classify') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareRepositoryPublicationAdmission(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'repository_publication.admission.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const admissions = await listCloudflareRepositoryPublicationAdmissions(env, requestedSiteId, params.repository_publication_admission_limit ?? params.limit, params.repository_publication_request_id);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        repository_publication_admission_authority: admissions.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : 'not_observed',
        repository_publication_executor_authority: admissions.length > 0 ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
        repository_publication_admission: admissions.length > 0 ? admissions[0].repository_publication_admission : 'not_observed',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
        admissions,
      },
    };
  }
  if (body.operation === 'repository_publication.cloudflare_execution.execute') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await executeCloudflareGithubRepositoryPublication(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'repository_publication.cloudflare_execution.readiness') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    return { status: 200, body: readCloudflareGithubRepositoryPublicationReadiness(env, requestedSiteId, params) };
  }
  if (body.operation === 'repository_publication.cloudflare_execution.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const executions = await listCloudflareRepositoryPublicationExecutions(env, requestedSiteId, params.repository_publication_execution_limit ?? params.limit, params.repository_publication_request_id);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        repository_publication_executor_authority: executions.length > 0 ? CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
        repository_publication_admission_authority: executions.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : 'not_observed',
        repository_publication_admission: executions.length > 0 ? executions[0].repository_publication_admission : 'not_observed',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: executions.length > 0 ? 'admitted_by_cloudflare_github_repository_publication' : 'not_observed',
        authority_partition: executions.length > 0 ? 'cloudflare_admits_and_executes_github_repository_publication' : 'not_observed',
        executions,
      },
    };
  }
  if (body.operation === 'repository_publication.evidence.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareRepositoryPublicationEvidence(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'repository_publication.evidence.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const evidence = await listCloudflareRepositoryPublicationEvidence(env, requestedSiteId, params.repository_publication_evidence_limit ?? params.limit, params.repository_publication_request_id);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        repository_publication_evidence_authority: evidence.length > 0 ? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY : 'not_observed',
        repository_publication_admission_authority: evidence.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY : 'not_observed',
        cloudflare_evidence_store_authority: evidence.length > 0 ? CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_AUTHORITY : 'not_observed',
        repository_publication_admission: evidence.length > 0 ? 'resolved_after_cloudflare_repository_publication_admission' : 'not_observed',
        cloudflare_git_push_admission: 'not_admitted',
        direct_cloudflare_repository_mutation_admission: 'not_admitted',
        authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence',
        evidence,
      },
    };
  }
  if (body.operation === 'repository_publication.provider_heartbeat.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareRepositoryPublicationProviderHeartbeat(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'repository_publication.provider_heartbeat.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const providerHeartbeats = await listCloudflareRepositoryPublicationProviderHeartbeats(env, requestedSiteId, params.repository_publication_provider_heartbeat_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_SCHEMA,
        site_id: requestedSiteId,
        repository_publication_provider_heartbeats: providerHeartbeats,
        repository_publication_provider_heartbeat_count: providerHeartbeats.length,
        repository_publication_provider_liveness: classifyRepositoryPublicationProviderLiveness(providerHeartbeats),
        provider_liveness_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY,
      },
    };
  }
  if (body.operation === 'task_lifecycle.shadow_read.source.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareTaskLifecycleShadowSource(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.shadow_read.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareTaskLifecycleShadowRead(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'task_lifecycle.shadow_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const reads = await listCloudflareTaskLifecycleShadowReads(env, requestedSiteId, params.task_lifecycle_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
        mutation_authority: 'windows_task_lifecycle_sqlite',
        cloudflare_write_admission: 'not_admitted',
        dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        reads,
      },
    };
  }
  if (body.operation === 'webhook_delay.shadow_read.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayShadowObservation(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.shadow_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const observations = await listCloudflareWebhookDelayShadowObservations(env, requestedSiteId, params.webhook_delay_shadow_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
        dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        observations,
      },
    };
  }
  if (body.operation === 'webhook_delay.observation.primary_with_fallback.record') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await recordCloudflareWebhookDelayObservationPrimaryRead(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.observation.primary_with_fallback.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const observations = await listCloudflareWebhookDelayObservationPrimaryReads(env, requestedSiteId, params.webhook_delay_observation_primary_limit ?? params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
        fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
        fallback_status: 'available',
        dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
        dispatch_action: 'none',
        observations,
      },
    };
  }
  if (body.operation === 'webhook_delay.remote_source.samples.put') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await putCloudflareWebhookDelayRemoteSourceSamples(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.samples.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const samples = await listCloudflareWebhookDelayRemoteSourceSamples(env, requestedSiteId, params.source_adapter_id, params.limit);
    return {
      status: 200,
      body: {
        ok: true,
        schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
        status: 'ok',
        site_id: requestedSiteId,
        source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
        samples,
      },
    };
  }
  if (body.operation === 'webhook_delay.remote_source.primary_with_fallback.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_metric.direct_source.read') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await readCloudflareWebhookDelayDirectRemoteMetricSource(env, requestedSiteId, params, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.scheduled_read.run') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await runCloudflareWebhookDelayScheduledSourceRead(env, { ...params, site_id: requestedSiteId }, principal);
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'webhook_delay.remote_source.scheduled_read.list') {
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: requestedSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const runs = await listCloudflareWebhookDelayScheduledSourceReads(env, requestedSiteId, params.limit);
    return { status: 200, body: {
      ok: true,
      schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
      status: 'ok',
      site_id: requestedSiteId,
      trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
      runs,
    } };
  }
  if (body.operation === 'site.continuity.packet.put') {
    const packet = params.packet ?? body.packet ?? null;
    const packetSiteId = packet?.site_id ?? requestedSiteId;
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: packetSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await importCloudflareContinuityPacket(env, packet, { imported_by_principal_id: principal?.principal_id ?? 'unknown-principal' });
    return { status: result.ok ? 200 : 403, body: result };
  }
  if (body.operation === 'site.continuity.packet.publish') {
    const siteId = requestedSiteId;
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: siteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
    const result = await importCloudflareContinuityPacket(env, siteContinuity.exchange_packet, {
      imported_by_principal_id: principal?.principal_id ?? 'cloudflare-carrier',
    });
    return {
      status: result.ok ? 200 : 403,
      body: {
        ...result,
        schema: 'narada.cloudflare_site_continuity_packet_publish.v1',
        site_id: siteId,
        packet: siteContinuity.exchange_packet,
      },
    };
  }
  if (body.operation === 'site.continuity.loop.report.put') {
    const report = params.report ?? body.report ?? null;
    const reportSiteId = report?.site_id ?? requestedSiteId;
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: reportSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await importCloudflareContinuityLoopReport(env, report, { recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal' });
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'site.continuity.reconciliation_execution.put') {
    const execution = params.execution ?? body.execution ?? null;
    const executionSiteId = params.site_id ?? inferSiteIdForReconciliationExecution(execution, requestedSiteId);
    const readResponse = await registry.handle({ operation: 'site.read', params: { site_id: executionSiteId, limit: 1 }, principal });
    if (!readResponse.ok) return { status: readResponse.code === 'site_authority_denied' ? 403 : 400, body: readResponse };
    const result = await importCloudflareContinuityReconciliationExecution(env, execution, {
      site_id: executionSiteId,
      recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    });
    return { status: result.ok ? 200 : 400, body: result };
  }
  if (body.operation === 'site.membership.put') {
    const { decision } = classifyCloudflareSiteAuthority(env, requestedSiteId, SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP);
    if (decision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
      return { status: 403, body: siteAuthorityDeniedBody(decision, body.operation) };
    }
  }
  const response = await registry.handle({ ...body, principal });
  if (!response.ok) return { status: response.code === 'site_authority_denied' ? 403 : 400, body: response };
  if (body.operation === 'site.list') {
    const siteProductStatuses = [];
    const siteProductProjections = [];
    for (const site of response.sites ?? []) {
      const siteRead = await registry.handle({
        operation: 'site.read',
        params: { site_id: site.site_id, limit: params.site_status_limit ?? params.limit },
        principal,
      });
      if (!siteRead.ok) continue;
      const projection = await buildCloudflareSiteProductProjection(env, principal, siteRead, params);
      siteProductStatuses.push(projection.site_product_status);
      siteProductProjections.push(projection);
    }
    const siteProductOverview = summarizeCloudflareSiteProductOverview(siteProductStatuses, siteProductProjections);
    return {
      status: 200,
      body: {
        ...response,
        site_product_statuses: siteProductStatuses,
        site_product_overview: siteProductOverview,
        site_posture_route: summarizeCloudflareSitePostureRoute(siteProductOverview, params.focused_site_id ?? params.site_id ?? ''),
      },
    };
  }
  if (body.operation === 'operation.list') {
    const siteId = params.site_id ?? response.site?.site_id ?? response.operations?.[0]?.site_id ?? null;
    const operationProjectionParams = {
      ...params,
      session_limit: params.session_limit ?? 10,
      carrier_event_limit: params.carrier_event_limit ?? 10,
    };
    if (!siteId) {
      return { status: 200, body: { ...response } };
    }
    let siteProjection = null;
    let focusedOperationId = null;
    try {
      const siteRead = await registry.handle({
        operation: 'site.read',
        params: { site_id: siteId, limit: params.site_status_limit ?? params.limit },
        principal,
      });
      if (!siteRead.ok) {
        return { status: 200, body: { ...response, site_id: siteId } };
      }
      siteProjection = await buildCloudflareSiteProductProjection(env, principal, siteRead, params);
      if (
        !String(params.operation_id ?? '').trim()
        && siteProjection?.operation_posture_overview?.schema === 'narada.cloudflare_operation_posture_overview.v1'
        && siteProjection?.operation_posture_route?.schema === 'narada.cloudflare_operation_posture_route.v1'
        && siteProjection?.focused_operation_lifecycle?.operation_id
      ) {
        return {
          status: 200,
          body: {
            ...response,
            site_id: siteId,
            operation_posture_overview: siteProjection.operation_posture_overview,
            operation_posture_route: siteProjection.operation_posture_route,
            focused_operation_lifecycle: siteProjection.focused_operation_lifecycle,
          },
        };
      }
      const focusedOperation = selectCloudflareFocusedOperation(response.operations ?? [], params, response);
      focusedOperationId = focusedOperation?.operation_id ?? null;
      if (focusedOperation?.operation_id) {
        const focusedOperationRead = await registry.handle({
          operation: 'operation.read',
          params: {
            site_id: siteId,
            operation_id: focusedOperation.operation_id,
            limit: params.operation_limit ?? params.limit,
            session_limit: operationProjectionParams.session_limit,
            carrier_event_limit: operationProjectionParams.carrier_event_limit,
          },
          principal,
        });
        if (focusedOperationRead?.ok) {
          const focusedProjection = await buildCloudflareOperationProductProjection(env, registry, principal, focusedOperationRead, {
            ...operationProjectionParams,
            site_id: siteId,
            operation_id: focusedOperation.operation_id,
          });
          let selectedProjection = focusedProjection;
          const postureTarget = focusedProjection.operation_posture_route?.next_action === 'focus_next_operation'
            ? String(focusedProjection.operation_posture_route?.target || '').trim()
            : '';
          if (postureTarget && postureTarget !== focusedOperation.operation_id) {
            const targetOperationRead = await registry.handle({
              operation: 'operation.read',
              params: {
                site_id: siteId,
                operation_id: postureTarget,
                limit: params.operation_limit ?? params.limit,
                session_limit: operationProjectionParams.session_limit,
                carrier_event_limit: operationProjectionParams.carrier_event_limit,
              },
              principal,
            });
            if (targetOperationRead?.ok) {
              selectedProjection = await buildCloudflareOperationProductProjection(env, registry, principal, targetOperationRead, {
                ...operationProjectionParams,
                site_id: siteId,
                operation_id: postureTarget,
              });
              if (shouldKeepFocusedOperationProjection(focusedProjection, selectedProjection)) {
                selectedProjection = focusedProjection;
              }
            }
          }
          if (
            selectedProjection.operation_workflow_route?.next_action === 'monitor_operation'
            && selectedProjection.operation_posture_route?.next_action === 'monitor_operations'
            && focusedProjection.operation_posture_overview?.next_status === 'needs_attention'
          ) {
            for (const candidate of response.operations ?? []) {
              if (!candidate?.operation_id || candidate.operation_id === selectedProjection.operation?.operation_id) continue;
              const candidateRead = await registry.handle({
                operation: 'operation.read',
                params: {
                  site_id: siteId,
                  operation_id: candidate.operation_id,
                  limit: params.operation_limit ?? params.limit,
                  session_limit: operationProjectionParams.session_limit,
                  carrier_event_limit: operationProjectionParams.carrier_event_limit,
                },
                principal,
              });
              if (!candidateRead?.ok) continue;
              const candidateProjection = await buildCloudflareOperationProductProjection(env, registry, principal, candidateRead, {
                ...operationProjectionParams,
                site_id: siteId,
                operation_id: candidate.operation_id,
              });
              if (
                candidateProjection.operation_workflow_route?.status === 'needs_attention'
                || candidateProjection.operation_posture_route?.status === 'needs_attention'
              ) {
                selectedProjection = candidateProjection;
                break;
              }
            }
          }
          const selectedOperationPostureOverview = normalizeCloudflareOperationPostureOverview(
            selectedProjection.operation_posture_overview,
            selectedProjection.operation_posture_route,
            selectedProjection.focused_operation_lifecycle,
            Array.isArray(response.operations) ? response.operations.length : 0,
          );
          const selectedOperationPostureRoute = summarizeCloudflareOperationPostureRoute(
            selectedOperationPostureOverview,
            selectedProjection.focused_operation_lifecycle?.operation_id
              ?? selectedProjection.operation?.operation_id
              ?? selectedOperationPostureOverview?.active_operation_id
              ?? '',
          );
          return {
            status: 200,
            body: {
              ...response,
              site_id: siteId,
              operation_posture_overview: {
                ...selectedOperationPostureOverview,
                active_operation_id: selectedProjection.focused_operation_lifecycle?.operation_id
                  ?? selectedOperationPostureOverview?.active_operation_id
                  ?? null,
              },
              operation_posture_route: selectedOperationPostureRoute,
              focused_operation_lifecycle: selectedProjection.focused_operation_lifecycle,
            },
          };
        }
      }
      return {
        status: 200,
        body: {
          ...response,
          site_id: siteId,
          operation_posture_overview: siteProjection.operation_posture_overview,
          operation_posture_route: siteProjection.operation_posture_route,
          focused_operation_lifecycle: siteProjection.focused_operation_lifecycle,
        },
      };
    } catch (error) {
      return {
        status: 200,
        body: {
          ...response,
          site_id: siteId,
          operation_posture_overview: siteProjection?.operation_posture_overview ?? null,
          operation_posture_route: siteProjection?.operation_posture_route ?? null,
          focused_operation_lifecycle: siteProjection?.focused_operation_lifecycle ?? null,
          operation_product_projection_error: summarizeCloudflareOperationProjectionError(error, {
            site_id: siteId,
            operation_id: focusedOperationId,
          }),
        },
      };
    }
  }
  if (body.operation === 'operation.read') {
    try {
      const projection = await buildCloudflareOperationProductProjection(env, registry, principal, response, params);
      return {
        status: 200,
        body: {
          ...response,
          ...projection,
        },
      };
    } catch (error) {
      return {
        status: 200,
        body: {
          ...response,
          operation_product_projection_error: summarizeCloudflareOperationProjectionError(error, {
            site_id: response.operation?.site_id ?? params.site_id ?? null,
            operation_id: response.operation?.operation_id ?? params.operation_id ?? null,
          }),
        },
      };
    }
  }


  if (body.operation !== 'site.read') {
    if (body.operation === 'site.membership.put') {
      const siteId = response.site?.site_id ?? requestedSiteId;
      const { decision } = classifyCloudflareSiteAuthority(env, siteId, SITE_MUTATION_CLASSES.HOSTED_SITE_MEMBERSHIP);
      return { status: 200, body: { ...response, site_authority_decision: decision } };
    }
    return { status: 200, body: response };
  }
  const projection = await buildCloudflareSiteProductProjection(env, principal, response, params);
  return {
    status: 200,
    body: {
      ...response,
      ...projection,
    },
  };
}

async function buildCloudflareOperationProductProjection(env, registry, principal, response, params = {}) {
  const operation = response.operation;
  const siteId = operation?.site_id ?? params.site_id;
  const postureProbeDepth = Number(params.posture_probe_depth ?? 0) || 0;
  const projectionParams = {
    ...params,
    session_limit: params.session_limit ?? 10,
    carrier_event_limit: params.carrier_event_limit ?? 10,
  };
  let stage = 'operation_list';
  try {
    const operationListResponse = await registry.handle({
      operation: 'operation.list',
      params: { site_id: siteId, limit: params.operation_limit ?? params.limit },
      principal,
    });
    const siteOperations = operationListResponse.ok ? operationListResponse.operations ?? [] : (operation ? [operation] : []);
    const runtimeSessions = response.sessions ?? [];
    stage = 'local_resident_bridge';
    const localResidentCarrierBridgeRecords = await listCloudflareLocalResidentCarrierBridgeRecords(env, siteId, {
      operation_id: params.operation_id ?? null,
      local_resident_carrier_bridge_limit: params.local_resident_carrier_bridge_limit ?? params.limit,
    });
    const sessions = mergeLocalResidentCarrierBridgeSessions(runtimeSessions, localResidentCarrierBridgeRecords);
    stage = 'task_read';
    const tasks = await listOperationTasks(env, siteId, sessions);
    stage = 'continuity_read';
    const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
    const continuityLoopReports = await listCloudflareContinuityLoopReports(env, siteId, params.continuity_loop_report_limit ?? params.limit);
    const continuityReconciliationExecutions = await listCloudflareContinuityReconciliationExecutions(env, siteId, params.continuity_reconciliation_execution_limit ?? params.limit);
    stage = 'webhook_delay_read';
    const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
    const webhookDelayObservationPrimaryReads = await listCloudflareWebhookDelayObservationPrimaryReads(env, siteId, params.webhook_delay_observation_primary_limit ?? params.limit);
    const webhookDelayScheduledSourceReads = await listCloudflareWebhookDelayScheduledSourceReads(env, siteId, params.webhook_delay_scheduled_source_read_limit ?? params.limit);
    const webhookDelayDirectiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, siteId, params.webhook_delay_directive_limit ?? params.limit);
    const webhookDelayDirectiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, siteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
    stage = 'resident_and_mailbox_read';
    const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
    const mailboxStatusShadowReads = await listCloudflareMailboxStatusShadowReads(env, siteId, params.mailbox_status_shadow_limit ?? params.limit);
    const mailboxStatusSourceReads = await listCloudflareMailboxStatusSourceReads(env, siteId, params.mailbox_status_source_limit ?? params.limit);
    const mailboxDraftReplyProposals = await listCloudflareMailboxDraftReplyProposals(env, siteId, params.mailbox_draft_reply_proposal_limit ?? params.limit);
    const mailboxOutlookDraftCreates = await listCloudflareMailboxOutlookDraftCreates(env, siteId, params.mailbox_outlook_draft_create_limit ?? params.limit);
    const mailboxSendAcceptedRecords = await listCloudflareMailboxSendAcceptedRecords(env, siteId, params.mailbox_send_accepted_limit ?? params.limit);
    const mailboxSendConfirmations = await listCloudflareMailboxSendConfirmations(env, siteId, params.mailbox_send_confirmation_limit ?? params.limit);
    const mailboxSendReviews = await listCloudflareMailboxSendReviews(env, siteId, params.mailbox_send_review_limit ?? params.limit);
    const operationFocusReviews = await listCloudflareOperationFocusReviews(env, siteId, params.operation_focus_review_limit ?? params.limit);
    stage = 'site_mutation_read';
    const siteFileChangeProposals = await listCloudflareSiteFileChangeProposals(env, siteId, params.site_file_change_proposal_limit ?? params.limit);
    const siteFileMaterializations = await listCloudflareSiteFileMaterializations(env, siteId, params.site_file_materialization_limit ?? params.limit);
    stage = 'local_ingress_read';
    const localIngressRequests = await listCloudflareLocalIngressRequests(env, siteId, params.local_ingress_request_limit ?? params.limit);
    const localIngressEvidence = await listCloudflareLocalIngressEvidence(env, siteId, params.local_ingress_evidence_limit ?? params.limit);
    const localIngressProviderHeartbeats = await listCloudflareLocalIngressProviderHeartbeats(env, siteId, params.local_ingress_provider_heartbeat_limit ?? params.limit);
    stage = 'repository_publication_read';
    const repositoryPublicationRequests = await listCloudflareRepositoryPublicationRequests(env, siteId, params.repository_publication_request_limit ?? params.limit);
    const repositoryPublicationAdmissions = await listCloudflareRepositoryPublicationAdmissions(env, siteId, params.repository_publication_admission_limit ?? params.limit);
    const repositoryPublicationExecutions = await listCloudflareRepositoryPublicationExecutions(env, siteId, params.repository_publication_execution_limit ?? params.limit);
    const repositoryPublicationEvidence = await listCloudflareRepositoryPublicationEvidence(env, siteId, params.repository_publication_evidence_limit ?? params.limit);
    const repositoryPublicationProviderHeartbeats = await listCloudflareRepositoryPublicationProviderHeartbeats(env, siteId, params.repository_publication_provider_heartbeat_limit ?? params.limit);
    stage = 'task_lifecycle_read';
    const taskLifecycleShadowReads = await listCloudflareTaskLifecycleShadowReads(env, siteId, params.task_lifecycle_shadow_limit ?? params.limit);
    const taskLifecycleWriteAdmissions = await listCloudflareTaskLifecycleWriteAdmissions(env, siteId, params.task_lifecycle_write_admission_limit ?? params.limit);
    const siteTaskLifecycleTasks = await listCloudflareTaskLifecycleTasks(env, siteId, params.task_lifecycle_task_limit ?? params.limit, params);
    const operationCarrierSessionIds = new Set(
      sessions
        .filter((session) => !operation?.operation_id || session.operation_id === operation.operation_id)
        .map((session) => session.carrier_session_id)
        .filter(Boolean),
    );
    const taskLifecycleTasks = operation?.operation_id
      ? siteTaskLifecycleTasks.filter((task) => (
          task.operation_id === operation.operation_id
          || (task.carrier_session_id && operationCarrierSessionIds.has(task.carrier_session_id))
        ))
      : siteTaskLifecycleTasks;
    stage = 'resident_dispatch_read';
    const residentDispatchDecisions = await listCloudflareResidentDispatchDecisions(env, siteId, params.resident_dispatch_limit ?? params.limit);
    const residentDispatchWindowsFallbackRequests = await listCloudflareResidentDispatchWindowsFallbackRequests(
      env,
      siteId,
      params.resident_dispatch_windows_fallback_request_limit ?? params.limit,
      { operation_id: params.operation_id ?? null },
    );
    const residentDispatchWindowsFallbackEvidence = await listCloudflareResidentDispatchWindowsFallbackEvidence(env, siteId, {
      operation_id: params.operation_id ?? null,
      resident_dispatch_windows_fallback_evidence_limit: params.resident_dispatch_windows_fallback_evidence_limit ?? params.limit,
    });
    stage = 'carrier_evidence_read';
    const runtimeCarrierEvidence = await readCarrierEvidenceForSiteSessions(env, runtimeSessions, principal, projectionParams);
    const carrierEvidence = mergeLocalResidentCarrierBridgeEvidence(runtimeCarrierEvidence, localResidentCarrierBridgeRecords);
    stage = 'projection_summarization';
    const carrierEvidenceReadStatus = summarizeCloudflareCarrierEvidenceReadStatus({ sessions, carrierEvidence, params: projectionParams });
    const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
    const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
    const siteContinuityStatus = summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets, siteContinuity);
    const siteContinuityLoopStatus = summarizeCloudflareSiteContinuityLoopStatus(siteId, continuityLoopReports);
    const siteContinuityReconciliationExecutionStatus = summarizeCloudflareSiteContinuityReconciliationExecutionStatus(siteId, continuityReconciliationExecutions);
    const cloudflarePersistencePosture = summarizeCloudflarePersistencePosture(env, {
    siteId,
    operation,
    sessions,
    tasks,
    carrierEvidence,
    continuityPackets,
    continuityLoopReports,
    continuityReconciliationExecutions,
    operationFocusReviews,
    carrierEvidenceReadStatus,
  });
    const cloudflareRecoveryPosture = summarizeCloudflareRecoveryPosture({
    persistencePosture: cloudflarePersistencePosture,
    sessions,
    carrierEvidence,
    carrierEvidenceReadStatus,
    residentDispatchWindowsFallbackEvidence,
    operation,
    siteId,
  });
    const operationStatusHistory = summarizeCloudflareOperationStatusHistory(response.authority_events, operation);
    const operationActivityTimeline = summarizeCloudflareOperationActivityTimeline({
    operation,
    statusHistory: operationStatusHistory,
    authorityEvents: response.authority_events,
    sessions,
    tasks,
    carrierEvidence,
    continuityPackets,
    continuityLoopReports,
    continuityReconciliationExecutions,
    webhookDelayDirectiveRecords,
    webhookDelayDirectiveDeliveries,
    residentLoopShadowRuns,
    mailboxStatusShadowReads,
    mailboxStatusSourceReads,
    mailboxDraftReplyProposals,
    mailboxOutlookDraftCreates,
    mailboxSendAcceptedRecords,
    mailboxSendConfirmations,
    mailboxSendReviews,
    operationFocusReviews,
    siteFileChangeProposals,
    localIngressRequests,
    localIngressEvidence,
    localIngressProviderHeartbeats,
    repositoryPublicationRequests,
    repositoryPublicationExecutions,
    repositoryPublicationEvidence,
    repositoryPublicationProviderHeartbeats,
    residentDispatchDecisions,
    residentDispatchWindowsFallbackRequests,
    residentDispatchWindowsFallbackEvidence,
  });
    const localCloudContinuityBridge = summarizeLocalCloudContinuityBridge(siteId, continuityPackets, siteContinuity, siteContinuityStatus);
    const operationContinuityDirectionStatus = summarizeCloudflareOperationContinuityDirectionStatus({
    operation,
    siteId,
    continuityStatus: siteContinuityStatus,
    continuityLoopStatus: siteContinuityLoopStatus,
    localCloudContinuityBridge,
  });
    const operationLifecycleStatus = summarizeCloudflareOperationLifecycleStatus({
    operation,
    sessions,
    tasks,
    carrierEvidence,
    carrierEvidenceReadStatus,
    continuityStatus: siteContinuityStatus,
    continuityLoopStatus: siteContinuityLoopStatus,
    continuityReconciliationExecutionStatus: siteContinuityReconciliationExecutionStatus,
    operationContinuityDirectionStatus,
    residentLoopShadowRuns,
    residentDispatchDecisions,
    residentDispatchWindowsFallbackEvidence,
    localIngressRequests,
    localIngressEvidence,
    localIngressProviderHeartbeats,
    repositoryPublicationRequests,
    repositoryPublicationExecutions,
    repositoryPublicationEvidence,
    repositoryPublicationProviderHeartbeats,
    webhookDelayDirectiveRecords,
    webhookDelayDirectiveDeliveries,
    persistencePosture: cloudflarePersistencePosture,
    recoveryPosture: cloudflareRecoveryPosture,
  });
    const localIngressOperationPosture = summarizeCloudflareLocalIngressOperationPosture({
    localIngressRequests,
    localIngressEvidence,
    localIngressProviderHeartbeats,
  });
    const repositoryPublicationOperationPosture = summarizeCloudflareRepositoryPublicationOperationPosture({
    repositoryPublicationRequests,
    repositoryPublicationAdmissions,
    repositoryPublicationExecutions,
    repositoryPublicationEvidence,
    repositoryPublicationProviderHeartbeats,
  });
    const authorityTransferPosture = summarizeCloudflareAuthorityTransferPosture({
    mailboxStatusShadowReads,
    mailboxStatusSourceReads,
    mailboxDraftReplyProposals,
    mailboxOutlookDraftCreates,
    mailboxSendAcceptedRecords,
    mailboxSendConfirmations,
    siteFileChangeProposals,
    siteFileMaterializations,
    localIngressOperationPosture,
    repositoryPublicationOperationPosture,
    taskLifecycleTasks,
  });
    const taskLifecycleExternalEffectsReady = authorityTransferPosture.domains
    ?.find((domain) => domain.domain === 'task_lifecycle')
    ?.authority_partition === 'task_lifecycle_cloudflare_writes_and_external_effects_cloudflare_owned';
    const taskLifecycleSurfaceWriteAdmissionPosture = summarizeTaskLifecycleSurfaceWriteAdmissionPosture(taskLifecycleTasks, taskLifecycleExternalEffectsReady);
    const taskLifecycleSurfaceAuthorityPartition = summarizeTaskLifecycleSurfaceAuthorityPartition(taskLifecycleTasks, taskLifecycleExternalEffectsReady);
    let operationPostureOverview = summarizeCloudflareOperationPostureOverview(siteOperations, {
    ...response,
    sessions,
    tasks,
    carrier_evidence: carrierEvidence,
    site_continuity_packets: continuityPackets,
    site_continuity_loop_reports: continuityLoopReports,
    resident_dispatch_windows_fallback_requests: residentDispatchWindowsFallbackRequests,
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
    local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
  }, {
    active_operation_id: operation?.operation_id ?? params.operation_id,
    site_id: siteId,
  });
    let operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, operation?.operation_id ?? params.operation_id ?? '');
    const operationWorkflowRoute = summarizeCloudflareOperationWorkflowRoute({
    operation,
    lifecycleStatus: operationLifecycleStatus,
    operationContinuityDirectionStatus,
    localCloudContinuityBridge,
    persistencePosture: cloudflarePersistencePosture,
    recoveryPosture: cloudflareRecoveryPosture,
    operationActivityTimeline,
    webhookDelayDirectiveRecords,
    webhookDelayDirectiveDeliveries,
    residentDispatchDecisions,
    residentDispatchWindowsFallbackRequests,
    residentDispatchWindowsFallbackEvidence,
    mailboxSendReviews,
    operationFocusReviews,
    tasks,
  });
    const postureTarget = operationPostureRoute.next_action === 'focus_next_operation'
      ? String(operationPostureRoute.target || '').trim()
      : '';
    if (
      postureProbeDepth < 2
      && operationWorkflowRoute.next_action === 'monitor_operation'
      && postureTarget
      && postureTarget !== (operation?.operation_id ?? params.operation_id ?? '')
    ) {
      const targetOperationRead = await registry.handle({
        operation: 'operation.read',
        params: {
          site_id: siteId,
          operation_id: postureTarget,
          limit: params.operation_limit ?? params.limit,
          session_limit: projectionParams.session_limit,
          carrier_event_limit: projectionParams.carrier_event_limit,
        },
        principal,
      });
      if (targetOperationRead?.ok) {
        const targetProjection = await buildCloudflareOperationProductProjection(env, registry, principal, targetOperationRead, {
          ...projectionParams,
          site_id: siteId,
          operation_id: postureTarget,
          posture_probe_depth: postureProbeDepth + 1,
        });
        if (
          targetProjection.operation_workflow_route?.next_action === 'monitor_operation'
          && (
            targetProjection.operation_posture_route?.next_action === 'monitor_operations'
            || (
              targetProjection.operation_posture_route?.next_action === 'focus_next_operation'
              && String(targetProjection.operation_posture_route?.target || '').trim() === (operation?.operation_id ?? params.operation_id ?? '')
            )
          )
        ) {
          operationPostureOverview = {
            ...operationPostureOverview,
            next_operation_id: operation?.operation_id ?? params.operation_id ?? null,
            next_status: 'ready',
            next_action: 'monitor_operations',
            next_reason: 'all_operations_monitoring',
          };
          operationPostureRoute = summarizeCloudflareOperationPostureRoute(
            operationPostureOverview,
            operation?.operation_id ?? params.operation_id ?? '',
          );
        }
      }
    }
    if (
      postureProbeDepth < 2
      && postureTarget
      && postureTarget !== (operation?.operation_id ?? params.operation_id ?? '')
      && operationWorkflowRoute.next_action !== 'monitor_operation'
    ) {
      const targetOperationRead = await registry.handle({
        operation: 'operation.read',
        params: {
          site_id: siteId,
          operation_id: postureTarget,
          limit: params.operation_limit ?? params.limit,
          session_limit: projectionParams.session_limit,
          carrier_event_limit: projectionParams.carrier_event_limit,
        },
        principal,
      });
      if (targetOperationRead?.ok) {
        const targetProjection = await buildCloudflareOperationProductProjection(env, registry, principal, targetOperationRead, {
          ...projectionParams,
          site_id: siteId,
          operation_id: postureTarget,
          posture_probe_depth: postureProbeDepth + 1,
        });
        if (shouldKeepFocusedOperationProjection({
          operation,
          operation_workflow_route: operationWorkflowRoute,
        }, targetProjection)) {
          operationPostureOverview = {
            ...operationPostureOverview,
            next_operation_id: operation?.operation_id ?? params.operation_id ?? null,
            next_status: 'ready',
            next_action: 'monitor_operations',
            next_reason: 'all_operations_monitoring',
          };
          operationPostureRoute = summarizeCloudflareOperationPostureRoute(
            operationPostureOverview,
            operation?.operation_id ?? params.operation_id ?? '',
          );
        }
      }
    }
    return {
    sessions,
    operations: siteOperations,
    tasks,
    site_continuity_packets: continuityPackets,
    site_continuity_loop_reports: continuityLoopReports,
    site_continuity_reconciliation_executions: continuityReconciliationExecutions,
    webhook_delay_shadow_observations: webhookDelayShadowObservations,
    webhook_delay_observation_primary_reads: webhookDelayObservationPrimaryReads,
    webhook_delay_scheduled_source_reads: webhookDelayScheduledSourceReads,
    webhook_delay_directive_records: webhookDelayDirectiveRecords,
    webhook_delay_directive_deliveries: webhookDelayDirectiveDeliveries,
    resident_loop_shadow_runs: residentLoopShadowRuns,
    mailbox_status_shadow_reads: mailboxStatusShadowReads,
    mailbox_status_source_reads: mailboxStatusSourceReads,
    mailbox_draft_reply_proposals: mailboxDraftReplyProposals,
    mailbox_outlook_draft_creates: mailboxOutlookDraftCreates,
    mailbox_send_accepted_records: mailboxSendAcceptedRecords,
    mailbox_send_confirmations: mailboxSendConfirmations,
    mailbox_send_reviews: mailboxSendReviews,
    operation_focus_reviews: operationFocusReviews,
    site_file_change_proposals: siteFileChangeProposals,
    site_file_materializations: siteFileMaterializations,
    local_ingress_requests: localIngressRequests,
    local_ingress_evidence: localIngressEvidence,
    local_ingress_provider_heartbeats: localIngressProviderHeartbeats,
    repository_publication_requests: repositoryPublicationRequests,
    repository_publication_admissions: repositoryPublicationAdmissions,
    repository_publication_executions: repositoryPublicationExecutions,
    repository_publication_evidence: repositoryPublicationEvidence,
    repository_publication_provider_heartbeats: repositoryPublicationProviderHeartbeats,
    task_lifecycle_shadow_reads: taskLifecycleShadowReads,
    task_lifecycle_write_admissions: taskLifecycleWriteAdmissions,
    task_lifecycle_tasks: taskLifecycleTasks,
    resident_dispatch_decisions: residentDispatchDecisions,
    resident_dispatch_windows_fallback_requests: residentDispatchWindowsFallbackRequests,
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
    local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
    carrier_evidence: carrierEvidence,
    carrier_evidence_read_status: carrierEvidenceReadStatus,
    site_authority: siteAuthority,
    site_continuity: siteContinuity,
    site_continuity_status: siteContinuityStatus,
    site_continuity_loop_status: siteContinuityLoopStatus,
    site_continuity_reconciliation_execution_status: siteContinuityReconciliationExecutionStatus,
    local_cloud_continuity_bridge: localCloudContinuityBridge,
    operation_continuity_direction_status: operationContinuityDirectionStatus,
    cloudflare_persistence_posture: cloudflarePersistencePosture,
    cloudflare_recovery_posture: cloudflareRecoveryPosture,
    authority_transfer_posture: authorityTransferPosture,
    operation_status_history: operationStatusHistory,
    operation_activity_timeline: operationActivityTimeline,
    operation_lifecycle_status: operationLifecycleStatus,
    local_ingress_operation_posture: localIngressOperationPosture,
    repository_publication_operation_posture: repositoryPublicationOperationPosture,
    task_lifecycle_surface_write_admission_posture: taskLifecycleSurfaceWriteAdmissionPosture,
    task_lifecycle_surface_authority_partition: taskLifecycleSurfaceAuthorityPartition,
    operation_posture_overview: operationPostureOverview,
    operation_posture_route: operationPostureRoute,
    operation_workflow_route: operationWorkflowRoute,
    focused_operation_lifecycle: {
      schema: 'narada.cloudflare_focused_operation_lifecycle.v1',
      site_id: siteId,
      operation_id: operation?.operation_id ?? null,
      operation,
      lifecycle_status: operationLifecycleStatus,
      workflow_route: operationWorkflowRoute,
      operation_posture_overview: operationPostureOverview,
      operation_posture_route: operationPostureRoute,
      status_history: operationStatusHistory,
      activity_timeline: operationActivityTimeline,
      local_ingress_operation_posture: localIngressOperationPosture,
      repository_publication_operation_posture: repositoryPublicationOperationPosture,
    },
    operation_product_surface: {
      schema: 'narada.cloudflare_operation_product_surface.v1',
      operation_id: operation?.operation_id ?? null,
      site_id: siteId,
      session_count: sessions.length,
      task_count: tasks.length,
      carrier_evidence_count: carrierEvidence.length,
      carrier_evidence_read_status: carrierEvidenceReadStatus,
      persistence_posture: cloudflarePersistencePosture,
      recovery_posture: cloudflareRecoveryPosture,
      continuity_packet_count: continuityPackets.length,
      continuity_status: siteContinuityStatus,
      continuity_loop_report_count: continuityLoopReports.length,
      continuity_loop_status: siteContinuityLoopStatus,
      continuity_reconciliation_execution_count: continuityReconciliationExecutions.length,
      continuity_reconciliation_execution_status: siteContinuityReconciliationExecutionStatus,
      local_cloud_continuity_bridge: localCloudContinuityBridge,
      operation_continuity_direction_status: operationContinuityDirectionStatus,
      status_history: operationStatusHistory,
      activity_timeline: operationActivityTimeline,
      lifecycle_status: operationLifecycleStatus,
      local_ingress_operation_posture: localIngressOperationPosture,
      repository_publication_operation_posture: repositoryPublicationOperationPosture,
      authority_transfer_posture: authorityTransferPosture,
      operation_posture_overview: operationPostureOverview,
      operation_posture_route: operationPostureRoute,
      operation_workflow_route: operationWorkflowRoute,
      webhook_delay_shadow_observation_count: webhookDelayShadowObservations.length,
      webhook_delay_observation_primary_read_count: webhookDelayObservationPrimaryReads.length,
      webhook_delay_scheduled_source_read_count: webhookDelayScheduledSourceReads.length,
      webhook_delay_directive_record_count: webhookDelayDirectiveRecords.length,
      webhook_delay_directive_delivery_count: webhookDelayDirectiveDeliveries.length,
      resident_loop_shadow_run_count: residentLoopShadowRuns.length,
      resident_dispatch_windows_fallback_request_count: residentDispatchWindowsFallbackRequests.length,
      resident_dispatch_windows_fallback_request_authority: residentDispatchWindowsFallbackRequests.length > 0 ? CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_AUTHORITY : 'not_observed',
      resident_dispatch_windows_fallback_evidence_count: residentDispatchWindowsFallbackEvidence.length,
      resident_dispatch_windows_fallback_execution_authority: residentDispatchWindowsFallbackEvidence.length > 0 ? WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY : 'not_observed',
      resident_dispatch_windows_fallback_session_start_admission: residentDispatchWindowsFallbackEvidence[0]?.local_session_start_admission ?? 'not_observed',
      local_resident_carrier_bridge_record_count: localResidentCarrierBridgeRecords.length,
      local_ingress_request_count: localIngressOperationPosture.local_ingress_request_count,
      local_ingress_evidence_count: localIngressOperationPosture.local_ingress_evidence_count,
      local_ingress_provider_heartbeat_count: localIngressOperationPosture.local_ingress_provider_heartbeat_count,
      local_ingress_request_authority: localIngressOperationPosture.request_authority,
      local_ingress_executor_authority: localIngressOperationPosture.executor_authority,
      local_ingress_evidence_authority: localIngressOperationPosture.evidence_authority,
      local_ingress_evidence_store_authority: localIngressOperationPosture.evidence_store_authority,
      local_ingress_provider_liveness_authority: localIngressOperationPosture.provider_liveness_authority,
      local_ingress_provider_liveness: localIngressOperationPosture.provider_liveness,
      local_ingress_execution_admission: localIngressOperationPosture.local_ingress_evidence_count > 0
        ? 'completed_by_windows_local_ingress'
        : localIngressOperationPosture.local_ingress_request_count > 0 ? 'pending_windows_admission' : 'not_observed',
      local_ingress_direct_cloudflare_filesystem_mutation_admission: localIngressOperationPosture.direct_cloudflare_filesystem_mutation_admission,
      local_ingress_repository_publication_admission: localIngressOperationPosture.repository_publication_admission,
      repository_publication_request_count: repositoryPublicationOperationPosture.repository_publication_request_count,
      repository_publication_admission_count: repositoryPublicationOperationPosture.repository_publication_admission_count,
      repository_publication_execution_count: repositoryPublicationOperationPosture.repository_publication_execution_count,
      repository_publication_evidence_count: repositoryPublicationOperationPosture.repository_publication_evidence_count,
      repository_publication_provider_heartbeat_count: repositoryPublicationOperationPosture.repository_publication_provider_heartbeat_count,
      repository_publication_request_authority: repositoryPublicationOperationPosture.request_authority,
      repository_publication_admission_authority: repositoryPublicationOperationPosture.admission_authority,
      repository_publication_executor_authority: repositoryPublicationOperationPosture.executor_authority,
      repository_publication_provider_liveness_authority: repositoryPublicationOperationPosture.provider_liveness_authority,
      repository_publication_provider_liveness: repositoryPublicationOperationPosture.provider_liveness,
      repository_publication_evidence_store_authority: repositoryPublicationOperationPosture.evidence_store_authority,
      repository_publication_execution_admission: repositoryPublicationOperationPosture.repository_publication_admission,
      repository_publication_cloudflare_git_push_admission: repositoryPublicationOperationPosture.cloudflare_git_push_admission,
      repository_publication_direct_cloudflare_repository_mutation_admission: repositoryPublicationOperationPosture.direct_cloudflare_repository_mutation_admission,
      mailbox_status_shadow_read_count: mailboxStatusShadowReads.length,
      mailbox_status_source_read_count: mailboxStatusSourceReads.length,
      mailbox_status_authority: mailboxStatusSourceReads.length > 0
        ? CLOUDFLARE_MAILBOX_STATUS_SOURCE_AUTHORITY
        : mailboxStatusShadowReads.length > 0 ? 'windows_mailbox_status_source' : 'not_observed',
      mailbox_shadow_target_locus: mailboxStatusShadowReads.length > 0 ? 'cloudflare_carrier_site' : 'not_observed',
      mailbox_send_admission: mailboxSendAcceptedRecords.length > 0 ? 'admitted' : 'not_admitted',
      mailbox_send_delivery_confirmation_admission: mailboxSendConfirmations.length > 0 ? 'admitted' : 'not_admitted',
      mailbox_mutation_admission: 'not_admitted',
      mailbox_authority_partition: authorityTransferPosture.domains.find((domain) => domain.domain === 'mailbox_status')?.authority_partition ?? 'mailbox_windows_owned',
      mailbox_draft_reply_proposal_count: mailboxDraftReplyProposals.length,
      mailbox_draft_reply_proposal_authority: mailboxDraftReplyProposals.length > 0 ? CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_AUTHORITY : 'not_observed',
      mailbox_outlook_draft_create_admission: mailboxOutlookDraftCreates.length > 0 ? 'admitted' : 'not_admitted',
      mailbox_draft_reply_authority_partition: authorityTransferPosture.domains.find((domain) => domain.domain === 'mailbox_draft_reply')?.authority_partition ?? 'mailbox_draft_reply_windows_owned',
      mailbox_outlook_draft_create_count: mailboxOutlookDraftCreates.length,
      mailbox_outlook_draft_create_authority_partition: authorityTransferPosture.domains.find((domain) => domain.domain === 'mailbox_outlook_draft_create')?.authority_partition ?? 'mailbox_outlook_draft_create_not_observed',
      mailbox_send_accepted_record_count: mailboxSendAcceptedRecords.length,
      mailbox_send_accepted_count: mailboxSendAcceptedRecords.length,
      mailbox_send_confirmation_count: mailboxSendConfirmations.length,
      mailbox_send_review_count: mailboxSendReviews.length,
      mailbox_send_review_authority: mailboxSendReviews.length > 0 ? CLOUDFLARE_MAILBOX_SEND_REVIEW_AUTHORITY : 'not_observed',
      mailbox_send_review_admission: mailboxSendReviews.length > 0 ? 'admitted' : 'not_observed',
      operation_focus_review_count: operationFocusReviews.length,
      operation_focus_review_authority: operationFocusReviews.length > 0 ? CLOUDFLARE_OPERATION_FOCUS_REVIEW_AUTHORITY : 'not_observed',
      operation_focus_review_admission: operationFocusReviews.length > 0 ? 'admitted' : 'not_observed',
      site_file_change_proposal_count: siteFileChangeProposals.length,
      site_file_change_proposal_authority: siteFileChangeProposals.length > 0 ? 'cloudflare_carrier_site' : 'not_observed',
      filesystem_executor_authority: siteFileChangeProposals.length > 0 ? 'windows_filesystem_executor' : 'not_observed',
      filesystem_mutation_admission: siteFileChangeProposals.length > 0 ? 'not_admitted' : 'retained',
      repository_publication_admission: siteFileChangeProposals.length > 0 ? 'not_admitted' : 'retained',
      site_file_change_authority_partition: authorityTransferPosture.domains.find((domain) => domain.domain === 'site_file_change_proposal')?.authority_partition ?? 'filesystem_and_publication_windows_owned',
      site_file_materialization_count: siteFileMaterializations.length,
      site_file_materialization_authority: siteFileMaterializations.length > 0 ? 'cloudflare_carrier_site' : 'not_observed',
      cloudflare_site_file_materialization_admission: siteFileMaterializations.length > 0 ? 'admitted' : 'not_observed',
      cloudflare_site_file_materialization_executor_authority: siteFileMaterializations.length > 0 ? 'cloudflare_site_file_store' : 'not_observed',
      windows_filesystem_mutation_admission: siteFileMaterializations.length > 0 ? 'not_admitted' : 'retained',
      site_file_materialization_repository_publication_admission: siteFileMaterializations.length > 0 ? 'not_admitted' : 'retained',
      site_file_materialization_authority_partition: authorityTransferPosture.domains.find((domain) => domain.domain === 'site_file_materialization')?.authority_partition ?? 'materialization_not_observed_filesystem_and_publication_windows_owned',
      task_lifecycle_shadow_read_count: taskLifecycleShadowReads.length,
      task_lifecycle_write_admission_count: taskLifecycleWriteAdmissions.length,
      task_lifecycle_write_admission_posture: taskLifecycleSurfaceWriteAdmissionPosture,
      task_lifecycle_task_count: taskLifecycleTasks.length,
      task_lifecycle_task_claim_count: taskLifecycleTasks.filter((task) => task.claimed_at || task.claimed_by_agent_id || task.claimed_by_principal_id).length,
      task_lifecycle_task_report_count: taskLifecycleTasks.filter((task) => task.report_id).length,
      task_lifecycle_task_finish_count: taskLifecycleTasks.filter((task) => task.finish_id).length,
      task_lifecycle_changed_file_evidence_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.changed_file_evidence_count ?? 0), 0),
      task_lifecycle_projection_write_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.task_lifecycle_projection_write_count ?? 0), 0),
      task_lifecycle_source_state_write_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.task_lifecycle_source_state_write_count ?? 0), 0),
      task_lifecycle_assignment_write_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.task_lifecycle_assignment_write_count ?? 0), 0),
      task_lifecycle_role_resolution_write_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.task_lifecycle_role_resolution_write_count ?? 0), 0),
      task_lifecycle_roster_mutation_write_count: taskLifecycleTasks.reduce((count, task) => count + Number(task.task_lifecycle_roster_mutation_write_count ?? 0), 0),
      task_lifecycle_default_mutation_authority: taskLifecycleTasks.length > 0 ? 'cloudflare_task_lifecycle_d1' : 'windows_task_lifecycle_sqlite',
      task_lifecycle_default_cloudflare_write_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_source_state_write_count > 0)
        ? taskLifecycleExternalEffectsReady ? 'source_state_and_external_effects_admitted' : 'source_state_admitted_external_effects_not_admitted'
        : 'not_admitted',
      task_lifecycle_task_create_authority: taskLifecycleTasks.length > 0 ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_task_claim_authority: taskLifecycleTasks.some((task) => task.claimed_at || task.claimed_by_agent_id || task.claimed_by_principal_id) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_task_report_authority: taskLifecycleTasks.some((task) => task.report_id) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_task_finish_authority: taskLifecycleTasks.some((task) => task.finish_id) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_surface_write_admission_posture: taskLifecycleSurfaceWriteAdmissionPosture,
      task_lifecycle_surface_authority_partition: taskLifecycleSurfaceAuthorityPartition,
      task_lifecycle_changed_file_evidence_authority: taskLifecycleTasks.some((task) => task.changed_file_evidence_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_projection_write_authority: taskLifecycleTasks.some((task) => task.task_lifecycle_projection_write_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_source_state_authority: taskLifecycleTasks.some((task) => task.task_lifecycle_source_state_write_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_windows_sqlite_source_write_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_source_state_write_count > 0) ? 'not_admitted' : 'retained',
      task_lifecycle_assignment_authority: taskLifecycleTasks.some((task) => task.task_lifecycle_assignment_write_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_role_resolution_authority: taskLifecycleTasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_roster_mutation_authority: taskLifecycleTasks.some((task) => task.task_lifecycle_roster_mutation_write_count > 0) ? 'cloudflare_task_lifecycle_d1' : 'not_observed',
      task_lifecycle_roster_read_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0) ? 'admitted' : 'not_observed',
      task_lifecycle_roster_mutation_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_roster_mutation_write_count > 0) ? 'admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_assignment_write_count > 0) ? 'not_admitted' : 'retained',
      task_lifecycle_role_resolution_authority_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0) ? 'admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_assignment_write_count > 0) ? 'not_admitted' : 'retained',
      task_lifecycle_authority_partition: taskLifecycleSurfaceAuthorityPartition,
      resident_dispatch_decision_count: residentDispatchDecisions.length,
      task_lifecycle_mutation_authority: taskLifecycleTasks.length > 0 ? 'split_by_mutation_class' : 'windows_task_lifecycle_sqlite',
      task_lifecycle_cloudflare_write_admission: taskLifecycleTasks.some((task) => task.task_lifecycle_roster_mutation_write_count > 0) ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_role_resolution_and_roster_mutation_admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_role_resolution_write_count > 0) ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_assignment_and_role_resolution_admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_assignment_write_count > 0) ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_source_state_and_assignment_admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_source_state_write_count > 0) ? 'task_create_claim_report_finish_changed_file_evidence_projection_write_and_source_state_admitted' : taskLifecycleTasks.some((task) => task.task_lifecycle_projection_write_count > 0) ? 'task_create_claim_report_finish_changed_file_evidence_and_projection_write_admitted' : taskLifecycleTasks.some((task) => task.changed_file_evidence_count > 0) ? (taskLifecycleTasks.some((task) => task.finish_id) ? 'task_create_claim_report_finish_and_changed_file_evidence_admitted' : 'task_create_claim_report_and_changed_file_evidence_admitted') : taskLifecycleTasks.some((task) => task.finish_id) ? 'task_create_claim_report_and_finish_admitted' : taskLifecycleTasks.some((task) => task.report_id) ? 'task_create_claim_and_report_admitted' : taskLifecycleTasks.some((task) => task.status === 'claimed') ? 'task_create_and_claim_admitted' : taskLifecycleTasks.length > 0 ? 'task_create_admitted' : 'not_admitted',
      dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    },
    };
  } catch (error) {
    if (!error.operationProjectionStage) error.operationProjectionStage = stage;
    if (!error.operationProjectionSiteId) error.operationProjectionSiteId = siteId ?? null;
    if (!error.operationProjectionOperationId) error.operationProjectionOperationId = operation?.operation_id ?? params.operation_id ?? null;
    throw error;
  }
}

function summarizeCloudflareOperationProjectionError(error, context = {}) {
  return {
    schema: 'narada.cloudflare_operation_product_projection_error.v1',
    code: error?.code ?? 'operation_product_projection_failed',
    stage: error?.operationProjectionStage ?? 'unknown',
    message: String(error?.message ?? 'operation_product_projection_failed'),
    name: error?.name ?? 'Error',
    site_id: error?.operationProjectionSiteId ?? context.site_id ?? null,
    operation_id: error?.operationProjectionOperationId ?? context.operation_id ?? null,
  };
}

async function buildCloudflareSiteProductProjection(env, principal, response, params = {}) {
  const siteId = response.site?.site_id ?? params.site_id;
  const tasks = await listSiteTasks(env, siteId);
  const continuityPackets = await listCloudflareContinuityPackets(env, siteId);
  const continuityLoopReports = await listCloudflareContinuityLoopReports(env, siteId, params.continuity_loop_report_limit ?? params.limit);
  const continuityReconciliationExecutions = await listCloudflareContinuityReconciliationExecutions(env, siteId, params.continuity_reconciliation_execution_limit ?? params.limit);
  const webhookDelayShadowObservations = await listCloudflareWebhookDelayShadowObservations(env, siteId, params.webhook_delay_shadow_limit ?? params.limit);
  const webhookDelayObservationPrimaryReads = await listCloudflareWebhookDelayObservationPrimaryReads(env, siteId, params.webhook_delay_observation_primary_limit ?? params.limit);
  const webhookDelayScheduledSourceReads = await listCloudflareWebhookDelayScheduledSourceReads(env, siteId, params.webhook_delay_scheduled_source_read_limit ?? params.limit);
  const webhookDelayDirectiveRecords = await listCloudflareWebhookDelayDirectiveDualRecords(env, siteId, params.webhook_delay_directive_limit ?? params.limit);
  const webhookDelayDirectiveDeliveries = await listCloudflareWebhookDelayDirectiveDeliveries(env, siteId, params.webhook_delay_directive_delivery_limit ?? params.limit);
  const residentLoopShadowRuns = await listCloudflareResidentLoopShadowRuns(env, siteId, params.resident_loop_shadow_limit ?? params.limit);
  const mailboxStatusShadowReads = await listCloudflareMailboxStatusShadowReads(env, siteId, params.mailbox_status_shadow_limit ?? params.limit);
  const mailboxStatusSourceReads = await listCloudflareMailboxStatusSourceReads(env, siteId, params.mailbox_status_source_limit ?? params.limit);
  const mailboxDraftReplyProposals = await listCloudflareMailboxDraftReplyProposals(env, siteId, params.mailbox_draft_reply_proposal_limit ?? params.limit);
  const mailboxOutlookDraftCreates = await listCloudflareMailboxOutlookDraftCreates(env, siteId, params.mailbox_outlook_draft_create_limit ?? params.limit);
  const mailboxSendAcceptedRecords = await listCloudflareMailboxSendAcceptedRecords(env, siteId, params.mailbox_send_accepted_limit ?? params.limit);
  const mailboxSendConfirmations = await listCloudflareMailboxSendConfirmations(env, siteId, params.mailbox_send_confirmation_limit ?? params.limit);
  const mailboxSendReviews = await listCloudflareMailboxSendReviews(env, siteId, params.mailbox_send_review_limit ?? params.limit);
  const operationFocusReviews = await listCloudflareOperationFocusReviews(env, siteId, params.operation_focus_review_limit ?? params.limit);
  const siteFileChangeProposals = await listCloudflareSiteFileChangeProposals(env, siteId, params.site_file_change_proposal_limit ?? params.limit);
  const siteFileMaterializations = await listCloudflareSiteFileMaterializations(env, siteId, params.site_file_materialization_limit ?? params.limit);
  const localIngressRequests = await listCloudflareLocalIngressRequests(env, siteId, params.local_ingress_request_limit ?? params.limit);
  const localIngressEvidence = await listCloudflareLocalIngressEvidence(env, siteId, params.local_ingress_evidence_limit ?? params.limit);
  const localIngressProviderHeartbeats = await listCloudflareLocalIngressProviderHeartbeats(env, siteId, params.local_ingress_provider_heartbeat_limit ?? params.limit);
  const repositoryPublicationRequests = await listCloudflareRepositoryPublicationRequests(env, siteId, params.repository_publication_request_limit ?? params.limit);
  const repositoryPublicationAdmissions = await listCloudflareRepositoryPublicationAdmissions(env, siteId, params.repository_publication_admission_limit ?? params.limit);
  const repositoryPublicationExecutions = await listCloudflareRepositoryPublicationExecutions(env, siteId, params.repository_publication_execution_limit ?? params.limit);
  const repositoryPublicationEvidence = await listCloudflareRepositoryPublicationEvidence(env, siteId, params.repository_publication_evidence_limit ?? params.limit);
  const repositoryPublicationProviderHeartbeats = await listCloudflareRepositoryPublicationProviderHeartbeats(env, siteId, params.repository_publication_provider_heartbeat_limit ?? params.limit);
  const taskLifecycleShadowReads = await listCloudflareTaskLifecycleShadowReads(env, siteId, params.task_lifecycle_shadow_limit ?? params.limit);
  const taskLifecycleWriteAdmissions = await listCloudflareTaskLifecycleWriteAdmissions(env, siteId, params.task_lifecycle_write_admission_limit ?? params.limit);
  const taskLifecycleTasks = await listCloudflareTaskLifecycleTasks(env, siteId, params.task_lifecycle_task_limit ?? params.limit, params);
  const residentDispatchDecisions = await listCloudflareResidentDispatchDecisions(env, siteId, params.resident_dispatch_limit ?? params.limit);
  const residentDispatchWindowsFallbackRequests = await listCloudflareResidentDispatchWindowsFallbackRequests(
    env,
    siteId,
    params.resident_dispatch_windows_fallback_request_limit ?? params.limit,
    { operation_id: params.operation_id ?? null },
  );
  const residentDispatchWindowsFallbackEvidence = await listCloudflareResidentDispatchWindowsFallbackEvidence(env, siteId, {
    operation_id: params.operation_id ?? null,
    resident_dispatch_windows_fallback_evidence_limit: params.resident_dispatch_windows_fallback_evidence_limit ?? params.limit,
  });
  const runtimeSessions = response.sessions ?? [];
  const localResidentCarrierBridgeRecords = await listCloudflareLocalResidentCarrierBridgeRecords(env, siteId, {
    operation_id: params.operation_id ?? null,
    local_resident_carrier_bridge_limit: params.local_resident_carrier_bridge_limit ?? params.limit,
  });
  const sessions = mergeLocalResidentCarrierBridgeSessions(runtimeSessions, localResidentCarrierBridgeRecords);
  const runtimeCarrierEvidence = await readCarrierEvidenceForSiteSessions(env, runtimeSessions, principal, params);
  const carrierEvidence = mergeLocalResidentCarrierBridgeEvidence(runtimeCarrierEvidence, localResidentCarrierBridgeRecords);
  const carrierEvidenceReadStatus = summarizeCloudflareCarrierEvidenceReadStatus({ sessions, carrierEvidence, params });
  const siteAuthority = cloudflareSiteAuthorityReadModel(env, siteId);
  const siteContinuity = cloudflareSiteContinuityReadModel(env, siteId);
  const siteContinuityStatus = summarizeCloudflareSiteContinuityStatus(siteId, continuityPackets, siteContinuity);
  const siteContinuityLoopStatus = summarizeCloudflareSiteContinuityLoopStatus(siteId, continuityLoopReports);
  const siteContinuityReconciliationExecutionStatus = summarizeCloudflareSiteContinuityReconciliationExecutionStatus(siteId, continuityReconciliationExecutions);
  const localCloudContinuityBridge = summarizeLocalCloudContinuityBridge(siteId, continuityPackets, siteContinuity, siteContinuityStatus);
  const operationContinuityDirectionStatus = summarizeCloudflareOperationContinuityDirectionStatus({
    siteId,
    continuityStatus: siteContinuityStatus,
    continuityLoopStatus: siteContinuityLoopStatus,
    localCloudContinuityBridge,
  });
  const cloudflarePersistencePosture = summarizeCloudflarePersistencePosture(env, {
    siteId,
    sessions,
    tasks,
    carrierEvidence,
    continuityPackets,
    continuityLoopReports,
    continuityReconciliationExecutions,
    operationFocusReviews,
    carrierEvidenceReadStatus,
  });
  const cloudflareRecoveryPosture = summarizeCloudflareRecoveryPosture({
    persistencePosture: cloudflarePersistencePosture,
    sessions: response.sessions,
    carrierEvidence,
    carrierEvidenceReadStatus,
    residentDispatchWindowsFallbackEvidence,
    siteId,
  });
  function summarizeFocusedOperationArtifacts(focusedOperation) {
    const focusedOperationStatusHistory = summarizeCloudflareOperationStatusHistory(response.authority_events, focusedOperation);
    const focusedOperationActivityTimeline = summarizeCloudflareOperationActivityTimeline({
      operation: focusedOperation,
      statusHistory: focusedOperationStatusHistory,
      authorityEvents: response.authority_events,
      sessions: response.sessions ?? [],
      tasks,
      carrierEvidence,
      continuityPackets,
      continuityLoopReports,
      continuityReconciliationExecutions,
      webhookDelayDirectiveRecords,
      webhookDelayDirectiveDeliveries,
      residentLoopShadowRuns,
      mailboxStatusShadowReads,
      mailboxStatusSourceReads,
      mailboxDraftReplyProposals,
      mailboxOutlookDraftCreates,
      mailboxSendAcceptedRecords,
      mailboxSendConfirmations,
      mailboxSendReviews,
      operationFocusReviews,
      siteFileChangeProposals,
      localIngressRequests,
      localIngressEvidence,
      localIngressProviderHeartbeats,
      repositoryPublicationRequests,
      repositoryPublicationExecutions,
      repositoryPublicationEvidence,
      repositoryPublicationProviderHeartbeats,
      residentDispatchDecisions,
    });
    const focusedOperationLifecycleStatus = summarizeCloudflareOperationLifecycleStatus({
      operation: focusedOperation,
      sessions,
      tasks,
      carrierEvidence,
      carrierEvidenceReadStatus,
      continuityStatus: siteContinuityStatus,
      continuityLoopStatus: siteContinuityLoopStatus,
      continuityReconciliationExecutionStatus: siteContinuityReconciliationExecutionStatus,
      operationContinuityDirectionStatus,
      residentLoopShadowRuns,
      residentDispatchDecisions,
      residentDispatchWindowsFallbackEvidence,
      localIngressRequests,
      localIngressEvidence,
      localIngressProviderHeartbeats,
      repositoryPublicationRequests,
      repositoryPublicationExecutions,
      repositoryPublicationEvidence,
      repositoryPublicationProviderHeartbeats,
      webhookDelayDirectiveRecords,
      webhookDelayDirectiveDeliveries,
      persistencePosture: cloudflarePersistencePosture,
      recoveryPosture: cloudflareRecoveryPosture,
    });
    const focusedOperationWorkflowRoute = summarizeCloudflareOperationWorkflowRoute({
      operation: focusedOperation,
      lifecycleStatus: focusedOperationLifecycleStatus,
      operationContinuityDirectionStatus,
      localCloudContinuityBridge,
      persistencePosture: cloudflarePersistencePosture,
      recoveryPosture: cloudflareRecoveryPosture,
      operationActivityTimeline: focusedOperationActivityTimeline,
      webhookDelayDirectiveRecords,
      webhookDelayDirectiveDeliveries,
      residentDispatchDecisions,
      residentDispatchWindowsFallbackRequests,
      residentDispatchWindowsFallbackEvidence,
      mailboxSendReviews,
      operationFocusReviews,
      tasks,
    });
    return {
      focusedOperation,
      focusedOperationStatusHistory,
      focusedOperationActivityTimeline,
      focusedOperationLifecycleStatus,
      focusedOperationWorkflowRoute,
    };
  }
  let {
    focusedOperation,
    focusedOperationStatusHistory,
    focusedOperationActivityTimeline,
    focusedOperationLifecycleStatus,
    focusedOperationWorkflowRoute,
  } = summarizeFocusedOperationArtifacts(selectCloudflareFocusedOperation(response.operations ?? [], params, response));
  const localIngressOperationPosture = summarizeCloudflareLocalIngressOperationPosture({
    localIngressRequests,
    localIngressEvidence,
    localIngressProviderHeartbeats,
  });
  const repositoryPublicationOperationPosture = summarizeCloudflareRepositoryPublicationOperationPosture({
    repositoryPublicationRequests,
    repositoryPublicationAdmissions,
    repositoryPublicationExecutions,
    repositoryPublicationEvidence,
    repositoryPublicationProviderHeartbeats,
  });
  let operationPostureOverview = summarizeCloudflareOperationPostureOverview(response.operations ?? [], {
    ...response,
    sessions,
    tasks,
    carrier_evidence: carrierEvidence,
    site_continuity_packets: continuityPackets,
    site_continuity_loop_reports: continuityLoopReports,
    operation: focusedOperation,
    resident_dispatch_windows_fallback_requests: residentDispatchWindowsFallbackRequests,
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
    local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
  }, {
    active_operation_id: focusedOperation?.operation_id ?? params.operation_id,
    site_id: siteId,
  });
  let operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, focusedOperation?.operation_id ?? params.operation_id ?? '');
  operationPostureOverview = normalizeCloudflareOperationPostureOverview(
    operationPostureOverview,
    operationPostureRoute,
    {
      lifecycle_status: focusedOperationLifecycleStatus,
      workflow_route: focusedOperationWorkflowRoute,
    },
    Array.isArray(response.operations) ? response.operations.length : 0,
  );
  operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, focusedOperation?.operation_id ?? params.operation_id ?? '');
  const postureTarget = operationPostureRoute.next_action === 'focus_next_operation'
    ? String(operationPostureRoute.target || '').trim()
    : '';
  if (postureTarget && postureTarget !== (focusedOperation?.operation_id ?? '')) {
    const targetOperation = (Array.isArray(response.operations) ? response.operations : []).find((operation) => operation?.operation_id === postureTarget);
    if (targetOperation) {
      const targetArtifacts = summarizeFocusedOperationArtifacts(targetOperation);
      if (shouldKeepFocusedOperationProjection({
        operation: focusedOperation,
        operation_workflow_route: focusedOperationWorkflowRoute,
      }, {
        operation: targetArtifacts.focusedOperation,
        operation_workflow_route: targetArtifacts.focusedOperationWorkflowRoute,
      })) {
        operationPostureOverview = {
          ...operationPostureOverview,
          next_operation_id: focusedOperation?.operation_id ?? null,
          next_status: focusedOperationWorkflowRoute?.status ?? operationPostureOverview.next_status,
          next_action: focusedOperationWorkflowRoute?.next_action ?? operationPostureOverview.next_action,
          next_reason: focusedOperationWorkflowRoute?.reason ?? operationPostureOverview.next_reason,
        };
        operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, focusedOperation?.operation_id ?? params.operation_id ?? '');
      } else {
        ({
          focusedOperation,
          focusedOperationStatusHistory,
          focusedOperationActivityTimeline,
          focusedOperationLifecycleStatus,
          focusedOperationWorkflowRoute,
        } = targetArtifacts);
        operationPostureOverview = summarizeCloudflareOperationPostureOverview(response.operations ?? [], {
          ...response,
          sessions,
          tasks,
          carrier_evidence: carrierEvidence,
          site_continuity_packets: continuityPackets,
          site_continuity_loop_reports: continuityLoopReports,
          operation: focusedOperation,
          resident_dispatch_windows_fallback_requests: residentDispatchWindowsFallbackRequests,
          resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
          local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
        }, {
          active_operation_id: focusedOperation?.operation_id ?? params.operation_id,
          site_id: siteId,
        });
        operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, focusedOperation?.operation_id ?? params.operation_id ?? '');
        operationPostureOverview = normalizeCloudflareOperationPostureOverview(
          operationPostureOverview,
          operationPostureRoute,
          {
            lifecycle_status: focusedOperationLifecycleStatus,
            workflow_route: focusedOperationWorkflowRoute,
          },
          Array.isArray(response.operations) ? response.operations.length : 0,
        );
        operationPostureRoute = summarizeCloudflareOperationPostureRoute(operationPostureOverview, focusedOperation?.operation_id ?? params.operation_id ?? '');
      }
    }
  }
  let siteProductStatus = summarizeCloudflareSiteProductStatus({
    site: response.site,
    operations: response.operations,
    memberships: response.memberships ?? (response.membership ? [response.membership] : []),
    authorityEvents: response.authority_events,
    sessions: response.sessions,
    local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
    tasks,
    carrierEvidence,
    carrierEvidenceReadStatus,
    continuityStatus: siteContinuityStatus,
    continuityLoopStatus: siteContinuityLoopStatus,
    continuityReconciliationExecutionStatus: siteContinuityReconciliationExecutionStatus,
    operationContinuityDirectionStatus,
    operationPostureOverview,
    focusedOperationLifecycle: {
      operation_id: focusedOperation?.operation_id ?? null,
      lifecycle_status: focusedOperationLifecycleStatus,
      workflow_route: focusedOperationWorkflowRoute,
    },
  });
  siteProductStatus = normalizeCloudflareSiteProductStatus(
    siteProductStatus,
    operationPostureOverview,
    {
      operation_id: focusedOperation?.operation_id ?? null,
      lifecycle_status: focusedOperationLifecycleStatus,
      workflow_route: focusedOperationWorkflowRoute,
    },
  );
  const cloudflareProductSurfaceReadiness = summarizeCloudflareProductSurfaceReadiness({
    siteProductStatus,
    persistencePosture: cloudflarePersistencePosture,
    recoveryPosture: cloudflareRecoveryPosture,
    localCloudContinuityBridge,
  });
  const focusedOperationLifecycle = {
    schema: 'narada.cloudflare_focused_operation_lifecycle.v1',
    site_id: siteId,
    operation_id: focusedOperation?.operation_id ?? null,
    operation: focusedOperation,
    lifecycle_status: focusedOperationLifecycleStatus,
    workflow_route: focusedOperationWorkflowRoute,
    operation_posture_overview: operationPostureOverview,
    operation_posture_route: operationPostureRoute,
    status_history: focusedOperationStatusHistory,
    activity_timeline: focusedOperationActivityTimeline,
    local_ingress_operation_posture: localIngressOperationPosture,
    repository_publication_operation_posture: repositoryPublicationOperationPosture,
  };
  return {
    sessions,
    tasks,
    site_continuity_packets: continuityPackets,
    site_continuity_loop_reports: continuityLoopReports,
    site_continuity_reconciliation_executions: continuityReconciliationExecutions,
    webhook_delay_shadow_observations: webhookDelayShadowObservations,
    webhook_delay_observation_primary_reads: webhookDelayObservationPrimaryReads,
    webhook_delay_scheduled_source_reads: webhookDelayScheduledSourceReads,
    webhook_delay_directive_records: webhookDelayDirectiveRecords,
    webhook_delay_directive_deliveries: webhookDelayDirectiveDeliveries,
    resident_loop_shadow_runs: residentLoopShadowRuns,
    mailbox_status_shadow_reads: mailboxStatusShadowReads,
    mailbox_status_source_reads: mailboxStatusSourceReads,
    mailbox_draft_reply_proposals: mailboxDraftReplyProposals,
    mailbox_outlook_draft_creates: mailboxOutlookDraftCreates,
    mailbox_send_accepted_records: mailboxSendAcceptedRecords,
    mailbox_send_confirmations: mailboxSendConfirmations,
    mailbox_send_reviews: mailboxSendReviews,
    operation_focus_reviews: operationFocusReviews,
    site_file_change_proposals: siteFileChangeProposals,
    site_file_materializations: siteFileMaterializations,
    local_ingress_requests: localIngressRequests,
    local_ingress_evidence: localIngressEvidence,
    local_ingress_provider_heartbeats: localIngressProviderHeartbeats,
    repository_publication_requests: repositoryPublicationRequests,
    repository_publication_admissions: repositoryPublicationAdmissions,
    repository_publication_executions: repositoryPublicationExecutions,
    repository_publication_evidence: repositoryPublicationEvidence,
    repository_publication_provider_heartbeats: repositoryPublicationProviderHeartbeats,
    task_lifecycle_shadow_reads: taskLifecycleShadowReads,
    task_lifecycle_write_admissions: taskLifecycleWriteAdmissions,
    task_lifecycle_tasks: taskLifecycleTasks,
    resident_dispatch_decisions: residentDispatchDecisions,
    resident_dispatch_windows_fallback_requests: residentDispatchWindowsFallbackRequests,
    resident_dispatch_windows_fallback_evidence: residentDispatchWindowsFallbackEvidence,
    local_resident_carrier_bridge_records: localResidentCarrierBridgeRecords,
    carrier_evidence: carrierEvidence,
    carrier_evidence_read_status: carrierEvidenceReadStatus,
    site_authority: siteAuthority,
    site_continuity: siteContinuity,
    site_continuity_status: siteContinuityStatus,
    site_continuity_loop_status: siteContinuityLoopStatus,
    site_continuity_reconciliation_execution_status: siteContinuityReconciliationExecutionStatus,
    local_cloud_continuity_bridge: localCloudContinuityBridge,
    operation_continuity_direction_status: operationContinuityDirectionStatus,
    cloudflare_persistence_posture: cloudflarePersistencePosture,
    cloudflare_recovery_posture: cloudflareRecoveryPosture,
    cloudflare_product_surface_readiness: cloudflareProductSurfaceReadiness,
    site_product_status: siteProductStatus,
    focused_operation_lifecycle: focusedOperationLifecycle,
    operation_status_history: focusedOperationStatusHistory,
    operation_activity_timeline: focusedOperationActivityTimeline,
    operation_lifecycle_status: focusedOperationLifecycleStatus,
    local_ingress_operation_posture: localIngressOperationPosture,
    repository_publication_operation_posture: repositoryPublicationOperationPosture,
    operation_posture_overview: operationPostureOverview,
    operation_posture_route: operationPostureRoute,
    operation_workflow_route: focusedOperationWorkflowRoute,
  };
}

async function startCloudflareResidentDispatchWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const dispatch = createResidentDispatchDecision(siteId, params, principal);
  const sessionStart = {
    operation: 'session.start',
    request_id: dispatch.dispatch_request_id,
    params: {
      carrier_session_id: dispatch.carrier_session_id,
      agent_id: dispatch.agent_id,
      site_id: siteId,
      site_root: dispatch.site_root,
      site_ref: dispatch.site_ref,
      operation_id: dispatch.operation_id,
    },
  };
  const routed = await routeCarrierSessionRequest('https://carrier.dispatch.local/api/carrier', sessionStart, principal, env);
  const cloudflareStarted = routed.status >= 200 && routed.status < 300 && routed.body?.ok !== false;
  const record = {
    ...dispatch,
    decision_state: cloudflareStarted ? 'cloudflare_primary_started' : 'cloudflare_primary_failed_windows_fallback_available',
    dispatch_action: 'cloudflare_session_start',
    fallback_status: 'available',
    session_start_status: routed.status,
    session_start_ok: routed.body?.ok === true,
    session_start_body: routed.body,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await recordCloudflareResidentDispatchDecision(env, record);
  return {
    ok: cloudflareStarted,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
    status: record.decision_state,
    site_id: siteId,
    operation_id: record.operation_id,
    carrier_session_id: record.carrier_session_id,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    dispatch_action: record.dispatch_action,
    decision: record,
    session_start: routed.body,
  };
}

function createResidentDispatchDecision(siteId, params = {}, principal = null) {
  const nowToken = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const operationId = params.operation_id ?? 'operation_narada_cloudflare_control';
  const carrierSessionId = params.carrier_session_id ?? `carrier_session_cloudflare_dispatch_${nowToken}`;
  return {
    dispatch_decision_id: params.dispatch_decision_id ?? `resident_dispatch_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(carrierSessionId)}`,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    dispatch_request_id: params.dispatch_request_id ?? `request_resident_dispatch_${nowToken}`,
    agent_id: params.agent_id ?? 'narada.cloudflare.dispatch',
    site_root: params.site_root ?? params.site_ref ?? `cloudflare://${siteId}`,
    site_ref: params.site_ref ?? `cloudflare://${siteId}`,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_ref: params.windows_fallback_ref ?? params.fallback_ref ?? 'windows_local_site_resident_loop',
    dispatch_scope: params.dispatch_scope ?? 'controlled_operation_session_start',
    requested_by_principal_id: principal?.principal_id ?? 'unknown-principal',
  };
}

async function recordCloudflareResidentDispatchDecision(env = {}, record) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareResidentDispatchDecisionSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_dispatch_decisions (
      dispatch_decision_id,
      site_id,
      operation_id,
      carrier_session_id,
      decision_state,
      dispatch_authority,
      fallback_authority,
      fallback_status,
      dispatch_action,
      dispatch_scope,
      session_start_status,
      session_start_ok,
      decision_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dispatch_decision_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      carrier_session_id = excluded.carrier_session_id,
      decision_state = excluded.decision_state,
      dispatch_authority = excluded.dispatch_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      dispatch_action = excluded.dispatch_action,
      dispatch_scope = excluded.dispatch_scope,
      session_start_status = excluded.session_start_status,
      session_start_ok = excluded.session_start_ok,
      decision_json = excluded.decision_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.dispatch_decision_id,
    record.site_id,
    record.operation_id,
    record.carrier_session_id,
    record.decision_state,
    record.dispatch_authority,
    record.fallback_authority,
    record.fallback_status,
    record.dispatch_action,
    record.dispatch_scope,
    record.session_start_status,
    record.session_start_ok ? 1 : 0,
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return { ok: true };
}

async function ensureCloudflareResidentDispatchDecisionSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_decisions (
      dispatch_decision_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT,
      decision_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      dispatch_scope TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      decision_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_decisions_site_recorded
    ON cloudflare_resident_dispatch_decisions(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentDispatchDecisions(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentDispatchDecisionSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_dispatch_decisions
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    dispatch_decision_id: row.dispatch_decision_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    carrier_session_id: row.carrier_session_id,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_PRIMARY_SCHEMA,
    decision_state: row.decision_state,
    dispatch_authority: row.dispatch_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    dispatch_action: row.dispatch_action,
    dispatch_scope: row.dispatch_scope,
    session_start_status: Number(row.session_start_status),
    session_start_ok: Boolean(row.session_start_ok),
    decision: parseJsonObject(row.decision_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function createCloudflareResidentDispatchWindowsFallbackRequest(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createResidentDispatchWindowsFallbackRequest(siteId, params);
  if (!payload.ok) return payload;
  const request = payload.request;
  const record = {
    fallback_request_id: params.fallback_request_id ?? residentDispatchWindowsFallbackRequestId(siteId, request),
    site_id: siteId,
    generated_at: request.generated_at,
    operation_id: request.operation_id,
    dispatch_decision_id: request.dispatch_decision_id,
    carrier_session_id: request.carrier_session_id,
    requested_action_ref: request.requested_action_ref,
    requested_action_summary: request.requested_action_summary,
    governed_request_contract_ref: request.governed_request_contract_ref,
    evidence_return_contract_ref: request.evidence_return_contract_ref,
    rollback_plan_ref: request.rollback_plan_ref,
    authority_locus: request.authority_locus,
    windows_fallback_ref: request.windows_fallback_ref,
    local_executor_authority: request.local_executor_authority,
    local_execution_admission: request.local_execution_admission,
    direct_cloudflare_session_start_admission: request.direct_cloudflare_session_start_admission,
    request_posture: request.request_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareResidentDispatchWindowsFallbackRequestSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_dispatch_windows_fallback_requests (
      fallback_request_id,
      site_id,
      generated_at,
      operation_id,
      dispatch_decision_id,
      carrier_session_id,
      requested_action_ref,
      requested_action_summary,
      governed_request_contract_ref,
      evidence_return_contract_ref,
      rollback_plan_ref,
      authority_locus,
      windows_fallback_ref,
      local_executor_authority,
      local_execution_admission,
      direct_cloudflare_session_start_admission,
      request_posture,
      request_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fallback_request_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      dispatch_decision_id = excluded.dispatch_decision_id,
      carrier_session_id = excluded.carrier_session_id,
      requested_action_ref = excluded.requested_action_ref,
      requested_action_summary = excluded.requested_action_summary,
      governed_request_contract_ref = excluded.governed_request_contract_ref,
      evidence_return_contract_ref = excluded.evidence_return_contract_ref,
      rollback_plan_ref = excluded.rollback_plan_ref,
      authority_locus = excluded.authority_locus,
      windows_fallback_ref = excluded.windows_fallback_ref,
      local_executor_authority = excluded.local_executor_authority,
      local_execution_admission = excluded.local_execution_admission,
      direct_cloudflare_session_start_admission = excluded.direct_cloudflare_session_start_admission,
      request_posture = excluded.request_posture,
      request_json = excluded.request_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.fallback_request_id,
    record.site_id,
    record.generated_at,
    record.operation_id,
    record.dispatch_decision_id,
    record.carrier_session_id,
    record.requested_action_ref,
    record.requested_action_summary,
    record.governed_request_contract_ref,
    record.evidence_return_contract_ref,
    record.rollback_plan_ref,
    record.authority_locus,
    record.windows_fallback_ref,
    record.local_executor_authority,
    record.local_execution_admission,
    record.direct_cloudflare_session_start_admission,
    record.request_posture,
    JSON.stringify({ ...record, request }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    resident_dispatch_windows_fallback_request_authority: record.authority_locus,
    local_executor_authority: record.local_executor_authority,
    local_execution_admission: record.local_execution_admission,
    direct_cloudflare_session_start_admission: record.direct_cloudflare_session_start_admission,
    authority_partition: 'cloudflare_records_windows_resident_fallback_request_windows_executes_and_returns_evidence',
    fallback_request: {
      ...request,
      fallback_request_id: record.fallback_request_id,
      recorded_by_principal_id: record.recorded_by_principal_id,
      recorded_at: record.recorded_at,
    },
    record,
  };
}

async function ensureCloudflareResidentDispatchWindowsFallbackRequestSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_windows_fallback_requests (
      fallback_request_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      dispatch_decision_id TEXT NOT NULL,
      carrier_session_id TEXT,
      requested_action_ref TEXT NOT NULL,
      requested_action_summary TEXT NOT NULL,
      governed_request_contract_ref TEXT NOT NULL,
      evidence_return_contract_ref TEXT NOT NULL,
      rollback_plan_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      windows_fallback_ref TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_execution_admission TEXT NOT NULL,
      direct_cloudflare_session_start_admission TEXT NOT NULL,
      request_posture TEXT NOT NULL,
      request_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_windows_fallback_requests_site_recorded
    ON cloudflare_resident_dispatch_windows_fallback_requests(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentDispatchWindowsFallbackRequests(env = {}, siteId, limit, filters = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentDispatchWindowsFallbackRequestSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const operationId = normalizeNullableWorkerString(filters.operation_id ?? null);
  const dispatchDecisionId = normalizeNullableWorkerString(filters.dispatch_decision_id ?? null);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_dispatch_windows_fallback_requests
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? [])
    .filter((row) => (!operationId || row.operation_id === operationId) && (!dispatchDecisionId || row.dispatch_decision_id === dispatchDecisionId))
    .map((row) => ({
    fallback_request_id: row.fallback_request_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_SCHEMA,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    dispatch_decision_id: row.dispatch_decision_id,
    carrier_session_id: row.carrier_session_id,
    requested_action_ref: row.requested_action_ref,
    requested_action_summary: row.requested_action_summary,
    governed_request_contract_ref: row.governed_request_contract_ref,
    evidence_return_contract_ref: row.evidence_return_contract_ref,
    rollback_plan_ref: row.rollback_plan_ref,
    authority_locus: row.authority_locus,
    windows_fallback_ref: row.windows_fallback_ref,
    local_executor_authority: row.local_executor_authority,
    local_execution_admission: row.local_execution_admission,
    direct_cloudflare_session_start_admission: row.direct_cloudflare_session_start_admission,
    request_posture: row.request_posture,
    record: parseJsonObject(row.request_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createResidentDispatchWindowsFallbackEvidence(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.evidence ?? {};
  const fallbackRequestId = String(source.fallback_request_id ?? params.fallback_request_id ?? '');
  const operationId = String(source.operation_id ?? params.operation_id ?? '');
  const dispatchDecisionId = String(source.dispatch_decision_id ?? params.dispatch_decision_id ?? '');
  const localExecutionId = String(source.local_execution_id ?? params.local_execution_id ?? '');
  const windowsAdmissionAction = String(source.windows_admission_action ?? params.windows_admission_action ?? 'admit');
  const localExecutionStatus = String(source.local_execution_status ?? params.local_execution_status ?? 'completed');
  const localSessionStartAdmission = String(source.local_session_start_admission ?? params.local_session_start_admission ?? 'admitted_by_windows_resident_loop');
  const directCloudflareSessionStartAdmission = String(source.direct_cloudflare_session_start_admission ?? params.direct_cloudflare_session_start_admission ?? 'not_admitted');
  const localResidentSessionRef = String(source.local_resident_session_ref ?? params.local_resident_session_ref ?? '');
  if (!fallbackRequestId) return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_request_id_required' };
  if (!operationId) return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_operation_id_required' };
  if (!dispatchDecisionId) return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_dispatch_decision_id_required' };
  if (!localExecutionId) return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_execution_id_required' };
  if (!localResidentSessionRef) return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_session_ref_required' };
  if (windowsAdmissionAction !== 'admit') return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_windows_admission_action_invalid', windows_admission_action: windowsAdmissionAction };
  if (localExecutionStatus !== 'completed') return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_execution_status_invalid', local_execution_status: localExecutionStatus };
  if (localSessionStartAdmission !== 'admitted_by_windows_resident_loop') return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_session_start_admission_invalid', local_session_start_admission: localSessionStartAdmission };
  if (directCloudflareSessionStartAdmission !== 'not_admitted') return { ok: false, code: 'resident_dispatch_windows_fallback_evidence_direct_cloudflare_session_start_admission_invalid', direct_cloudflare_session_start_admission: directCloudflareSessionStartAdmission };
  return {
    ok: true,
    evidence: {
      schema: 'narada.sonar.cloudflare_resident_dispatch_windows_fallback_evidence_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      fallback_request_id: fallbackRequestId,
      operation_id: operationId,
      dispatch_decision_id: dispatchDecisionId,
      local_execution_id: localExecutionId,
      windows_admission_action: windowsAdmissionAction,
      windows_admission_reason: String(source.windows_admission_reason ?? params.windows_admission_reason ?? 'governed_windows_resident_fallback_request_admitted'),
      local_execution_status: localExecutionStatus,
      local_executor_authority: String(source.local_executor_authority ?? params.local_executor_authority ?? WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY),
      local_session_start_admission: localSessionStartAdmission,
      local_resident_session_ref: localResidentSessionRef,
      rollback_evidence_ref: String(source.rollback_evidence_ref ?? params.rollback_evidence_ref ?? ''),
      direct_cloudflare_session_start_admission: directCloudflareSessionStartAdmission,
      evidence_posture: 'windows_resident_fallback_executed_cloudflare_recorded_session_start_evidence',
    },
  };
}

async function recordCloudflareResidentDispatchWindowsFallbackEvidence(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createResidentDispatchWindowsFallbackEvidence(siteId, params);
  if (!payload.ok) return payload;
  const evidence = payload.evidence;
  const record = {
    fallback_evidence_id: params.fallback_evidence_id ?? `resident_dispatch_windows_fallback_evidence_${safeIdToken(siteId)}_${safeIdToken(evidence.local_execution_id)}`,
    site_id: siteId,
    generated_at: evidence.generated_at,
    fallback_request_id: evidence.fallback_request_id,
    operation_id: evidence.operation_id,
    dispatch_decision_id: evidence.dispatch_decision_id,
    local_execution_id: evidence.local_execution_id,
    windows_admission_action: evidence.windows_admission_action,
    windows_admission_reason: evidence.windows_admission_reason,
    local_execution_status: evidence.local_execution_status,
    local_executor_authority: evidence.local_executor_authority,
    local_session_start_admission: evidence.local_session_start_admission,
    local_resident_session_ref: evidence.local_resident_session_ref,
    rollback_evidence_ref: evidence.rollback_evidence_ref,
    direct_cloudflare_session_start_admission: evidence.direct_cloudflare_session_start_admission,
    evidence_posture: evidence.evidence_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareResidentDispatchWindowsFallbackEvidenceSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_dispatch_windows_fallback_evidence (
      fallback_evidence_id,
      site_id,
      generated_at,
      fallback_request_id,
      operation_id,
      dispatch_decision_id,
      local_execution_id,
      windows_admission_action,
      windows_admission_reason,
      local_execution_status,
      local_executor_authority,
      local_session_start_admission,
      local_resident_session_ref,
      rollback_evidence_ref,
      direct_cloudflare_session_start_admission,
      evidence_posture,
      evidence_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fallback_evidence_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      fallback_request_id = excluded.fallback_request_id,
      operation_id = excluded.operation_id,
      dispatch_decision_id = excluded.dispatch_decision_id,
      local_execution_id = excluded.local_execution_id,
      windows_admission_action = excluded.windows_admission_action,
      windows_admission_reason = excluded.windows_admission_reason,
      local_execution_status = excluded.local_execution_status,
      local_executor_authority = excluded.local_executor_authority,
      local_session_start_admission = excluded.local_session_start_admission,
      local_resident_session_ref = excluded.local_resident_session_ref,
      rollback_evidence_ref = excluded.rollback_evidence_ref,
      direct_cloudflare_session_start_admission = excluded.direct_cloudflare_session_start_admission,
      evidence_posture = excluded.evidence_posture,
      evidence_json = excluded.evidence_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.fallback_evidence_id,
    record.site_id,
    record.generated_at,
    record.fallback_request_id,
    record.operation_id,
    record.dispatch_decision_id,
    record.local_execution_id,
    record.windows_admission_action,
    record.windows_admission_reason,
    record.local_execution_status,
    record.local_executor_authority,
    record.local_session_start_admission,
    record.local_resident_session_ref,
    record.rollback_evidence_ref,
    record.direct_cloudflare_session_start_admission,
    record.evidence_posture,
    JSON.stringify({ ...record, evidence }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    resident_dispatch_windows_fallback_evidence_authority: record.local_executor_authority,
    cloudflare_evidence_store_authority: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_STORE_AUTHORITY,
    local_session_start_admission: record.local_session_start_admission,
    direct_cloudflare_session_start_admission: record.direct_cloudflare_session_start_admission,
    authority_partition: 'windows_resident_loop_executes_fallback_cloudflare_records_session_start_evidence',
    evidence,
    record,
  };
}

async function ensureCloudflareResidentDispatchWindowsFallbackEvidenceSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_dispatch_windows_fallback_evidence (
      fallback_evidence_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      fallback_request_id TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      dispatch_decision_id TEXT NOT NULL,
      local_execution_id TEXT NOT NULL,
      windows_admission_action TEXT NOT NULL,
      windows_admission_reason TEXT NOT NULL,
      local_execution_status TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_session_start_admission TEXT NOT NULL,
      local_resident_session_ref TEXT NOT NULL,
      rollback_evidence_ref TEXT,
      direct_cloudflare_session_start_admission TEXT NOT NULL,
      evidence_posture TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_dispatch_windows_fallback_evidence_site_recorded
    ON cloudflare_resident_dispatch_windows_fallback_evidence(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentDispatchWindowsFallbackEvidence(env = {}, siteId, params = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentDispatchWindowsFallbackEvidenceSchema(db);
  const boundedLimit = clampInteger(params.resident_dispatch_windows_fallback_evidence_limit ?? params.limit, 0, 100, 25);
  const fallbackRequestId = normalizeNullableWorkerString(params.fallback_request_id ?? null);
  const operationId = normalizeNullableWorkerString(params.operation_id ?? null);
  const dispatchDecisionId = normalizeNullableWorkerString(params.dispatch_decision_id ?? null);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_dispatch_windows_fallback_evidence
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? [])
    .filter((row) => (!fallbackRequestId || row.fallback_request_id === fallbackRequestId) && (!operationId || row.operation_id === operationId) && (!dispatchDecisionId || row.dispatch_decision_id === dispatchDecisionId))
    .map((row) => ({
      fallback_evidence_id: row.fallback_evidence_id,
      site_id: row.site_id,
      schema: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_EVIDENCE_SCHEMA,
      generated_at: row.generated_at,
      fallback_request_id: row.fallback_request_id,
      operation_id: row.operation_id,
      dispatch_decision_id: row.dispatch_decision_id,
      local_execution_id: row.local_execution_id,
      windows_admission_action: row.windows_admission_action,
      windows_admission_reason: row.windows_admission_reason,
      local_execution_status: row.local_execution_status,
      local_executor_authority: row.local_executor_authority,
      local_session_start_admission: row.local_session_start_admission,
      local_resident_session_ref: row.local_resident_session_ref,
      rollback_evidence_ref: row.rollback_evidence_ref,
      direct_cloudflare_session_start_admission: row.direct_cloudflare_session_start_admission,
      evidence_posture: row.evidence_posture,
      record: parseJsonObject(row.evidence_json),
      recorded_by_principal_id: row.recorded_by_principal_id,
      recorded_at: row.recorded_at,
    }));
}

function createLocalResidentCarrierBridge(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.bridge ?? {};
  const generatedAt = String(source.generated_at ?? params.generated_at ?? new Date().toISOString());
  const operationId = normalizeNullableWorkerString(source.operation_id ?? params.operation_id ?? null);
  const dispatchDecisionId = normalizeNullableWorkerString(source.dispatch_decision_id ?? params.dispatch_decision_id ?? null);
  const fallbackEvidenceId = normalizeNullableWorkerString(source.fallback_evidence_id ?? params.fallback_evidence_id ?? null);
  const localResidentSessionRef = String(source.local_resident_session_ref ?? params.local_resident_session_ref ?? '').trim();
  const cloudflareCarrierSessionId = String(
    source.cloudflare_carrier_session_id
      ?? params.cloudflare_carrier_session_id
      ?? `cloudflare-bridged:${safeIdToken(siteId)}:${safeIdToken(operationId ?? 'operation')}:${safeIdToken(localResidentSessionRef || 'session')}`,
  ).trim();
  const bridgeAdmissionAction = String(source.bridge_admission_action ?? params.bridge_admission_action ?? 'admit');
  const cloudflareSessionReplayBindingAdmission = String(
    source.cloudflare_session_replay_binding_admission
      ?? params.cloudflare_session_replay_binding_admission
      ?? 'admitted_by_cloudflare_operator',
  );
  const cloudflareEvidenceReplayBindingAdmission = String(
    source.cloudflare_evidence_replay_binding_admission
      ?? params.cloudflare_evidence_replay_binding_admission
      ?? 'admitted_by_cloudflare_operator',
  );
  const cloudflareRuntimeSessionStartAdmission = String(
    source.cloudflare_runtime_session_start_admission
      ?? params.cloudflare_runtime_session_start_admission
      ?? 'not_admitted',
  );
  if (!operationId) return { ok: false, code: 'local_resident_carrier_bridge_operation_id_required' };
  if (!localResidentSessionRef) return { ok: false, code: 'local_resident_carrier_bridge_session_ref_required' };
  if (!cloudflareCarrierSessionId) return { ok: false, code: 'local_resident_carrier_bridge_cloudflare_session_id_required' };
  if (bridgeAdmissionAction !== 'admit') return { ok: false, code: 'local_resident_carrier_bridge_admission_action_invalid', bridge_admission_action: bridgeAdmissionAction };
  if (cloudflareSessionReplayBindingAdmission !== 'admitted_by_cloudflare_operator') {
    return { ok: false, code: 'local_resident_carrier_bridge_session_replay_binding_invalid', cloudflare_session_replay_binding_admission: cloudflareSessionReplayBindingAdmission };
  }
  if (cloudflareEvidenceReplayBindingAdmission !== 'admitted_by_cloudflare_operator') {
    return { ok: false, code: 'local_resident_carrier_bridge_evidence_replay_binding_invalid', cloudflare_evidence_replay_binding_admission: cloudflareEvidenceReplayBindingAdmission };
  }
  if (cloudflareRuntimeSessionStartAdmission !== 'not_admitted') {
    return { ok: false, code: 'local_resident_carrier_bridge_runtime_session_start_invalid', cloudflare_runtime_session_start_admission: cloudflareRuntimeSessionStartAdmission };
  }
  return {
    ok: true,
    bridge: {
      schema: CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_SCHEMA,
      site_id: siteId,
      generated_at: generatedAt,
      operation_id: operationId,
      dispatch_decision_id: dispatchDecisionId,
      fallback_evidence_id: fallbackEvidenceId,
      local_resident_session_ref: localResidentSessionRef,
      cloudflare_carrier_session_id: cloudflareCarrierSessionId,
      bridge_admission_action: bridgeAdmissionAction,
      bridge_admission_reason: String(source.bridge_admission_reason ?? params.bridge_admission_reason ?? 'governed_local_resident_carrier_bridge_admitted'),
      bridge_authority: String(source.bridge_authority ?? params.bridge_authority ?? CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_AUTHORITY),
      cloudflare_session_replay_binding_admission: cloudflareSessionReplayBindingAdmission,
      cloudflare_evidence_replay_binding_admission: cloudflareEvidenceReplayBindingAdmission,
      cloudflare_runtime_session_start_admission: cloudflareRuntimeSessionStartAdmission,
      bridge_posture: String(source.bridge_posture ?? params.bridge_posture ?? 'local_resident_inhabitance_bridged_to_cloudflare_replay'),
    },
  };
}

async function recordCloudflareLocalResidentCarrierBridge(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createLocalResidentCarrierBridge(siteId, params);
  if (!payload.ok) return payload;
  const bridge = payload.bridge;
  const record = {
    bridge_id: params.bridge_id ?? `local_resident_carrier_bridge_${safeIdToken(siteId)}_${safeIdToken(bridge.operation_id)}_${safeIdToken(bridge.local_resident_session_ref)}`,
    site_id: siteId,
    generated_at: bridge.generated_at,
    operation_id: bridge.operation_id,
    dispatch_decision_id: bridge.dispatch_decision_id,
    fallback_evidence_id: bridge.fallback_evidence_id,
    local_resident_session_ref: bridge.local_resident_session_ref,
    cloudflare_carrier_session_id: bridge.cloudflare_carrier_session_id,
    bridge_admission_action: bridge.bridge_admission_action,
    bridge_admission_reason: bridge.bridge_admission_reason,
    bridge_authority: bridge.bridge_authority,
    cloudflare_session_replay_binding_admission: bridge.cloudflare_session_replay_binding_admission,
    cloudflare_evidence_replay_binding_admission: bridge.cloudflare_evidence_replay_binding_admission,
    cloudflare_runtime_session_start_admission: bridge.cloudflare_runtime_session_start_admission,
    bridge_posture: bridge.bridge_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareLocalResidentCarrierBridgeSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_local_resident_carrier_bridge (
      bridge_id,
      site_id,
      generated_at,
      operation_id,
      dispatch_decision_id,
      fallback_evidence_id,
      local_resident_session_ref,
      cloudflare_carrier_session_id,
      bridge_admission_action,
      bridge_admission_reason,
      bridge_authority,
      cloudflare_session_replay_binding_admission,
      cloudflare_evidence_replay_binding_admission,
      cloudflare_runtime_session_start_admission,
      bridge_posture,
      bridge_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bridge_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      dispatch_decision_id = excluded.dispatch_decision_id,
      fallback_evidence_id = excluded.fallback_evidence_id,
      local_resident_session_ref = excluded.local_resident_session_ref,
      cloudflare_carrier_session_id = excluded.cloudflare_carrier_session_id,
      bridge_admission_action = excluded.bridge_admission_action,
      bridge_admission_reason = excluded.bridge_admission_reason,
      bridge_authority = excluded.bridge_authority,
      cloudflare_session_replay_binding_admission = excluded.cloudflare_session_replay_binding_admission,
      cloudflare_evidence_replay_binding_admission = excluded.cloudflare_evidence_replay_binding_admission,
      cloudflare_runtime_session_start_admission = excluded.cloudflare_runtime_session_start_admission,
      bridge_posture = excluded.bridge_posture,
      bridge_json = excluded.bridge_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.bridge_id,
    record.site_id,
    record.generated_at,
    record.operation_id,
    record.dispatch_decision_id,
    record.fallback_evidence_id,
    record.local_resident_session_ref,
    record.cloudflare_carrier_session_id,
    record.bridge_admission_action,
    record.bridge_admission_reason,
    record.bridge_authority,
    record.cloudflare_session_replay_binding_admission,
    record.cloudflare_evidence_replay_binding_admission,
    record.cloudflare_runtime_session_start_admission,
    record.bridge_posture,
    JSON.stringify({ ...record, bridge }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    local_resident_carrier_bridge_authority: record.bridge_authority,
    local_resident_carrier_bridge_store_authority: CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_STORE_AUTHORITY,
    cloudflare_session_replay_binding_admission: record.cloudflare_session_replay_binding_admission,
    cloudflare_evidence_replay_binding_admission: record.cloudflare_evidence_replay_binding_admission,
    cloudflare_runtime_session_start_admission: record.cloudflare_runtime_session_start_admission,
    authority_partition: 'cloudflare_records_local_resident_carrier_replay_bridge_without_runtime_session_start',
    bridge,
    record,
  };
}

async function ensureCloudflareLocalResidentCarrierBridgeSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_local_resident_carrier_bridge (
      bridge_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      dispatch_decision_id TEXT,
      fallback_evidence_id TEXT,
      local_resident_session_ref TEXT NOT NULL,
      cloudflare_carrier_session_id TEXT NOT NULL,
      bridge_admission_action TEXT NOT NULL,
      bridge_admission_reason TEXT NOT NULL,
      bridge_authority TEXT NOT NULL,
      cloudflare_session_replay_binding_admission TEXT NOT NULL,
      cloudflare_evidence_replay_binding_admission TEXT NOT NULL,
      cloudflare_runtime_session_start_admission TEXT NOT NULL,
      bridge_posture TEXT NOT NULL,
      bridge_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_local_resident_carrier_bridge_site_recorded
    ON cloudflare_local_resident_carrier_bridge(site_id, recorded_at)
  `).run();
}

async function listCloudflareLocalResidentCarrierBridgeRecords(env = {}, siteId, params = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareLocalResidentCarrierBridgeSchema(db);
  const boundedLimit = clampInteger(params.local_resident_carrier_bridge_limit ?? params.limit, 0, 100, 25);
  const operationId = normalizeNullableWorkerString(params.operation_id ?? null);
  const fallbackEvidenceId = normalizeNullableWorkerString(params.fallback_evidence_id ?? null);
  const dispatchDecisionId = normalizeNullableWorkerString(params.dispatch_decision_id ?? null);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_local_resident_carrier_bridge
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? [])
    .filter((row) => (!operationId || row.operation_id === operationId)
      && (!fallbackEvidenceId || row.fallback_evidence_id === fallbackEvidenceId)
      && (!dispatchDecisionId || row.dispatch_decision_id === dispatchDecisionId))
    .map((row) => ({
      bridge_id: row.bridge_id,
      site_id: row.site_id,
      schema: CLOUDFLARE_LOCAL_RESIDENT_CARRIER_BRIDGE_SCHEMA,
      generated_at: row.generated_at,
      operation_id: row.operation_id,
      dispatch_decision_id: row.dispatch_decision_id,
      fallback_evidence_id: row.fallback_evidence_id,
      local_resident_session_ref: row.local_resident_session_ref,
      cloudflare_carrier_session_id: row.cloudflare_carrier_session_id,
      bridge_admission_action: row.bridge_admission_action,
      bridge_admission_reason: row.bridge_admission_reason,
      bridge_authority: row.bridge_authority,
      cloudflare_session_replay_binding_admission: row.cloudflare_session_replay_binding_admission,
      cloudflare_evidence_replay_binding_admission: row.cloudflare_evidence_replay_binding_admission,
      cloudflare_runtime_session_start_admission: row.cloudflare_runtime_session_start_admission,
      bridge_posture: row.bridge_posture,
      record: parseJsonObject(row.bridge_json),
      recorded_by_principal_id: row.recorded_by_principal_id,
      recorded_at: row.recorded_at,
    }));
}

function createResidentDispatchWindowsFallbackRequest(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.request ?? {};
  const generatedAt = String(params.generated_at ?? source.generated_at ?? new Date().toISOString());
  const operationId = normalizeNullableWorkerString(params.operation_id ?? source.operation_id ?? null);
  const dispatchDecisionId = normalizeNullableWorkerString(params.dispatch_decision_id ?? source.dispatch_decision_id ?? null);
  if (!operationId) return { ok: false, code: 'missing_operation_id' };
  if (!dispatchDecisionId) return { ok: false, code: 'missing_dispatch_decision_id' };
  return {
    ok: true,
    request: {
      generated_at: generatedAt,
      site_id: siteId,
      operation_id: operationId,
      dispatch_decision_id: dispatchDecisionId,
      carrier_session_id: normalizeNullableWorkerString(params.carrier_session_id ?? source.carrier_session_id ?? null),
      requested_action_ref: String(params.requested_action_ref ?? source.requested_action_ref ?? 'local-windows-action:resident-session-start:v1'),
      requested_action_summary: String(params.requested_action_summary ?? source.requested_action_summary ?? 'request governed Windows resident session start after Cloudflare primary dispatch fallback'),
      governed_request_contract_ref: String(params.governed_request_contract_ref ?? source.governed_request_contract_ref ?? 'contract:cloudflare-to-windows-resident-fallback-request:v1'),
      evidence_return_contract_ref: String(params.evidence_return_contract_ref ?? source.evidence_return_contract_ref ?? 'contract:windows-resident-fallback-evidence-return:v1'),
      rollback_plan_ref: String(params.rollback_plan_ref ?? source.rollback_plan_ref ?? 'rollback:windows-resident-fallback-request:v1'),
      authority_locus: CLOUDFLARE_RESIDENT_DISPATCH_WINDOWS_FALLBACK_REQUEST_AUTHORITY,
      windows_fallback_ref: String(params.windows_fallback_ref ?? source.windows_fallback_ref ?? WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY),
      local_executor_authority: WINDOWS_LOCAL_SITE_RESIDENT_LOOP_AUTHORITY,
      local_execution_admission: 'pending_windows_admission',
      direct_cloudflare_session_start_admission: 'not_admitted',
      request_posture: 'governed_windows_fallback_request_pending_execution',
    },
  };
}

function residentDispatchWindowsFallbackRequestId(siteId, request = {}) {
  return `resident_dispatch_windows_fallback_request_${safeIdToken(siteId)}_${safeIdToken(request.operation_id ?? 'operation')}_${safeIdToken(request.dispatch_decision_id ?? 'dispatch')}_${safeIdToken(request.generated_at ?? new Date().toISOString())}`;
}

function normalizeNullableWorkerString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function recordCloudflareMailboxStatusShadowRead(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createMailboxStatusShadowRead(siteId, params);
  if (!payload.ok) return payload;
  const read = payload.read;
  const record = {
    read_id: params.read_id ?? mailboxStatusShadowReadId(siteId, read),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_STATUS_SHADOW_READ_SCHEMA,
    source_locus: read.authority_locus,
    target_locus: read.shadow_target_locus,
    source_schema: read.source_schema,
    generated_at: read.generated_at,
    account_ref: read.account_ref,
    mailbox_status: read.mailbox_status,
    unread_count: read.unread_count,
    pending_draft_count: read.pending_draft_count,
    pending_send_count: read.pending_send_count,
    latest_message_at: read.latest_message_at,
    ticket_count: read.ticket_count,
    sync_state: read.sync_state,
    mailbox_read_authority: read.mailbox_read_authority,
    mailbox_write_authority: read.mailbox_write_authority,
    mailbox_send_admission: read.mailbox_send_admission,
    mailbox_mutation_admission: read.mailbox_mutation_admission,
    shadow_read_posture: read.shadow_read_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareMailboxStatusShadowReadSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_status_shadow_reads (
      read_id,
      site_id,
      source_locus,
      target_locus,
      source_schema,
      generated_at,
      account_ref,
      mailbox_status,
      unread_count,
      pending_draft_count,
      pending_send_count,
      latest_message_at,
      ticket_count,
      sync_state,
      mailbox_read_authority,
      mailbox_write_authority,
      mailbox_send_admission,
      mailbox_mutation_admission,
      shadow_read_posture,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(read_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      source_schema = excluded.source_schema,
      generated_at = excluded.generated_at,
      account_ref = excluded.account_ref,
      mailbox_status = excluded.mailbox_status,
      unread_count = excluded.unread_count,
      pending_draft_count = excluded.pending_draft_count,
      pending_send_count = excluded.pending_send_count,
      latest_message_at = excluded.latest_message_at,
      ticket_count = excluded.ticket_count,
      sync_state = excluded.sync_state,
      mailbox_read_authority = excluded.mailbox_read_authority,
      mailbox_write_authority = excluded.mailbox_write_authority,
      mailbox_send_admission = excluded.mailbox_send_admission,
      mailbox_mutation_admission = excluded.mailbox_mutation_admission,
      shadow_read_posture = excluded.shadow_read_posture,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.read_id,
    record.site_id,
    record.source_locus,
    record.target_locus,
    record.source_schema,
    record.generated_at,
    record.account_ref,
    record.mailbox_status,
    record.unread_count,
    record.pending_draft_count,
    record.pending_send_count,
    record.latest_message_at,
    record.ticket_count,
    record.sync_state,
    record.mailbox_read_authority,
    record.mailbox_write_authority,
    record.mailbox_send_admission,
    record.mailbox_mutation_admission,
    record.shadow_read_posture,
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_MAILBOX_STATUS_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    mailbox_status_authority: record.mailbox_read_authority,
    mailbox_write_authority: record.mailbox_write_authority,
    mailbox_send_admission: record.mailbox_send_admission,
    mailbox_mutation_admission: record.mailbox_mutation_admission,
    read,
    record,
  };
}

async function ensureCloudflareMailboxStatusShadowReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_status_shadow_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      account_ref TEXT NOT NULL,
      mailbox_status TEXT NOT NULL,
      unread_count INTEGER NOT NULL,
      pending_draft_count INTEGER NOT NULL,
      pending_send_count INTEGER NOT NULL,
      latest_message_at TEXT,
      ticket_count INTEGER NOT NULL,
      sync_state TEXT NOT NULL,
      mailbox_read_authority TEXT NOT NULL,
      mailbox_write_authority TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      shadow_read_posture TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_status_shadow_reads_site_recorded
    ON cloudflare_mailbox_status_shadow_reads(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxStatusShadowReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxStatusShadowReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_status_shadow_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    read_id: row.read_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_MAILBOX_STATUS_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    source_schema: row.source_schema,
    generated_at: row.generated_at,
    account_ref: row.account_ref,
    mailbox_status: row.mailbox_status,
    unread_count: Number(row.unread_count),
    pending_draft_count: Number(row.pending_draft_count),
    pending_send_count: Number(row.pending_send_count),
    latest_message_at: row.latest_message_at,
    ticket_count: Number(row.ticket_count),
    sync_state: row.sync_state,
    mailbox_read_authority: row.mailbox_read_authority,
    mailbox_write_authority: row.mailbox_write_authority,
    mailbox_send_admission: row.mailbox_send_admission,
    mailbox_mutation_admission: row.mailbox_mutation_admission,
    shadow_read_posture: row.shadow_read_posture,
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function readCloudflareMailboxStatusSource(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const accountRef = String(params.account_ref ?? params.mailbox_id ?? env.GRAPH_MAILBOX_ID ?? env.MAILBOX_ID ?? '').trim();
  if (!accountRef) return { ok: false, code: 'mailbox_account_ref_missing' };
  const tokenResult = await resolveCloudflareGraphAccessToken(env);
  if (!tokenResult.ok) return tokenResult;
  const generatedAt = new Date().toISOString();
  const baseUrl = String(env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${tokenResult.access_token}`, 'Content-Type': 'application/json' };
  const inbox = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(accountRef)}/mailFolders/inbox?$select=unreadItemCount,totalItemCount`, { headers });
  if (!inbox.ok) return { ok: false, code: 'graph_inbox_status_read_failed', graph_status: inbox.status, graph_error: inbox.error };
  const drafts = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(accountRef)}/mailFolders/drafts?$select=totalItemCount`, { headers });
  if (!drafts.ok) return { ok: false, code: 'graph_draft_status_read_failed', graph_status: drafts.status, graph_error: drafts.error };
  const latest = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(accountRef)}/mailFolders/inbox/messages?$top=1&$orderby=receivedDateTime%20desc&$select=receivedDateTime`, { headers });
  if (!latest.ok) return { ok: false, code: 'graph_latest_message_read_failed', graph_status: latest.status, graph_error: latest.error };

  const unreadCount = clampInteger(inbox.body?.unreadItemCount, 0, 1000000, 0);
  const pendingDraftCount = clampInteger(drafts.body?.totalItemCount, 0, 1000000, 0);
  const latestMessage = Array.isArray(latest.body?.value) ? latest.body.value[0] : null;
  const latestMessageAt = latestMessage?.receivedDateTime == null ? null : String(latestMessage.receivedDateTime);
  const sourceResponse = {
    inbox: { unreadItemCount: unreadCount, totalItemCount: clampInteger(inbox.body?.totalItemCount, 0, 1000000, 0) },
    drafts: { totalItemCount: pendingDraftCount },
    latest_message_at: latestMessageAt,
  };
  const record = {
    read_id: params.read_id ?? mailboxStatusSourceReadId(siteId, accountRef, generatedAt),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_STATUS_SOURCE_READ_SCHEMA,
    source_locus: 'cloudflare_carrier_site',
    source_adapter: 'microsoft_graph_mailbox_status',
    generated_at: generatedAt,
    account_ref: accountRef,
    mailbox_status: unreadCount > 0 || pendingDraftCount > 0 ? 'attention_required' : 'ok',
    unread_count: unreadCount,
    pending_draft_count: pendingDraftCount,
    pending_send_count: 0,
    latest_message_at: latestMessageAt,
    mailbox_read_authority: CLOUDFLARE_MAILBOX_STATUS_SOURCE_AUTHORITY,
    mailbox_send_admission: 'not_admitted',
    mailbox_mutation_admission: 'not_admitted',
    source_response: sourceResponse,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: generatedAt,
  };
  await ensureCloudflareMailboxStatusSourceReadSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_status_source_reads (
      read_id,
      site_id,
      source_locus,
      source_adapter,
      generated_at,
      account_ref,
      mailbox_status,
      unread_count,
      pending_draft_count,
      pending_send_count,
      latest_message_at,
      mailbox_read_authority,
      mailbox_send_admission,
      mailbox_mutation_admission,
      source_response_json,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(read_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      source_adapter = excluded.source_adapter,
      generated_at = excluded.generated_at,
      account_ref = excluded.account_ref,
      mailbox_status = excluded.mailbox_status,
      unread_count = excluded.unread_count,
      pending_draft_count = excluded.pending_draft_count,
      pending_send_count = excluded.pending_send_count,
      latest_message_at = excluded.latest_message_at,
      mailbox_read_authority = excluded.mailbox_read_authority,
      mailbox_send_admission = excluded.mailbox_send_admission,
      mailbox_mutation_admission = excluded.mailbox_mutation_admission,
      source_response_json = excluded.source_response_json,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.read_id,
    record.site_id,
    record.source_locus,
    record.source_adapter,
    record.generated_at,
    record.account_ref,
    record.mailbox_status,
    record.unread_count,
    record.pending_draft_count,
    record.pending_send_count,
    record.latest_message_at,
    record.mailbox_read_authority,
    record.mailbox_send_admission,
    record.mailbox_mutation_admission,
    JSON.stringify(record.source_response),
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_MAILBOX_STATUS_SOURCE_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    mailbox_status_authority: record.mailbox_read_authority,
    mailbox_send_admission: record.mailbox_send_admission,
    mailbox_mutation_admission: record.mailbox_mutation_admission,
    read: record,
  };
}

async function ensureCloudflareMailboxStatusSourceReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_status_source_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      source_adapter TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      account_ref TEXT NOT NULL,
      mailbox_status TEXT NOT NULL,
      unread_count INTEGER NOT NULL,
      pending_draft_count INTEGER NOT NULL,
      pending_send_count INTEGER NOT NULL,
      latest_message_at TEXT,
      mailbox_read_authority TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      source_response_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_status_source_reads_site_recorded
    ON cloudflare_mailbox_status_source_reads(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxStatusSourceReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxStatusSourceReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_status_source_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    read_id: row.read_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_MAILBOX_STATUS_SOURCE_READ_SCHEMA,
    source_locus: row.source_locus,
    source_adapter: row.source_adapter,
    generated_at: row.generated_at,
    account_ref: row.account_ref,
    mailbox_status: row.mailbox_status,
    unread_count: Number(row.unread_count),
    pending_draft_count: Number(row.pending_draft_count),
    pending_send_count: Number(row.pending_send_count),
    latest_message_at: row.latest_message_at,
    mailbox_read_authority: row.mailbox_read_authority,
    mailbox_send_admission: row.mailbox_send_admission,
    mailbox_mutation_admission: row.mailbox_mutation_admission,
    source_response: parseJsonObject(row.source_response_json),
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createMailboxDraftReplyProposal(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.proposal ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.mailbox_draft_reply_proposal.v1') {
    return { ok: false, code: 'mailbox_draft_reply_proposal_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const proposalAuthority = String(source.proposal_authority ?? source.authority_locus ?? params.proposal_authority ?? params.authority_locus ?? CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_AUTHORITY);
  const outlookDraftCreateAdmission = String(source.mailbox_outlook_draft_create_admission ?? params.mailbox_outlook_draft_create_admission ?? '');
  const sendAdmission = String(source.mailbox_send_admission ?? params.mailbox_send_admission ?? '');
  const mutationAdmission = String(source.mailbox_mutation_admission ?? params.mailbox_mutation_admission ?? '');
  if (proposalAuthority !== CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_AUTHORITY) return { ok: false, code: 'mailbox_draft_reply_proposal_authority_invalid', proposal_authority: proposalAuthority };
  if (outlookDraftCreateAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_draft_reply_proposal_draft_create_admission_invalid', mailbox_outlook_draft_create_admission: outlookDraftCreateAdmission };
  if (sendAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_draft_reply_proposal_send_admission_invalid', mailbox_send_admission: sendAdmission };
  if (mutationAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_draft_reply_proposal_mutation_admission_invalid', mailbox_mutation_admission: mutationAdmission };
  const accountRef = String(source.account_ref ?? params.account_ref ?? '');
  const sourceMessageRef = String(source.source_message_ref ?? source.message_id ?? params.source_message_ref ?? params.message_id ?? '');
  if (!accountRef) return { ok: false, code: 'mailbox_draft_reply_proposal_requires_account_ref' };
  if (!sourceMessageRef) return { ok: false, code: 'mailbox_draft_reply_proposal_requires_source_message_ref' };
  const recipients = Array.isArray(source.recipients ?? params.recipients) ? (source.recipients ?? params.recipients) : [];
  const recipientCount = clampInteger(source.recipient_count ?? params.recipient_count ?? recipients.length, 0, 100, recipients.length);
  const bodySha256 = String(source.body_sha256 ?? params.body_sha256 ?? '').toLowerCase();
  if (bodySha256 && !/^[a-f0-9]{64}$/.test(bodySha256)) return { ok: false, code: 'mailbox_draft_reply_proposal_body_sha256_invalid' };
  return {
    ok: true,
    proposal: {
      schema: 'narada.sonar.cloudflare_mailbox_draft_reply_proposal_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      account_ref: accountRef,
      source_message_ref: sourceMessageRef,
      proposal_ref: String(source.proposal_ref ?? params.proposal_ref ?? 'mailbox-draft-reply-proposal'),
      subject: String(source.subject ?? params.subject ?? '').slice(0, 500),
      recipient_count: recipientCount,
      body_preview: String(source.body_preview ?? params.body_preview ?? '').slice(0, 1000),
      body_sha256: bodySha256 || null,
      rationale: String(source.rationale ?? params.rationale ?? '').slice(0, 1000),
      proposal_authority: proposalAuthority,
      mailbox_outlook_draft_create_admission: outlookDraftCreateAdmission,
      mailbox_send_admission: sendAdmission,
      mailbox_mutation_admission: mutationAdmission,
      windows_draft_executor_fallback: String(source.windows_draft_executor_fallback ?? params.windows_draft_executor_fallback ?? 'available'),
      proposal_posture: String(source.proposal_posture ?? params.proposal_posture ?? 'proposal_only_no_outlook_draft_create'),
    },
  };
}

function mailboxDraftReplyProposalId(siteId, proposal) {
  return `mailbox_draft_reply_proposal_${safeIdToken(siteId)}_${safeIdToken(proposal.generated_at)}_${safeIdToken(proposal.proposal_ref)}`;
}

async function recordCloudflareMailboxDraftReplyProposal(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createMailboxDraftReplyProposal(siteId, params);
  if (!payload.ok) return payload;
  const proposal = payload.proposal;
  const record = {
    proposal_id: params.proposal_id ?? mailboxDraftReplyProposalId(siteId, proposal),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_SCHEMA,
    source_schema: proposal.source_schema,
    generated_at: proposal.generated_at,
    operation_id: proposal.operation_id,
    account_ref: proposal.account_ref,
    source_message_ref: proposal.source_message_ref,
    proposal_ref: proposal.proposal_ref,
    subject: proposal.subject,
    recipient_count: proposal.recipient_count,
    body_preview: proposal.body_preview,
    body_sha256: proposal.body_sha256,
    rationale: proposal.rationale,
    proposal_authority: proposal.proposal_authority,
    mailbox_outlook_draft_create_admission: proposal.mailbox_outlook_draft_create_admission,
    mailbox_send_admission: proposal.mailbox_send_admission,
    mailbox_mutation_admission: proposal.mailbox_mutation_admission,
    windows_draft_executor_fallback: proposal.windows_draft_executor_fallback,
    proposal_posture: proposal.proposal_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareMailboxDraftReplyProposalSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_draft_reply_proposals (
      proposal_id,
      site_id,
      source_schema,
      generated_at,
      operation_id,
      account_ref,
      source_message_ref,
      proposal_ref,
      subject,
      recipient_count,
      body_preview,
      body_sha256,
      rationale,
      proposal_authority,
      mailbox_outlook_draft_create_admission,
      mailbox_send_admission,
      mailbox_mutation_admission,
      windows_draft_executor_fallback,
      proposal_posture,
      proposal_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(proposal_id) DO UPDATE SET
      source_schema = excluded.source_schema,
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      account_ref = excluded.account_ref,
      source_message_ref = excluded.source_message_ref,
      proposal_ref = excluded.proposal_ref,
      subject = excluded.subject,
      recipient_count = excluded.recipient_count,
      body_preview = excluded.body_preview,
      body_sha256 = excluded.body_sha256,
      rationale = excluded.rationale,
      proposal_authority = excluded.proposal_authority,
      mailbox_outlook_draft_create_admission = excluded.mailbox_outlook_draft_create_admission,
      mailbox_send_admission = excluded.mailbox_send_admission,
      mailbox_mutation_admission = excluded.mailbox_mutation_admission,
      windows_draft_executor_fallback = excluded.windows_draft_executor_fallback,
      proposal_posture = excluded.proposal_posture,
      proposal_json = excluded.proposal_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.proposal_id,
    record.site_id,
    record.source_schema,
    record.generated_at,
    record.operation_id,
    record.account_ref,
    record.source_message_ref,
    record.proposal_ref,
    record.subject,
    record.recipient_count,
    record.body_preview,
    record.body_sha256,
    record.rationale,
    record.proposal_authority,
    record.mailbox_outlook_draft_create_admission,
    record.mailbox_send_admission,
    record.mailbox_mutation_admission,
    record.windows_draft_executor_fallback,
    record.proposal_posture,
    JSON.stringify({ ...record, proposal }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    proposal_authority: record.proposal_authority,
    mailbox_outlook_draft_create_admission: record.mailbox_outlook_draft_create_admission,
    mailbox_send_admission: record.mailbox_send_admission,
    mailbox_mutation_admission: record.mailbox_mutation_admission,
    proposal,
    record,
  };
}

async function ensureCloudflareMailboxDraftReplyProposalSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_draft_reply_proposals (
      proposal_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      account_ref TEXT NOT NULL,
      source_message_ref TEXT NOT NULL,
      proposal_ref TEXT NOT NULL,
      subject TEXT NOT NULL,
      recipient_count INTEGER NOT NULL,
      body_preview TEXT NOT NULL,
      body_sha256 TEXT,
      rationale TEXT NOT NULL,
      proposal_authority TEXT NOT NULL,
      mailbox_outlook_draft_create_admission TEXT NOT NULL,
      mailbox_send_admission TEXT NOT NULL,
      mailbox_mutation_admission TEXT NOT NULL,
      windows_draft_executor_fallback TEXT NOT NULL,
      proposal_posture TEXT NOT NULL,
      proposal_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_draft_reply_proposals_site_recorded
    ON cloudflare_mailbox_draft_reply_proposals(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxDraftReplyProposals(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxDraftReplyProposalSchema(db);
  const boundedLimit = clampInteger(limit, 0, 5000, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_draft_reply_proposals
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    proposal_id: row.proposal_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_MAILBOX_DRAFT_REPLY_PROPOSAL_SCHEMA,
    source_schema: row.source_schema,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    account_ref: row.account_ref,
    source_message_ref: row.source_message_ref,
    proposal_ref: row.proposal_ref,
    subject: row.subject,
    recipient_count: Number(row.recipient_count),
    body_preview: row.body_preview,
    body_sha256: row.body_sha256,
    rationale: row.rationale,
    proposal_authority: row.proposal_authority,
    mailbox_outlook_draft_create_admission: row.mailbox_outlook_draft_create_admission,
    mailbox_send_admission: row.mailbox_send_admission,
    mailbox_mutation_admission: row.mailbox_mutation_admission,
    windows_draft_executor_fallback: row.windows_draft_executor_fallback,
    proposal_posture: row.proposal_posture,
    proposal: parseJsonObject(row.proposal_json).proposal ?? {},
    record: parseJsonObject(row.proposal_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createMailboxOutlookDraftCreateRequest(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.draft ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.mailbox_outlook_draft_create_request.v1') {
    return { ok: false, code: 'mailbox_outlook_draft_create_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const draftCreateAdmission = String(source.mailbox_outlook_draft_create_admission ?? params.mailbox_outlook_draft_create_admission ?? '');
  const sendAdmission = String(source.mailbox_send_admission ?? params.mailbox_send_admission ?? '');
  const mutationAdmission = String(source.mailbox_mutation_admission ?? params.mailbox_mutation_admission ?? '');
  if (draftCreateAdmission !== 'admitted') return { ok: false, code: 'mailbox_outlook_draft_create_admission_invalid', mailbox_outlook_draft_create_admission: draftCreateAdmission };
  if (sendAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_outlook_draft_create_send_admission_invalid', mailbox_send_admission: sendAdmission };
  if (mutationAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_outlook_draft_create_mutation_admission_invalid', mailbox_mutation_admission: mutationAdmission };
  const accountRef = String(source.account_ref ?? params.account_ref ?? '');
  const subject = String(source.subject ?? params.subject ?? '').slice(0, 500);
  const bodyText = String(source.body_text ?? params.body_text ?? source.body_preview ?? params.body_preview ?? '').slice(0, 10000);
  const recipients = Array.isArray(source.to_recipients ?? params.to_recipients) ? (source.to_recipients ?? params.to_recipients) : [];
  const toRecipients = recipients.map((recipient) => String(recipient ?? '').trim()).filter(Boolean).slice(0, 25);
  if (!accountRef) return { ok: false, code: 'mailbox_outlook_draft_create_requires_account_ref' };
  if (!subject) return { ok: false, code: 'mailbox_outlook_draft_create_requires_subject' };
  if (!bodyText) return { ok: false, code: 'mailbox_outlook_draft_create_requires_body_text' };
  if (toRecipients.length === 0) return { ok: false, code: 'mailbox_outlook_draft_create_requires_recipients' };
  const bodySha256 = String(source.body_sha256 ?? params.body_sha256 ?? '').toLowerCase();
  if (bodySha256 && !/^[a-f0-9]{64}$/.test(bodySha256)) return { ok: false, code: 'mailbox_outlook_draft_create_body_sha256_invalid' };
  return {
    ok: true,
    draft: {
      schema: 'narada.sonar.cloudflare_mailbox_outlook_draft_create_request_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      account_ref: accountRef,
      source_message_ref: source.source_message_ref == null && params.source_message_ref == null ? null : String(source.source_message_ref ?? params.source_message_ref),
      proposal_id: source.proposal_id == null && params.proposal_id == null ? null : String(source.proposal_id ?? params.proposal_id),
      proposal_ref: source.proposal_ref == null && params.proposal_ref == null ? null : String(source.proposal_ref ?? params.proposal_ref),
      subject,
      to_recipients: toRecipients,
      recipient_count: toRecipients.length,
      body_preview: bodyText.slice(0, 1000),
      body_text: bodyText,
      body_sha256: bodySha256 || null,
      draft_create_authority: CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_AUTHORITY,
      mailbox_outlook_draft_create_admission: draftCreateAdmission,
      mailbox_send_admission: sendAdmission,
      mailbox_mutation_admission: mutationAdmission,
      draft_create_posture: String(source.draft_create_posture ?? params.draft_create_posture ?? 'cloudflare_created_outlook_draft_send_not_admitted'),
    },
  };
}

function mailboxOutlookDraftCreateId(siteId, draft) {
  return `mailbox_outlook_draft_create_${safeIdToken(siteId)}_${safeIdToken(draft.generated_at)}_${safeIdToken(draft.proposal_id ?? draft.proposal_ref ?? draft.subject)}`;
}

async function createCloudflareMailboxOutlookDraft(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createMailboxOutlookDraftCreateRequest(siteId, params);
  if (!payload.ok) return payload;
  const draft = payload.draft;
  const tokenResult = await resolveCloudflareGraphAccessToken(env);
  if (!tokenResult.ok) return tokenResult;
  const baseUrl = String(env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
  const graphPayload = {
    subject: draft.subject,
    body: { contentType: 'Text', content: draft.body_text },
    toRecipients: draft.to_recipients.map((address) => ({ emailAddress: { address } })),
  };
  const graphResult = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(draft.account_ref)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenResult.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(graphPayload),
  });
  if (!graphResult.ok) return { ok: false, code: 'graph_outlook_draft_create_failed', graph_status: graphResult.status, graph_error: graphResult.error };
  const graphBody = graphResult.body ?? {};
  const record = {
    draft_create_id: params.draft_create_id ?? mailboxOutlookDraftCreateId(siteId, draft),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_SCHEMA,
    source_schema: draft.source_schema,
    generated_at: draft.generated_at,
    operation_id: draft.operation_id,
    account_ref: draft.account_ref,
    source_message_ref: draft.source_message_ref,
    proposal_id: draft.proposal_id,
    proposal_ref: draft.proposal_ref,
    subject: draft.subject,
    recipient_count: draft.recipient_count,
    body_preview: draft.body_preview,
    body_sha256: draft.body_sha256,
    outlook_draft_id: String(graphBody.id ?? ''),
    outlook_change_key: graphBody.changeKey == null ? null : String(graphBody.changeKey),
    draft_create_authority: draft.draft_create_authority,
    mailbox_outlook_draft_create_admission: draft.mailbox_outlook_draft_create_admission,
    mailbox_send_admission: draft.mailbox_send_admission,
    mailbox_mutation_admission: draft.mailbox_mutation_admission,
    draft_create_posture: draft.draft_create_posture,
    graph_response: { id: graphBody.id ?? null, changeKey: graphBody.changeKey ?? null, webLink: graphBody.webLink ?? null },
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  if (!record.outlook_draft_id) return { ok: false, code: 'graph_outlook_draft_create_missing_draft_id', graph_response: record.graph_response };
  await ensureCloudflareMailboxOutlookDraftCreateSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_outlook_draft_creates (
      draft_create_id, site_id, source_schema, generated_at, operation_id, account_ref, source_message_ref, proposal_id, proposal_ref, subject, recipient_count, body_preview, body_sha256, outlook_draft_id, outlook_change_key, draft_create_authority, mailbox_outlook_draft_create_admission, mailbox_send_admission, mailbox_mutation_admission, draft_create_posture, graph_response_json, record_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(draft_create_id) DO UPDATE SET
      source_schema = excluded.source_schema, generated_at = excluded.generated_at, operation_id = excluded.operation_id, account_ref = excluded.account_ref, source_message_ref = excluded.source_message_ref, proposal_id = excluded.proposal_id, proposal_ref = excluded.proposal_ref, subject = excluded.subject, recipient_count = excluded.recipient_count, body_preview = excluded.body_preview, body_sha256 = excluded.body_sha256, outlook_draft_id = excluded.outlook_draft_id, outlook_change_key = excluded.outlook_change_key, draft_create_authority = excluded.draft_create_authority, mailbox_outlook_draft_create_admission = excluded.mailbox_outlook_draft_create_admission, mailbox_send_admission = excluded.mailbox_send_admission, mailbox_mutation_admission = excluded.mailbox_mutation_admission, draft_create_posture = excluded.draft_create_posture, graph_response_json = excluded.graph_response_json, record_json = excluded.record_json, recorded_by_principal_id = excluded.recorded_by_principal_id, recorded_at = excluded.recorded_at
  `).bind(record.draft_create_id, record.site_id, record.source_schema, record.generated_at, record.operation_id, record.account_ref, record.source_message_ref, record.proposal_id, record.proposal_ref, record.subject, record.recipient_count, record.body_preview, record.body_sha256, record.outlook_draft_id, record.outlook_change_key, record.draft_create_authority, record.mailbox_outlook_draft_create_admission, record.mailbox_send_admission, record.mailbox_mutation_admission, record.draft_create_posture, JSON.stringify(record.graph_response), JSON.stringify({ ...record, draft }), record.recorded_by_principal_id, record.recorded_at).run();
  return { ok: true, schema: CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_SCHEMA, status: 'created', site_id: siteId, mailbox_outlook_draft_create_authority: record.draft_create_authority, mailbox_outlook_draft_create_admission: record.mailbox_outlook_draft_create_admission, mailbox_send_admission: record.mailbox_send_admission, mailbox_mutation_admission: record.mailbox_mutation_admission, draft, record };
}

async function ensureCloudflareMailboxOutlookDraftCreateSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_outlook_draft_creates (
      draft_create_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, account_ref TEXT NOT NULL, source_message_ref TEXT, proposal_id TEXT, proposal_ref TEXT, subject TEXT NOT NULL, recipient_count INTEGER NOT NULL, body_preview TEXT NOT NULL, body_sha256 TEXT, outlook_draft_id TEXT NOT NULL, outlook_change_key TEXT, draft_create_authority TEXT NOT NULL, mailbox_outlook_draft_create_admission TEXT NOT NULL, mailbox_send_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, draft_create_posture TEXT NOT NULL, graph_response_json TEXT NOT NULL, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_outlook_draft_creates_site_recorded
    ON cloudflare_mailbox_outlook_draft_creates(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxOutlookDraftCreates(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxOutlookDraftCreateSchema(db);
  const boundedLimit = clampInteger(limit, 0, 5000, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_outlook_draft_creates WHERE site_id = ? ORDER BY recorded_at DESC, generated_at DESC LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    draft_create_id: row.draft_create_id, site_id: row.site_id, schema: CLOUDFLARE_MAILBOX_OUTLOOK_DRAFT_CREATE_SCHEMA, source_schema: row.source_schema, generated_at: row.generated_at, operation_id: row.operation_id, account_ref: row.account_ref, source_message_ref: row.source_message_ref, proposal_id: row.proposal_id, proposal_ref: row.proposal_ref, subject: row.subject, recipient_count: Number(row.recipient_count), body_preview: row.body_preview, body_sha256: row.body_sha256, outlook_draft_id: row.outlook_draft_id, outlook_change_key: row.outlook_change_key, draft_create_authority: row.draft_create_authority, mailbox_outlook_draft_create_admission: row.mailbox_outlook_draft_create_admission, mailbox_send_admission: row.mailbox_send_admission, mailbox_mutation_admission: row.mailbox_mutation_admission, draft_create_posture: row.draft_create_posture, graph_response: parseJsonObject(row.graph_response_json), record: parseJsonObject(row.record_json), recorded_by_principal_id: row.recorded_by_principal_id, recorded_at: row.recorded_at,
  }));
}

function createMailboxSendRequest(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.send_request ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.mailbox_send_request.v1') {
    return { ok: false, code: 'mailbox_send_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const sendAdmission = String(source.mailbox_send_admission ?? params.mailbox_send_admission ?? '');
  const mutationAdmission = String(source.mailbox_mutation_admission ?? params.mailbox_mutation_admission ?? '');
  if (sendAdmission !== 'admitted') return { ok: false, code: 'mailbox_send_admission_invalid', mailbox_send_admission: sendAdmission };
  if (mutationAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_send_mutation_admission_invalid', mailbox_mutation_admission: mutationAdmission };
  const accountRef = String(source.account_ref ?? params.account_ref ?? '');
  const outlookDraftId = String(source.outlook_draft_id ?? params.outlook_draft_id ?? '').trim();
  if (!accountRef) return { ok: false, code: 'mailbox_send_requires_account_ref' };
  if (!outlookDraftId) return { ok: false, code: 'mailbox_send_requires_outlook_draft_id' };
  return {
    ok: true,
    send_request: {
      schema: 'narada.sonar.cloudflare_mailbox_send_request_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      account_ref: accountRef,
      outlook_draft_id: outlookDraftId,
      draft_create_id: source.draft_create_id == null && params.draft_create_id == null ? null : String(source.draft_create_id ?? params.draft_create_id),
      proposal_id: source.proposal_id == null && params.proposal_id == null ? null : String(source.proposal_id ?? params.proposal_id),
      source_message_ref: source.source_message_ref == null && params.source_message_ref == null ? null : String(source.source_message_ref ?? params.source_message_ref),
      send_authority: CLOUDFLARE_MAILBOX_SEND_AUTHORITY,
      mailbox_send_admission: sendAdmission,
      mailbox_mutation_admission: mutationAdmission,
      delivery_confirmation_admission: 'not_admitted',
      send_posture: String(source.send_posture ?? params.send_posture ?? 'cloudflare_graph_send_accepted_delivery_not_confirmed'),
      cutover_point_ref: String(source.cutover_point_ref ?? params.cutover_point_ref ?? ''),
      governed_write_contract_ref: String(source.governed_write_contract_ref ?? params.governed_write_contract_ref ?? ''),
      confirmation_evidence_ref: String(source.confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? ''),
    },
  };
}

function mailboxSendAcceptedId(siteId, sendRequest) {
  return `mailbox_send_accepted_${safeIdToken(siteId)}_${safeIdToken(sendRequest.generated_at)}_${safeIdToken(sendRequest.outlook_draft_id)}`;
}

async function sendCloudflareMailboxOutlookDraft(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createMailboxSendRequest(siteId, params);
  if (!payload.ok) return payload;
  const sendRequest = payload.send_request;
  for (const [field, code] of [
    ['cutover_point_ref', 'mailbox_send_requires_cutover_point_ref'],
    ['governed_write_contract_ref', 'mailbox_send_requires_governed_write_contract_ref'],
    ['confirmation_evidence_ref', 'mailbox_send_requires_confirmation_evidence_ref'],
  ]) {
    if (!sendRequest[field]) return { ok: false, code, schema: CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA };
  }
  const tokenResult = await resolveCloudflareGraphAccessToken(env);
  if (!tokenResult.ok) return tokenResult;
  const baseUrl = String(env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
  const graphResult = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(sendRequest.account_ref)}/messages/${encodeURIComponent(sendRequest.outlook_draft_id)}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenResult.access_token}`, 'Content-Type': 'application/json' },
  });
  if (!graphResult.ok) return { ok: false, code: 'graph_outlook_draft_send_failed', graph_status: graphResult.status, graph_error: graphResult.error };
  const now = new Date().toISOString();
  const record = {
    send_accepted_id: params.send_accepted_id ?? mailboxSendAcceptedId(siteId, sendRequest),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA,
    source_schema: sendRequest.source_schema,
    generated_at: sendRequest.generated_at,
    operation_id: sendRequest.operation_id,
    account_ref: sendRequest.account_ref,
    outlook_draft_id: sendRequest.outlook_draft_id,
    draft_create_id: sendRequest.draft_create_id,
    proposal_id: sendRequest.proposal_id,
    source_message_ref: sendRequest.source_message_ref,
    send_authority: sendRequest.send_authority,
    mailbox_send_admission: sendRequest.mailbox_send_admission,
    mailbox_mutation_admission: sendRequest.mailbox_mutation_admission,
    delivery_confirmation_admission: sendRequest.delivery_confirmation_admission,
    send_posture: sendRequest.send_posture,
    graph_status: graphResult.status,
    graph_response: graphResult.body ?? {},
    cutover_point_ref: sendRequest.cutover_point_ref,
    governed_write_contract_ref: sendRequest.governed_write_contract_ref,
    confirmation_evidence_ref: sendRequest.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareMailboxSendAcceptedSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_send_accepted_records (
      send_accepted_id, site_id, source_schema, generated_at, operation_id, account_ref, outlook_draft_id, draft_create_id, proposal_id, source_message_ref, send_authority, mailbox_send_admission, mailbox_mutation_admission, delivery_confirmation_admission, send_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(send_accepted_id) DO UPDATE SET
      source_schema = excluded.source_schema, generated_at = excluded.generated_at, operation_id = excluded.operation_id, account_ref = excluded.account_ref, outlook_draft_id = excluded.outlook_draft_id, draft_create_id = excluded.draft_create_id, proposal_id = excluded.proposal_id, source_message_ref = excluded.source_message_ref, send_authority = excluded.send_authority, mailbox_send_admission = excluded.mailbox_send_admission, mailbox_mutation_admission = excluded.mailbox_mutation_admission, delivery_confirmation_admission = excluded.delivery_confirmation_admission, send_posture = excluded.send_posture, graph_status = excluded.graph_status, graph_response_json = excluded.graph_response_json, cutover_point_ref = excluded.cutover_point_ref, governed_write_contract_ref = excluded.governed_write_contract_ref, confirmation_evidence_ref = excluded.confirmation_evidence_ref, record_json = excluded.record_json, recorded_by_principal_id = excluded.recorded_by_principal_id, recorded_at = excluded.recorded_at
  `).bind(record.send_accepted_id, record.site_id, record.source_schema, record.generated_at, record.operation_id, record.account_ref, record.outlook_draft_id, record.draft_create_id, record.proposal_id, record.source_message_ref, record.send_authority, record.mailbox_send_admission, record.mailbox_mutation_admission, record.delivery_confirmation_admission, record.send_posture, record.graph_status, JSON.stringify(record.graph_response), record.cutover_point_ref, record.governed_write_contract_ref, record.confirmation_evidence_ref, JSON.stringify({ ...record, send_request: sendRequest }), record.recorded_by_principal_id, record.recorded_at).run();
  return { ok: true, schema: CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA, status: 'accepted', site_id: siteId, mailbox_send_authority: record.send_authority, mailbox_send_admission: record.mailbox_send_admission, mailbox_mutation_admission: record.mailbox_mutation_admission, delivery_confirmation_admission: record.delivery_confirmation_admission, send_request: sendRequest, record };
}

async function ensureCloudflareMailboxSendAcceptedSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_accepted_records (
      send_accepted_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, account_ref TEXT NOT NULL, outlook_draft_id TEXT NOT NULL, draft_create_id TEXT, proposal_id TEXT, source_message_ref TEXT, send_authority TEXT NOT NULL, mailbox_send_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, delivery_confirmation_admission TEXT NOT NULL, send_posture TEXT NOT NULL, graph_status INTEGER NOT NULL, graph_response_json TEXT NOT NULL, cutover_point_ref TEXT NOT NULL, governed_write_contract_ref TEXT NOT NULL, confirmation_evidence_ref TEXT NOT NULL, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_send_accepted_site_recorded
    ON cloudflare_mailbox_send_accepted_records(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxSendAcceptedRecords(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxSendAcceptedSchema(db);
  const boundedLimit = clampInteger(limit, 0, 5000, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_send_accepted_records WHERE site_id = ? ORDER BY recorded_at DESC, generated_at DESC LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    send_accepted_id: row.send_accepted_id, site_id: row.site_id, schema: CLOUDFLARE_MAILBOX_SEND_ACCEPTED_SCHEMA, source_schema: row.source_schema, generated_at: row.generated_at, operation_id: row.operation_id, account_ref: row.account_ref, outlook_draft_id: row.outlook_draft_id, draft_create_id: row.draft_create_id, proposal_id: row.proposal_id, source_message_ref: row.source_message_ref, send_authority: row.send_authority, mailbox_send_admission: row.mailbox_send_admission, mailbox_mutation_admission: row.mailbox_mutation_admission, delivery_confirmation_admission: row.delivery_confirmation_admission, send_posture: row.send_posture, graph_status: Number(row.graph_status), graph_response: parseJsonObject(row.graph_response_json), record: parseJsonObject(row.record_json), recorded_by_principal_id: row.recorded_by_principal_id, recorded_at: row.recorded_at,
  }));
}

function createMailboxSendConfirmationRequest(siteId, params = {}) {
  const sourceInput = params.source_payload ?? params.confirmation_payload ?? params;
  const source = sourceInput && typeof sourceInput === 'object' && !Array.isArray(sourceInput) ? sourceInput : {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.mailbox_send_confirmation_read_request.v1') {
    return { ok: false, code: 'mailbox_send_confirmation_source_schema_invalid', source_schema: sourceSchema || null, schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  }
  const sendAcceptedId = String(source.send_accepted_id ?? params.send_accepted_id ?? '');
  const deliveryConfirmationAdmission = String(source.delivery_confirmation_admission ?? params.delivery_confirmation_admission ?? '');
  const mailboxMutationAdmission = String(source.mailbox_mutation_admission ?? params.mailbox_mutation_admission ?? '');
  const sentMessageRef = String(source.sent_message_ref ?? params.sent_message_ref ?? '');
  if (!sendAcceptedId) return { ok: false, code: 'mailbox_send_confirmation_requires_send_accepted_id', schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  if (!sentMessageRef) return { ok: false, code: 'mailbox_send_confirmation_requires_sent_message_ref', schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  if (deliveryConfirmationAdmission !== 'admitted') return { ok: false, code: 'mailbox_send_confirmation_admission_invalid', delivery_confirmation_admission: deliveryConfirmationAdmission, schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  if (mailboxMutationAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_send_confirmation_mutation_admission_invalid', mailbox_mutation_admission: mailboxMutationAdmission, schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  return {
    ok: true,
    confirmation_request: {
      schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      site_id: siteId,
      send_accepted_id: sendAcceptedId,
      operation_id: String(source.operation_id ?? params.operation_id ?? ''),
      account_ref: String(source.account_ref ?? params.account_ref ?? ''),
      outlook_draft_id: String(source.outlook_draft_id ?? params.outlook_draft_id ?? ''),
      sent_message_ref: sentMessageRef,
      sent_subject: String(source.sent_subject ?? params.sent_subject ?? ''),
      delivery_confirmation_admission: deliveryConfirmationAdmission,
      mailbox_mutation_admission: mailboxMutationAdmission,
      confirmation_authority: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_AUTHORITY,
      confirmation_posture: 'graph_sent_message_observed_delivery_not_claimed',
      cutover_point_ref: String(source.cutover_point_ref ?? params.cutover_point_ref ?? ''),
      governed_write_contract_ref: String(source.governed_write_contract_ref ?? params.governed_write_contract_ref ?? ''),
      confirmation_evidence_ref: String(source.confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? ''),
    },
  };
}

function mailboxSendConfirmationId(siteId, confirmationRequest) {
  return `mailbox_send_confirmation_${safeIdToken(siteId)}_${safeIdToken(confirmationRequest.generated_at)}_${safeIdToken(confirmationRequest.send_accepted_id)}`;
}

async function readCloudflareMailboxSendConfirmation(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createMailboxSendConfirmationRequest(siteId, params);
  if (!payload.ok) return payload;
  const confirmationRequest = payload.confirmation_request;
  await ensureCloudflareMailboxSendAcceptedSchema(db);
  const sendAccepted = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_send_accepted_records WHERE site_id = ? AND send_accepted_id = ?
  `).bind(siteId, confirmationRequest.send_accepted_id).first();
  if (!sendAccepted) return { ok: false, code: 'mailbox_send_confirmation_requires_existing_send_accepted', schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA, send_accepted_id: confirmationRequest.send_accepted_id };
  const accountRef = confirmationRequest.account_ref || String(sendAccepted.account_ref ?? '');
  if (!accountRef) return { ok: false, code: 'mailbox_send_confirmation_requires_account_ref', schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA };
  const tokenResult = await resolveCloudflareGraphAccessToken(env);
  if (!tokenResult.ok) return tokenResult;
  const baseUrl = String(env.GRAPH_BASE_URL ?? 'https://graph.microsoft.com/v1.0').replace(/\/+$/, '');
let graphResult = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(accountRef)}/messages/${encodeURIComponent(confirmationRequest.sent_message_ref)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tokenResult.access_token}` },
  });
  if (!graphResult.ok && graphResult.status === 404 && confirmationRequest.sent_subject) {
    graphResult = await resolveCloudflareMailboxSentMessageBySubject(env, baseUrl, accountRef, confirmationRequest.sent_subject, tokenResult.access_token);
    if (graphResult.ok && graphResult.body?.id) confirmationRequest.sent_message_ref = String(graphResult.body.id);
  }
  if (!graphResult.ok) return { ok: false, code: 'graph_mailbox_send_confirmation_read_failed', graph_status: graphResult.status, graph_error: graphResult.error };
  const graphMessage = graphResult.body && typeof graphResult.body === 'object' && !Array.isArray(graphResult.body) ? graphResult.body : {};
  const now = new Date().toISOString();
  const record = {
    send_confirmation_id: params.send_confirmation_id ?? mailboxSendConfirmationId(siteId, confirmationRequest),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA,
    source_schema: confirmationRequest.schema,
    generated_at: confirmationRequest.generated_at,
    operation_id: confirmationRequest.operation_id || String(sendAccepted.operation_id ?? ''),
    send_accepted_id: confirmationRequest.send_accepted_id,
    account_ref: accountRef,
    outlook_draft_id: confirmationRequest.outlook_draft_id || String(sendAccepted.outlook_draft_id ?? ''),
    sent_message_ref: confirmationRequest.sent_message_ref,
    internet_message_id: String(graphMessage.internetMessageId ?? graphMessage.internet_message_id ?? ''),
    sent_at: String(graphMessage.sentDateTime ?? graphMessage.sent_at ?? ''),
    confirmation_authority: confirmationRequest.confirmation_authority,
    delivery_confirmation_admission: confirmationRequest.delivery_confirmation_admission,
    mailbox_mutation_admission: confirmationRequest.mailbox_mutation_admission,
    confirmation_posture: confirmationRequest.confirmation_posture,
    graph_status: graphResult.status,
    graph_response: graphMessage,
    cutover_point_ref: confirmationRequest.cutover_point_ref,
    governed_write_contract_ref: confirmationRequest.governed_write_contract_ref,
    confirmation_evidence_ref: confirmationRequest.confirmation_evidence_ref,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareMailboxSendConfirmationSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_send_confirmation_records (
      send_confirmation_id, site_id, source_schema, generated_at, operation_id, send_accepted_id, account_ref, outlook_draft_id, sent_message_ref, internet_message_id, sent_at, confirmation_authority, delivery_confirmation_admission, mailbox_mutation_admission, confirmation_posture, graph_status, graph_response_json, cutover_point_ref, governed_write_contract_ref, confirmation_evidence_ref, record_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(send_confirmation_id) DO UPDATE SET
      source_schema = excluded.source_schema, generated_at = excluded.generated_at, operation_id = excluded.operation_id, send_accepted_id = excluded.send_accepted_id, account_ref = excluded.account_ref, outlook_draft_id = excluded.outlook_draft_id, sent_message_ref = excluded.sent_message_ref, internet_message_id = excluded.internet_message_id, sent_at = excluded.sent_at, confirmation_authority = excluded.confirmation_authority, delivery_confirmation_admission = excluded.delivery_confirmation_admission, mailbox_mutation_admission = excluded.mailbox_mutation_admission, confirmation_posture = excluded.confirmation_posture, graph_status = excluded.graph_status, graph_response_json = excluded.graph_response_json, cutover_point_ref = excluded.cutover_point_ref, governed_write_contract_ref = excluded.governed_write_contract_ref, confirmation_evidence_ref = excluded.confirmation_evidence_ref, record_json = excluded.record_json, recorded_by_principal_id = excluded.recorded_by_principal_id, recorded_at = excluded.recorded_at
  `).bind(record.send_confirmation_id, record.site_id, record.source_schema, record.generated_at, record.operation_id, record.send_accepted_id, record.account_ref, record.outlook_draft_id, record.sent_message_ref, record.internet_message_id, record.sent_at, record.confirmation_authority, record.delivery_confirmation_admission, record.mailbox_mutation_admission, record.confirmation_posture, record.graph_status, JSON.stringify(record.graph_response), record.cutover_point_ref, record.governed_write_contract_ref, record.confirmation_evidence_ref, JSON.stringify({ ...record, confirmation_request: confirmationRequest }), record.recorded_by_principal_id, record.recorded_at).run();
  return { ok: true, schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA, status: 'confirmed_by_reconciliation_read', site_id: siteId, mailbox_send_confirmation_authority: record.confirmation_authority, delivery_confirmation_admission: record.delivery_confirmation_admission, mailbox_mutation_admission: record.mailbox_mutation_admission, confirmation_request: confirmationRequest, record };
}

async function resolveCloudflareMailboxSentMessageBySubject(env, baseUrl, accountRef, subject, accessToken) {
  const query = new URLSearchParams({
    '$top': '25',
    '$orderby': 'sentDateTime desc',
  });
  const result = await fetchCloudflareGraphJson(env, `${baseUrl}/users/${encodeURIComponent(accountRef)}/mailFolders/SentItems/messages?${query.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!result.ok) return result;
  const messages = Array.isArray(result.body?.value) ? result.body.value : [];
  const message = messages.find((entry) => String(entry?.subject ?? '') === String(subject));
  if (!message) return { ok: false, status: result.status, error: { code: 'sent_subject_not_found', subject } };
  return { ok: true, status: result.status, body: message };
}

function escapeODataString(value) {
  return String(value ?? '').replace(/'/g, "''");
}
async function ensureCloudflareMailboxSendConfirmationSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_confirmation_records (
      send_confirmation_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, send_accepted_id TEXT NOT NULL, account_ref TEXT NOT NULL, outlook_draft_id TEXT, sent_message_ref TEXT NOT NULL, internet_message_id TEXT, sent_at TEXT, confirmation_authority TEXT NOT NULL, delivery_confirmation_admission TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, confirmation_posture TEXT NOT NULL, graph_status INTEGER NOT NULL, graph_response_json TEXT NOT NULL, cutover_point_ref TEXT, governed_write_contract_ref TEXT, confirmation_evidence_ref TEXT, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_send_confirmation_site_recorded
    ON cloudflare_mailbox_send_confirmation_records(site_id, recorded_at)
  `).run();
}

async function listCloudflareMailboxSendConfirmations(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxSendConfirmationSchema(db);
  const boundedLimit = clampInteger(limit, 0, 5000, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_send_confirmation_records WHERE site_id = ? ORDER BY recorded_at DESC, generated_at DESC LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    send_confirmation_id: row.send_confirmation_id, site_id: row.site_id, schema: CLOUDFLARE_MAILBOX_SEND_CONFIRMATION_SCHEMA, source_schema: row.source_schema, generated_at: row.generated_at, operation_id: row.operation_id, send_accepted_id: row.send_accepted_id, account_ref: row.account_ref, outlook_draft_id: row.outlook_draft_id, sent_message_ref: row.sent_message_ref, internet_message_id: row.internet_message_id, sent_at: row.sent_at, confirmation_authority: row.confirmation_authority, delivery_confirmation_admission: row.delivery_confirmation_admission, mailbox_mutation_admission: row.mailbox_mutation_admission, confirmation_posture: row.confirmation_posture, graph_status: Number(row.graph_status), graph_response: parseJsonObject(row.graph_response_json), record: parseJsonObject(row.record_json), recorded_by_principal_id: row.recorded_by_principal_id, recorded_at: row.recorded_at,
  }));
}

function mailboxSendReviewId(siteId, focusKind, focusRef, generatedAt) {
  return `mailbox_send_review_${safeIdToken(siteId)}_${safeIdToken(focusKind)}_${safeIdToken(focusRef)}_${safeIdToken(generatedAt)}`;
}

async function ensureCloudflareMailboxSendReviewSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_mailbox_send_review_records (
      review_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, source_schema TEXT NOT NULL, generated_at TEXT NOT NULL, operation_id TEXT, focus_kind TEXT NOT NULL, focus_ref TEXT NOT NULL, send_accepted_id TEXT, send_confirmation_id TEXT, review_action TEXT NOT NULL, review_status TEXT NOT NULL, review_authority TEXT NOT NULL, mailbox_mutation_admission TEXT NOT NULL, note TEXT, record_json TEXT NOT NULL, recorded_by_principal_id TEXT NOT NULL, recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_mailbox_send_review_site_recorded
    ON cloudflare_mailbox_send_review_records(site_id, recorded_at)
  `).run();
}

async function recordCloudflareMailboxSendReview(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const now = new Date().toISOString();
  const focusKind = String(params.focus_kind ?? '');
  const focusRef = String(params.focus_ref ?? params.send_confirmation_id ?? params.send_accepted_id ?? '');
  if (!['mailbox_send_confirmation', 'mailbox_send_accepted'].includes(focusKind)) return { ok: false, code: 'mailbox_send_review_requires_supported_focus_kind', schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA, focus_kind: focusKind || null };
  if (!focusRef) return { ok: false, code: 'mailbox_send_review_requires_focus_ref', schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA };
  let sendAcceptedId = String(params.send_accepted_id ?? '');
  let sendConfirmationId = String(params.send_confirmation_id ?? '');
  let operationId = String(params.operation_id ?? '');
  await ensureCloudflareMailboxSendAcceptedSchema(db);
  await ensureCloudflareMailboxSendConfirmationSchema(db);
  if (focusKind === 'mailbox_send_confirmation') {
    const confirmation = (await listCloudflareMailboxSendConfirmations(env, siteId, 100))
      .find((entry) => entry.send_confirmation_id === focusRef);
    if (!confirmation) return { ok: false, code: 'mailbox_send_review_requires_existing_confirmation', schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA, focus_ref: focusRef };
    sendConfirmationId = String(confirmation.send_confirmation_id ?? focusRef);
    sendAcceptedId = String(confirmation.send_accepted_id ?? sendAcceptedId);
    operationId = operationId || String(confirmation.operation_id ?? '');
  } else {
    const accepted = (await listCloudflareMailboxSendAcceptedRecords(env, siteId, 100))
      .find((entry) => entry.send_accepted_id === focusRef);
    if (!accepted) return { ok: false, code: 'mailbox_send_review_requires_existing_send_accepted', schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA, focus_ref: focusRef };
    sendAcceptedId = String(accepted.send_accepted_id ?? focusRef);
    operationId = operationId || String(accepted.operation_id ?? '');
  }
  const generatedAt = String(params.generated_at ?? now);
  const record = {
    review_id: params.review_id ?? mailboxSendReviewId(siteId, focusKind, focusRef, generatedAt),
    site_id: siteId,
    schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA,
    source_schema: String(params.source_schema ?? CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA),
    generated_at: generatedAt,
    operation_id: operationId,
    focus_kind: focusKind,
    focus_ref: focusRef,
    send_accepted_id: sendAcceptedId,
    send_confirmation_id: sendConfirmationId,
    review_action: String(params.review_action ?? 'acknowledge_mailbox_send_review'),
    review_status: String(params.review_status ?? 'acknowledged'),
    review_authority: CLOUDFLARE_MAILBOX_SEND_REVIEW_AUTHORITY,
    mailbox_mutation_admission: 'not_admitted',
    note: String(params.note ?? ''),
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareMailboxSendReviewSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_mailbox_send_review_records (
      review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, send_accepted_id, send_confirmation_id, review_action, review_status, review_authority, mailbox_mutation_admission, note, record_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(review_id) DO UPDATE SET
      source_schema = excluded.source_schema, generated_at = excluded.generated_at, operation_id = excluded.operation_id, focus_kind = excluded.focus_kind, focus_ref = excluded.focus_ref, send_accepted_id = excluded.send_accepted_id, send_confirmation_id = excluded.send_confirmation_id, review_action = excluded.review_action, review_status = excluded.review_status, review_authority = excluded.review_authority, mailbox_mutation_admission = excluded.mailbox_mutation_admission, note = excluded.note, record_json = excluded.record_json, recorded_by_principal_id = excluded.recorded_by_principal_id, recorded_at = excluded.recorded_at
  `).bind(record.review_id, record.site_id, record.source_schema, record.generated_at, record.operation_id, record.focus_kind, record.focus_ref, record.send_accepted_id, record.send_confirmation_id, record.review_action, record.review_status, record.review_authority, record.mailbox_mutation_admission, record.note, JSON.stringify(record), record.recorded_by_principal_id, record.recorded_at).run();
  return { ok: true, schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA, status: record.review_status, site_id: siteId, mailbox_send_review_authority: record.review_authority, review_admission: 'admitted', mailbox_mutation_admission: record.mailbox_mutation_admission, record };
}

async function listCloudflareMailboxSendReviews(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareMailboxSendReviewSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_mailbox_send_review_records WHERE site_id = ? ORDER BY recorded_at DESC, generated_at DESC LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    review_id: row.review_id, site_id: row.site_id, schema: CLOUDFLARE_MAILBOX_SEND_REVIEW_SCHEMA, source_schema: row.source_schema, generated_at: row.generated_at, operation_id: row.operation_id, focus_kind: row.focus_kind, focus_ref: row.focus_ref, send_accepted_id: row.send_accepted_id, send_confirmation_id: row.send_confirmation_id, review_action: row.review_action, review_status: row.review_status, review_authority: row.review_authority, mailbox_mutation_admission: row.mailbox_mutation_admission, note: row.note, record: parseJsonObject(row.record_json), recorded_by_principal_id: row.recorded_by_principal_id, recorded_at: row.recorded_at,
  }));
}

function operationFocusReviewId(siteId, focusKind, focusRef, generatedAt) {
  return `operation_focus_review_${safeIdToken(siteId)}_${safeIdToken(focusKind)}_${safeIdToken(focusRef)}_${safeIdToken(generatedAt)}`;
}

async function findCloudflareOperationFocusRecord(env = {}, siteId, focusKind, focusRef) {
  const limit = 100;
  const by = (entries, idField) => (entries || []).find((entry) => String(entry?.[idField] ?? '') === focusRef) ?? null;
  if (focusKind === 'mailbox_draft_reply_proposal') return by(await listCloudflareMailboxDraftReplyProposals(env, siteId, limit), 'proposal_id');
  if (focusKind === 'mailbox_outlook_draft_create') return by(await listCloudflareMailboxOutlookDraftCreates(env, siteId, limit), 'draft_create_id');
  if (focusKind === 'mailbox_send_accepted') return by(await listCloudflareMailboxSendAcceptedRecords(env, siteId, limit), 'send_accepted_id');
  if (focusKind === 'mailbox_send_confirmation') return by(await listCloudflareMailboxSendConfirmations(env, siteId, limit), 'send_confirmation_id');
  if (focusKind === 'site_file_change_proposal') return by(await listCloudflareSiteFileChangeProposals(env, siteId, limit), 'proposal_id');
  if (focusKind === 'local_ingress_request') return by(await listCloudflareLocalIngressRequests(env, siteId, limit), 'local_ingress_request_id');
  if (focusKind === 'repository_publication_request') return by(await listCloudflareRepositoryPublicationRequests(env, siteId, limit), 'repository_publication_request_id');
  if (focusKind === 'resident_dispatch_windows_fallback_evidence') return by(await listCloudflareResidentDispatchWindowsFallbackEvidence(env, siteId, { limit }), 'fallback_evidence_id');
  if (focusKind === 'site_continuity_reconciliation_execution') return by(await listCloudflareContinuityReconciliationExecutions(env, siteId, limit), 'execution_id');
  return null;
}

async function recordCloudflareOperationFocusReview(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const focusKind = String(params.focus_kind ?? '');
  const focusRef = String(params.focus_ref ?? '');
  if (!focusKind || !focusRef) return { ok: false, code: 'operation_focus_review_requires_focus', schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA };
  const focusRecord = await findCloudflareOperationFocusRecord(env, siteId, focusKind, focusRef);
  if (!focusRecord) return { ok: false, code: 'operation_focus_review_requires_existing_focus', schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA, focus_kind: focusKind, focus_ref: focusRef };
  const now = new Date().toISOString();
  const generatedAt = String(params.generated_at ?? now);
  const record = {
    review_id: params.review_id ?? operationFocusReviewId(siteId, focusKind, focusRef, generatedAt),
    site_id: siteId,
    schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA,
    source_schema: String(params.source_schema ?? CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA),
    generated_at: generatedAt,
    operation_id: String(params.operation_id ?? focusRecord.operation_id ?? ''),
    focus_kind: focusKind,
    focus_ref: focusRef,
    review_action: String(params.review_action ?? 'acknowledge_operation_focus_review'),
    review_status: String(params.review_status ?? 'acknowledged'),
    review_authority: CLOUDFLARE_OPERATION_FOCUS_REVIEW_AUTHORITY,
    note: String(params.note ?? ''),
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareOperationFocusReviewSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_operation_focus_review_records (
      review_id, site_id, source_schema, generated_at, operation_id, focus_kind, focus_ref, review_action, review_status, review_authority, note, record_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(review_id) DO UPDATE SET
      source_schema = excluded.source_schema, generated_at = excluded.generated_at, operation_id = excluded.operation_id, focus_kind = excluded.focus_kind, focus_ref = excluded.focus_ref, review_action = excluded.review_action, review_status = excluded.review_status, review_authority = excluded.review_authority, note = excluded.note, record_json = excluded.record_json, recorded_by_principal_id = excluded.recorded_by_principal_id, recorded_at = excluded.recorded_at
  `).bind(record.review_id, record.site_id, record.source_schema, record.generated_at, record.operation_id, record.focus_kind, record.focus_ref, record.review_action, record.review_status, record.review_authority, record.note, JSON.stringify(record), record.recorded_by_principal_id, record.recorded_at).run();
  return { ok: true, schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA, status: record.review_status, site_id: siteId, operation_focus_review_authority: record.review_authority, review_admission: 'admitted', record };
}

async function ensureCloudflareOperationFocusReviewSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_operation_focus_review_records (
      review_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      focus_kind TEXT NOT NULL,
      focus_ref TEXT NOT NULL,
      review_action TEXT NOT NULL,
      review_status TEXT NOT NULL,
      review_authority TEXT NOT NULL,
      note TEXT,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_operation_focus_review_records_site_recorded
    ON cloudflare_operation_focus_review_records(site_id, recorded_at)
  `).run();
}

async function listCloudflareOperationFocusReviews(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareOperationFocusReviewSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_operation_focus_review_records WHERE site_id = ? ORDER BY recorded_at DESC, generated_at DESC LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    review_id: row.review_id, site_id: row.site_id, schema: CLOUDFLARE_OPERATION_FOCUS_REVIEW_SCHEMA, source_schema: row.source_schema, generated_at: row.generated_at, operation_id: row.operation_id, focus_kind: row.focus_kind, focus_ref: row.focus_ref, review_action: row.review_action, review_status: row.review_status, review_authority: row.review_authority, note: row.note, record: parseJsonObject(row.record_json), recorded_by_principal_id: row.recorded_by_principal_id, recorded_at: row.recorded_at,
  }));
}

async function resolveCloudflareGraphAccessToken(env = {}) {
  if (env.GRAPH_ACCESS_TOKEN) return { ok: true, access_token: String(env.GRAPH_ACCESS_TOKEN), credential_source: 'cloudflare_worker_secret:GRAPH_ACCESS_TOKEN' };
  if (!env.GRAPH_TENANT_ID || !env.GRAPH_CLIENT_ID || !env.GRAPH_CLIENT_SECRET) {
    return { ok: false, code: 'graph_credentials_missing', credential_sources_required: ['GRAPH_ACCESS_TOKEN', 'GRAPH_TENANT_ID+GRAPH_CLIENT_ID+GRAPH_CLIENT_SECRET'] };
  }
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(String(env.GRAPH_TENANT_ID))}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: String(env.GRAPH_CLIENT_ID),
    client_secret: String(env.GRAPH_CLIENT_SECRET),
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const response = await cloudflareGraphFetch(env, tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  if (!response.ok) return { ok: false, code: 'graph_token_request_failed', graph_status: response.status };
  const packet = await response.json();
  if (!packet?.access_token) return { ok: false, code: 'graph_token_response_missing_access_token' };
  return { ok: true, access_token: String(packet.access_token), credential_source: 'cloudflare_worker_secret:GRAPH_CLIENT_SECRET' };
}

async function fetchCloudflareGraphJson(env, url, init = {}) {
  const response = await cloudflareGraphFetch(env, url, { method: 'GET', ...init });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { text };
    }
  }
  if (!response.ok) return { ok: false, status: response.status, error: body };
  return { ok: true, status: response.status, body };
}

function cloudflareGraphFetch(env, url, init) {
  const fetchImpl = env.CLOUDFLARE_GRAPH_FETCH ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('cloudflare_graph_fetch_unavailable');
  return fetchImpl(url, init);
}

async function recordCloudflareResidentLoopShadowRun(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const loopRun = createResidentLoopShadowRun(siteId, params);
  if (!loopRun.ok) return loopRun;
  const record = {
    loop_run_id: params.loop_run_id ?? residentLoopShadowRunId(siteId, loopRun.loop_run),
    site_id: siteId,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    source_locus: params.source_locus ?? 'windows_local_site',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    loop_run: loopRun.loop_run,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareResidentLoopShadowRunSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_resident_loop_shadow_runs (
      loop_run_id,
      site_id,
      operation_id,
      source_locus,
      target_locus,
      run_started_at,
      run_finished_at,
      loop_status,
      step_count,
      operator_attention_count,
      dispatch_authority,
      shadow_mode,
      dispatch_action,
      loop_run_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(loop_run_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      run_started_at = excluded.run_started_at,
      run_finished_at = excluded.run_finished_at,
      loop_status = excluded.loop_status,
      step_count = excluded.step_count,
      operator_attention_count = excluded.operator_attention_count,
      dispatch_authority = excluded.dispatch_authority,
      shadow_mode = excluded.shadow_mode,
      dispatch_action = excluded.dispatch_action,
      loop_run_json = excluded.loop_run_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.loop_run_id,
    record.site_id,
    record.loop_run.operation_id,
    record.source_locus,
    record.target_locus,
    record.loop_run.run_started_at,
    record.loop_run.run_finished_at,
    record.loop_run.status,
    record.loop_run.step_count,
    record.loop_run.operator_attention_count,
    record.dispatch_authority,
    record.shadow_mode,
    record.dispatch_action,
    JSON.stringify(record.loop_run),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    loop_run: record.loop_run,
    record,
  };
}

async function ensureCloudflareResidentLoopShadowRunSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_resident_loop_shadow_runs (
      loop_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      run_started_at TEXT NOT NULL,
      run_finished_at TEXT,
      loop_status TEXT NOT NULL,
      step_count INTEGER NOT NULL,
      operator_attention_count INTEGER NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      loop_run_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_resident_loop_shadow_runs_site_recorded
    ON cloudflare_resident_loop_shadow_runs(site_id, recorded_at)
  `).run();
}

async function listCloudflareResidentLoopShadowRuns(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareResidentLoopShadowRunSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_resident_loop_shadow_runs
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    loop_run_id: row.loop_run_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    schema: CLOUDFLARE_RESIDENT_LOOP_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    run_started_at: row.run_started_at,
    run_finished_at: row.run_finished_at,
    loop_status: row.loop_status,
    step_count: Number(row.step_count),
    operator_attention_count: Number(row.operator_attention_count),
    dispatch_authority: row.dispatch_authority,
    shadow_mode: row.shadow_mode,
    dispatch_action: row.dispatch_action,
    loop_run: parseJsonObject(row.loop_run_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createResidentLoopShadowRun(siteId, params = {}) {
  const source = params.loop_run ?? params.summary ?? {};
  const runStartedAt = String(params.run_started_at ?? source.run_started_at ?? source.started_at ?? new Date().toISOString());
  const status = String(params.status ?? source.status ?? 'observed');
  const steps = Array.isArray(params.steps) ? params.steps : Array.isArray(source.steps) ? source.steps : [];
  const operatorAttention = Array.isArray(params.operator_attention) ? params.operator_attention
    : Array.isArray(source.operator_attention) ? source.operator_attention
      : Array.isArray(source.operator_attention_events) ? source.operator_attention_events
        : [];
  return {
    ok: true,
    loop_run: {
      schema: 'narada.sonar.resident_loop_shadow_run.v1',
      site_id: siteId,
      operation_id: params.operation_id ?? source.operation_id ?? null,
      run_started_at: runStartedAt,
      run_finished_at: params.run_finished_at ?? source.run_finished_at ?? source.finished_at ?? null,
      status,
      step_count: clampInteger(params.step_count ?? source.step_count ?? steps.length, 0, 10000, steps.length),
      operator_attention_count: clampInteger(params.operator_attention_count ?? source.operator_attention_count ?? operatorAttention.length, 0, 10000, operatorAttention.length),
      steps,
      operator_attention: operatorAttention,
      source_summary_path: params.source_summary_path ?? params.summary_path ?? null,
      dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
      dispatch_action: 'none',
      shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    },
  };
}

function residentLoopShadowRunId(siteId, loopRun) {
  return `resident_loop_shadow_${safeIdToken(siteId)}_${safeIdToken(loopRun.operation_id)}_${safeIdToken(loopRun.run_started_at)}`;
}

async function readCloudflareTaskLifecycleShadowSource(env = {}, siteId, params = {}, principal = null) {
  const sourceUrl = resolveTaskLifecycleShadowReadSourceUrl(env, params);
  if (!sourceUrl) return { ok: false, code: 'task_lifecycle_shadow_read_source_url_missing' };
  const fetched = await fetchTaskLifecycleShadowReadSource(env, sourceUrl, params);
  if (!fetched.ok) return fetched;
  const readId = params.read_id ?? `task_lifecycle_shadow_read_${safeIdToken(siteId)}_${safeIdToken(fetched.body.generated_at ?? new Date().toISOString())}`;
  const recorded = await recordCloudflareTaskLifecycleShadowRead(env, siteId, {
    ...params,
    read_id: readId,
    source_payload: fetched.body,
    source_locus: fetched.body.authority_locus ?? 'windows_local_site',
    target_locus: fetched.body.shadow_target_locus ?? 'cloudflare_carrier_site',
    source_url_host: safeUrlHost(sourceUrl),
  }, principal);
  if (!recorded.ok) return recorded;
  return {
    ...recorded,
    status: 'source_read_recorded',
    source_url_host: safeUrlHost(sourceUrl),
  };
}

function resolveTaskLifecycleShadowReadSourceUrl(env = {}, params = {}) {
  if (env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_URL) return env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_URL;
  if (env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_ALLOW_OPERATOR_URL === '1' && params.source_url) return params.source_url;
  return null;
}

async function fetchTaskLifecycleShadowReadSource(env = {}, sourceUrl, params = {}) {
  const headers = { accept: 'application/json' };
  const token = params.source_token ?? env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_TOKEN ?? null;
  if (token) headers.authorization = `Bearer ${token}`;
  const url = new URL(sourceUrl);
  if (params.limit != null && !url.searchParams.has('limit')) url.searchParams.set('limit', String(clampInteger(params.limit, 1, 100, 25)));
  const response = await fetch(url.toString(), { method: 'GET', headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: 'task_lifecycle_shadow_read_source_fetch_failed', http_status: response.status, body };
  if (!body || typeof body !== 'object') return { ok: false, code: 'task_lifecycle_shadow_read_source_invalid_json' };
  return { ok: true, body };
}

async function recordCloudflareTaskLifecycleShadowRead(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createTaskLifecycleShadowRead(siteId, params);
  if (!payload.ok) return payload;
  const read = payload.read;
  const record = {
    read_id: params.read_id ?? taskLifecycleShadowReadId(siteId, read),
    site_id: siteId,
    schema: CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SCHEMA,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    source_locus: params.source_locus ?? read.authority_locus,
    target_locus: params.target_locus ?? read.shadow_target_locus,
    source_url_host: params.source_url_host ?? null,
    source_db_path: read.source_db_path,
    source_schema: read.source_schema,
    generated_at: read.generated_at,
    task_count: read.task_count,
    status_counts: read.status_counts,
    tasks: read.tasks,
    mutation_authority: read.mutation_authority,
    shadow_read_posture: read.shadow_read_posture,
    cloudflare_write_admission: read.cloudflare_write_admission,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareTaskLifecycleShadowReadSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_task_lifecycle_shadow_reads (
      read_id,
      site_id,
      source_locus,
      target_locus,
      source_url_host,
      source_db_path,
      source_schema,
      generated_at,
      task_count,
      status_counts_json,
      tasks_json,
      mutation_authority,
      shadow_read_posture,
      cloudflare_write_admission,
      dispatch_authority,
      shadow_mode,
      dispatch_action,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(read_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      source_url_host = excluded.source_url_host,
      source_db_path = excluded.source_db_path,
      source_schema = excluded.source_schema,
      generated_at = excluded.generated_at,
      task_count = excluded.task_count,
      status_counts_json = excluded.status_counts_json,
      tasks_json = excluded.tasks_json,
      mutation_authority = excluded.mutation_authority,
      shadow_read_posture = excluded.shadow_read_posture,
      cloudflare_write_admission = excluded.cloudflare_write_admission,
      dispatch_authority = excluded.dispatch_authority,
      shadow_mode = excluded.shadow_mode,
      dispatch_action = excluded.dispatch_action,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.read_id,
    record.site_id,
    record.source_locus,
    record.target_locus,
    record.source_url_host,
    record.source_db_path,
    record.source_schema,
    record.generated_at,
    record.task_count,
    JSON.stringify(record.status_counts),
    JSON.stringify(record.tasks),
    record.mutation_authority,
    record.shadow_read_posture,
    record.cloudflare_write_admission,
    record.dispatch_authority,
    record.shadow_mode,
    record.dispatch_action,
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    mutation_authority: record.mutation_authority,
    cloudflare_write_admission: record.cloudflare_write_admission,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    read,
    record,
  };
}

async function ensureCloudflareTaskLifecycleShadowReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_shadow_reads (
      read_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      source_url_host TEXT,
      source_db_path TEXT,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      task_count INTEGER NOT NULL,
      status_counts_json TEXT NOT NULL,
      tasks_json TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      shadow_read_posture TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_task_lifecycle_shadow_reads_site_recorded
    ON cloudflare_task_lifecycle_shadow_reads(site_id, recorded_at)
  `).run();
}

async function listCloudflareTaskLifecycleShadowReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareTaskLifecycleShadowReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_task_lifecycle_shadow_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    read_id: row.read_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    source_url_host: row.source_url_host,
    source_db_path: row.source_db_path,
    source_schema: row.source_schema,
    generated_at: row.generated_at,
    task_count: Number(row.task_count),
    status_counts: parseJsonObject(row.status_counts_json),
    tasks: parseJsonArray(row.tasks_json),
    mutation_authority: row.mutation_authority,
    shadow_read_posture: row.shadow_read_posture,
    cloudflare_write_admission: row.cloudflare_write_admission,
    dispatch_authority: row.dispatch_authority,
    shadow_mode: row.shadow_mode,
    dispatch_action: row.dispatch_action,
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

export function classifyCloudflareTaskLifecycleWriteAdmission(request = {}, state = {}) {
  const mutationClass = String(request.mutation_class ?? request.action ?? request.operation ?? '').trim() || 'unknown';
  const shadowReadClasses = new Set(['shadow_read_record', 'task_lifecycle.shadow_read.record']);
  const knownWriteClasses = new Set([
    'task_create',
    'task_claim',
    'task_report',
    'task_finish',
    'changed_file_evidence',
    'task_projection_write',
    'task_source_state_write',
    'task_assignment_write',
    'task_role_resolution_write',
    'task_roster_mutation_write',
    'task_sqlite_write',
  ]);
  const isShadowRead = shadowReadClasses.has(mutationClass);
  const isKnownWrite = knownWriteClasses.has(mutationClass);
  const taskCreateCutoverReady = mutationClass === 'task_create'
    && (request.cloudflare_task_create_cutover === true || state.task_create_cutover_ready === true)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskClaimCutoverReady = mutationClass === 'task_claim'
    && (request.cloudflare_task_claim_cutover === true || state.task_claim_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.claimant_agent_id ?? request.agent ?? request.claimant_principal_id ?? state.claimant_agent_id ?? state.claimant_principal_id)
    && Boolean(request.assignment_authority_ref ?? state.assignment_authority_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskReportCutoverReady = mutationClass === 'task_report'
    && (request.cloudflare_task_report_cutover === true || state.task_report_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.reporter_agent_id ?? request.agent ?? request.reporter_principal_id ?? state.reporter_agent_id ?? state.reporter_principal_id)
    && Boolean(request.summary ?? state.summary)
    && Boolean(request.report_authority_ref ?? state.report_authority_ref)
    && Boolean(request.report_schema_ref ?? state.report_schema_ref)
    && Boolean(request.changed_file_evidence_boundary_ref ?? state.changed_file_evidence_boundary_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskFinishCutoverReady = mutationClass === 'task_finish'
    && (request.cloudflare_task_finish_cutover === true || state.task_finish_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.finalizer_agent_id ?? request.agent ?? request.finalizer_principal_id ?? state.finalizer_agent_id ?? state.finalizer_principal_id)
    && Boolean(request.finish_verdict ?? state.finish_verdict)
    && Boolean(request.finish_authority_ref ?? state.finish_authority_ref)
    && Boolean(request.finish_schema_ref ?? state.finish_schema_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const changedFileEvidenceCutoverReady = mutationClass === 'changed_file_evidence'
    && (request.cloudflare_changed_file_evidence_cutover === true || state.changed_file_evidence_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.report_id ?? state.report_id)
    && Boolean(request.file_path ?? request.repo_relative_path ?? state.file_path ?? state.repo_relative_path)
    && Boolean(request.reporter_agent_id ?? request.agent ?? request.reporter_principal_id ?? state.reporter_agent_id ?? state.reporter_principal_id)
    && Boolean(request.file_evidence_authority_ref ?? state.file_evidence_authority_ref)
    && Boolean(request.file_material_source_ref ?? request.evidence_material_ref ?? state.file_material_source_ref ?? state.evidence_material_ref)
    && Boolean(request.repository_authority_ref ?? request.site_file_authority_ref ?? state.repository_authority_ref ?? state.site_file_authority_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskProjectionWriteCutoverReady = mutationClass === 'task_projection_write'
    && (request.cloudflare_task_projection_write_cutover === true || state.task_projection_write_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.projection_target_ref ?? state.projection_target_ref)
    && Boolean(request.projection_schema_ref ?? state.projection_schema_ref)
    && Boolean(request.projection_authority_ref ?? state.projection_authority_ref)
    && Boolean(request.source_evidence_ref ?? state.source_evidence_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskSourceStateWriteCutoverReady = mutationClass === 'task_source_state_write'
    && (request.cloudflare_task_source_state_write_cutover === true || state.task_source_state_write_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.source_state_authority_ref ?? state.source_state_authority_ref)
    && Boolean(request.source_state_schema_ref ?? state.source_state_schema_ref)
    && Boolean(request.source_state_evidence_ref ?? state.source_state_evidence_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskAssignmentWriteCutoverReady = mutationClass === 'task_assignment_write'
    && (request.cloudflare_task_assignment_write_cutover === true || state.task_assignment_write_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.assignee_agent_id ?? request.agent ?? request.assignee_principal_id ?? state.assignee_agent_id ?? state.assignee_principal_id)
    && Boolean(request.assignment_authority_ref ?? state.assignment_authority_ref)
    && Boolean(request.assignment_schema_ref ?? state.assignment_schema_ref)
    && Boolean(request.assignment_evidence_ref ?? state.assignment_evidence_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskRoleResolutionWriteCutoverReady = mutationClass === 'task_role_resolution_write'
    && (request.cloudflare_task_role_resolution_write_cutover === true || state.task_role_resolution_write_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.assignee_principal_id ?? state.assignee_principal_id)
    && Boolean(request.role_resolution_authority_ref ?? state.role_resolution_authority_ref)
    && Boolean(request.roster_source_ref ?? state.roster_source_ref)
    && Boolean(request.role_resolution_schema_ref ?? state.role_resolution_schema_ref)
    && Boolean(request.role_resolution_evidence_ref ?? state.role_resolution_evidence_ref)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const taskRosterMutationWriteCutoverReady = mutationClass === 'task_roster_mutation_write'
    && (request.cloudflare_task_roster_mutation_write_cutover === true || state.task_roster_mutation_write_cutover_ready === true)
    && Boolean(request.task_id ?? state.task_id)
    && Boolean(request.assignee_principal_id ?? state.assignee_principal_id)
    && Boolean(request.roster_mutation_authority_ref ?? state.roster_mutation_authority_ref)
    && Boolean(request.roster_schema_ref ?? state.roster_schema_ref)
    && Boolean(request.roster_evidence_ref ?? state.roster_evidence_ref)
    && Boolean(request.membership_role ?? state.membership_role)
    && Boolean(request.membership_status ?? state.membership_status)
    && Boolean(request.cutover_point_ref ?? state.cutover_point_ref)
    && Boolean(request.governed_write_contract_ref ?? state.governed_write_contract_ref)
    && Boolean(request.confirmation_evidence_ref ?? state.confirmation_evidence_ref);
  const cutoverReady = taskCreateCutoverReady || taskClaimCutoverReady || taskReportCutoverReady || taskFinishCutoverReady || changedFileEvidenceCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady;
  const action = isShadowRead || cutoverReady ? 'admit' : 'refuse';
  const reason = isShadowRead ? 'shadow_read_projection_admitted'
    : taskCreateCutoverReady ? 'cloudflare_task_create_cutover_admitted'
      : taskClaimCutoverReady ? 'cloudflare_task_claim_cutover_admitted'
      : taskReportCutoverReady ? 'cloudflare_task_report_cutover_admitted'
      : taskFinishCutoverReady ? 'cloudflare_task_finish_cutover_admitted'
      : changedFileEvidenceCutoverReady ? 'cloudflare_changed_file_evidence_cutover_admitted'
      : taskProjectionWriteCutoverReady ? 'cloudflare_task_projection_write_cutover_admitted'
      : taskSourceStateWriteCutoverReady ? 'cloudflare_task_source_state_write_cutover_admitted'
      : taskAssignmentWriteCutoverReady ? 'cloudflare_task_assignment_write_cutover_admitted'
      : taskRoleResolutionWriteCutoverReady ? 'cloudflare_task_role_resolution_write_cutover_admitted'
      : taskRosterMutationWriteCutoverReady ? 'cloudflare_task_roster_mutation_write_cutover_admitted'
      : isKnownWrite ? 'windows_task_lifecycle_mutation_authority_retained'
        : 'unknown_task_lifecycle_mutation_class';
  const requiredEvidence = isShadowRead || cutoverReady ? [] : [
    'task_lifecycle_write_contract_migrated',
    'cloudflare_task_lifecycle_mutation_authority_declared',
    'cutover_point_recorded',
    'governed_write_confirmation_evidence',
  ];
  const mutationAuthority = cutoverReady ? 'cloudflare_task_lifecycle_d1'
    : state.mutation_authority ?? request.mutation_authority ?? 'windows_task_lifecycle_sqlite';
  const cloudflareWriteAdmission = cutoverReady ? 'admitted' : 'not_admitted';
  const writeEffect = taskCreateCutoverReady ? 'task_lifecycle_create'
    : taskClaimCutoverReady ? 'task_lifecycle_claim'
      : taskReportCutoverReady ? 'task_lifecycle_report'
      : taskFinishCutoverReady ? 'task_lifecycle_finish'
      : changedFileEvidenceCutoverReady ? 'changed_file_evidence_record'
      : taskProjectionWriteCutoverReady ? 'task_lifecycle_projection_write'
      : taskSourceStateWriteCutoverReady ? 'task_lifecycle_source_state_write'
      : taskAssignmentWriteCutoverReady ? 'task_lifecycle_assignment_write'
      : taskRoleResolutionWriteCutoverReady ? 'task_lifecycle_role_resolution_write'
      : taskRosterMutationWriteCutoverReady ? 'task_lifecycle_roster_mutation_write'
      : 'none';
  return {
    schema: CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_DECISION_SCHEMA,
    action,
    mutation_class: mutationClass,
    reason,
    authority_locus: cutoverReady ? 'cloudflare_carrier_site' : state.authority_locus ?? request.authority_locus ?? 'windows_local_site',
    target_authority_locus: state.target_authority_locus ?? request.target_authority_locus ?? 'cloudflare_carrier_site',
    mutation_authority: mutationAuthority,
    cloudflare_write_admission: cloudflareWriteAdmission,
    write_effect: writeEffect,
    task_id: request.task_id ?? state.task_id ?? null,
    claimant_agent_id: request.claimant_agent_id ?? request.agent ?? state.claimant_agent_id ?? null,
    claimant_principal_id: request.claimant_principal_id ?? state.claimant_principal_id ?? null,
    assignee_agent_id: request.assignee_agent_id ?? request.agent ?? state.assignee_agent_id ?? null,
    assignee_principal_id: request.assignee_principal_id ?? state.assignee_principal_id ?? null,
    reporter_agent_id: request.reporter_agent_id ?? request.agent ?? state.reporter_agent_id ?? null,
    reporter_principal_id: request.reporter_principal_id ?? state.reporter_principal_id ?? null,
    finalizer_agent_id: request.finalizer_agent_id ?? request.agent ?? state.finalizer_agent_id ?? null,
    finalizer_principal_id: request.finalizer_principal_id ?? state.finalizer_principal_id ?? null,
    assignment_authority_ref: request.assignment_authority_ref ?? state.assignment_authority_ref ?? null,
    assignment_schema_ref: request.assignment_schema_ref ?? state.assignment_schema_ref ?? null,
    assignment_evidence_ref: request.assignment_evidence_ref ?? state.assignment_evidence_ref ?? null,
    assignment_write_admission: taskAssignmentWriteCutoverReady ? 'admitted' : null,
    assignment_write_schema: taskAssignmentWriteCutoverReady ? CLOUDFLARE_TASK_LIFECYCLE_ASSIGNMENT_WRITE_SCHEMA : null,
    roster_mutation_admission: taskAssignmentWriteCutoverReady ? 'not_admitted' : null,
    role_resolution_authority_admission: taskAssignmentWriteCutoverReady ? 'not_admitted' : null,
    assignment_mailbox_mutation_admission: taskAssignmentWriteCutoverReady ? 'not_admitted' : null,
    assignment_filesystem_mutation_admission: taskAssignmentWriteCutoverReady ? 'not_admitted' : null,
    assignment_repository_publication_admission: taskAssignmentWriteCutoverReady ? 'not_admitted' : null,
    role_resolution_write_admission: taskRoleResolutionWriteCutoverReady ? 'admitted' : null,
    role_resolution_write_schema: taskRoleResolutionWriteCutoverReady ? CLOUDFLARE_TASK_LIFECYCLE_ROLE_RESOLUTION_WRITE_SCHEMA : null,
    role_resolution_authority_ref: request.role_resolution_authority_ref ?? state.role_resolution_authority_ref ?? null,
    roster_source_ref: request.roster_source_ref ?? state.roster_source_ref ?? null,
    role_resolution_schema_ref: request.role_resolution_schema_ref ?? state.role_resolution_schema_ref ?? null,
    role_resolution_evidence_ref: request.role_resolution_evidence_ref ?? state.role_resolution_evidence_ref ?? null,
    role_resolution_roster_read_admission: taskRoleResolutionWriteCutoverReady ? 'admitted' : null,
    role_resolution_roster_mutation_admission: taskRoleResolutionWriteCutoverReady ? 'not_admitted' : null,
    role_resolution_mailbox_mutation_admission: taskRoleResolutionWriteCutoverReady ? 'not_admitted' : null,
    role_resolution_filesystem_mutation_admission: taskRoleResolutionWriteCutoverReady ? 'not_admitted' : null,
    role_resolution_repository_publication_admission: taskRoleResolutionWriteCutoverReady ? 'not_admitted' : null,
    roster_mutation_write_admission: taskRosterMutationWriteCutoverReady ? 'admitted' : null,
    roster_mutation_write_schema: taskRosterMutationWriteCutoverReady ? CLOUDFLARE_TASK_LIFECYCLE_ROSTER_MUTATION_WRITE_SCHEMA : null,
    roster_mutation_authority_ref: request.roster_mutation_authority_ref ?? state.roster_mutation_authority_ref ?? null,
    roster_schema_ref: request.roster_schema_ref ?? state.roster_schema_ref ?? null,
    roster_evidence_ref: request.roster_evidence_ref ?? state.roster_evidence_ref ?? null,
    membership_role: request.membership_role ?? state.membership_role ?? null,
    membership_status: request.membership_status ?? state.membership_status ?? null,
    roster_mailbox_mutation_admission: taskRosterMutationWriteCutoverReady ? 'not_admitted' : null,
    roster_filesystem_mutation_admission: taskRosterMutationWriteCutoverReady ? 'not_admitted' : null,
    roster_repository_publication_admission: taskRosterMutationWriteCutoverReady ? 'not_admitted' : null,
    report_authority_ref: request.report_authority_ref ?? state.report_authority_ref ?? null,
    report_schema_ref: request.report_schema_ref ?? state.report_schema_ref ?? null,
    finish_authority_ref: request.finish_authority_ref ?? state.finish_authority_ref ?? null,
    finish_schema_ref: request.finish_schema_ref ?? state.finish_schema_ref ?? null,
    finish_verdict: request.finish_verdict ?? state.finish_verdict ?? null,
    changed_file_evidence_boundary_ref: request.changed_file_evidence_boundary_ref ?? state.changed_file_evidence_boundary_ref ?? null,
    report_id: request.report_id ?? state.report_id ?? null,
    file_path: request.file_path ?? request.repo_relative_path ?? state.file_path ?? state.repo_relative_path ?? null,
    file_evidence_authority_ref: request.file_evidence_authority_ref ?? state.file_evidence_authority_ref ?? null,
    file_material_source_ref: request.file_material_source_ref ?? request.evidence_material_ref ?? state.file_material_source_ref ?? state.evidence_material_ref ?? null,
    repository_authority_ref: request.repository_authority_ref ?? request.site_file_authority_ref ?? state.repository_authority_ref ?? state.site_file_authority_ref ?? null,
    filesystem_mutation_admission: changedFileEvidenceCutoverReady ? 'not_admitted' : null,
    repository_publication_admission: changedFileEvidenceCutoverReady ? 'not_admitted' : null,
    projection_write_admission: taskProjectionWriteCutoverReady ? 'admitted' : changedFileEvidenceCutoverReady ? 'not_admitted' : null,
    projection_target_ref: request.projection_target_ref ?? state.projection_target_ref ?? null,
    projection_schema_ref: request.projection_schema_ref ?? state.projection_schema_ref ?? null,
    projection_authority_ref: request.projection_authority_ref ?? state.projection_authority_ref ?? null,
    source_evidence_ref: request.source_evidence_ref ?? state.source_evidence_ref ?? null,
    sqlite_mutation_admission: taskProjectionWriteCutoverReady ? 'not_admitted' : null,
    projection_filesystem_mutation_admission: taskProjectionWriteCutoverReady ? 'not_admitted' : null,
    projection_repository_publication_admission: taskProjectionWriteCutoverReady ? 'not_admitted' : null,
    source_state_write_admission: taskSourceStateWriteCutoverReady ? 'admitted' : null,
    source_state_write_schema: taskSourceStateWriteCutoverReady ? CLOUDFLARE_TASK_LIFECYCLE_SOURCE_STATE_WRITE_SCHEMA : null,
    source_state_authority_ref: request.source_state_authority_ref ?? state.source_state_authority_ref ?? null,
    source_state_schema_ref: request.source_state_schema_ref ?? state.source_state_schema_ref ?? null,
    source_state_evidence_ref: request.source_state_evidence_ref ?? state.source_state_evidence_ref ?? null,
    windows_sqlite_source_write_admission: taskSourceStateWriteCutoverReady ? 'not_admitted' : null,
    source_state_filesystem_mutation_admission: taskSourceStateWriteCutoverReady ? 'not_admitted' : null,
    source_state_repository_publication_admission: taskSourceStateWriteCutoverReady ? 'not_admitted' : null,
    conflict_policy: request.conflict_policy ?? state.conflict_policy ?? (taskClaimCutoverReady ? 'opened_only_no_overwrite' : taskReportCutoverReady ? 'claimed_only_report_no_overwrite' : taskFinishCutoverReady ? 'closed_report_only_finish_no_overwrite' : null),
    rollback_posture: request.rollback_posture ?? state.rollback_posture ?? (taskClaimCutoverReady ? 'claim_update_can_be_released_by_future_unclaim_cutover' : taskReportCutoverReady ? 'report_transition_can_be_reviewed_or_reopened_by_future_cutover' : taskFinishCutoverReady ? 'finish_verdict_can_be_reviewed_by_future_reopen_cutover' : null),
    cutover_point_ref: request.cutover_point_ref ?? state.cutover_point_ref ?? null,
    governed_write_contract_ref: request.governed_write_contract_ref ?? state.governed_write_contract_ref ?? null,
    confirmation_evidence_ref: request.confirmation_evidence_ref ?? state.confirmation_evidence_ref ?? null,
    required_evidence: requiredEvidence,
    retained_windows_authority: isShadowRead ? [] : [
      ...(taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_lifecycle_sqlite_mutation_store']),
      ...(taskCreateCutoverReady || taskClaimCutoverReady || taskReportCutoverReady || taskFinishCutoverReady || changedFileEvidenceCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_create_transition']),
      ...(taskClaimCutoverReady || taskReportCutoverReady || taskFinishCutoverReady || changedFileEvidenceCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_claim_assignment_transition']),
      ...(taskReportCutoverReady || taskFinishCutoverReady || changedFileEvidenceCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_report_evidence_transition']),
      ...(taskFinishCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_finish_verdict_transition']),
      ...(changedFileEvidenceCutoverReady || taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['changed_file_evidence_transition']),
      ...(taskProjectionWriteCutoverReady || taskSourceStateWriteCutoverReady || taskAssignmentWriteCutoverReady || taskRoleResolutionWriteCutoverReady || taskRosterMutationWriteCutoverReady ? [] : ['task_projection_write_transition']),
      ...(taskAssignmentWriteCutoverReady ? ['windows_roster_mutation_store', 'windows_role_resolution'] : []),
      ...(taskRoleResolutionWriteCutoverReady ? ['windows_roster_mutation_store'] : []),
    ],
  };
}

async function recordCloudflareTaskLifecycleWriteAdmission(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission(params, params.state ?? {});
  const recordedAt = new Date().toISOString();
  const record = {
    admission_id: params.admission_id ?? taskLifecycleWriteAdmissionId(siteId, decision, recordedAt),
    site_id: siteId,
    schema: CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_SCHEMA,
    mutation_class: decision.mutation_class,
    admission_action: decision.action,
    admission_reason: decision.reason,
    authority_locus: decision.authority_locus,
    target_authority_locus: decision.target_authority_locus,
    mutation_authority: decision.mutation_authority,
    cloudflare_write_admission: decision.cloudflare_write_admission,
    write_effect: decision.write_effect,
    decision,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: recordedAt,
  };
  await ensureCloudflareTaskLifecycleWriteAdmissionSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_task_lifecycle_write_admissions (
      admission_id,
      site_id,
      mutation_class,
      admission_action,
      admission_reason,
      authority_locus,
      target_authority_locus,
      mutation_authority,
      cloudflare_write_admission,
      write_effect,
      decision_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(admission_id) DO UPDATE SET
      mutation_class = excluded.mutation_class,
      admission_action = excluded.admission_action,
      admission_reason = excluded.admission_reason,
      authority_locus = excluded.authority_locus,
      target_authority_locus = excluded.target_authority_locus,
      mutation_authority = excluded.mutation_authority,
      cloudflare_write_admission = excluded.cloudflare_write_admission,
      write_effect = excluded.write_effect,
      decision_json = excluded.decision_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.admission_id,
    record.site_id,
    record.mutation_class,
    record.admission_action,
    record.admission_reason,
    record.authority_locus,
    record.target_authority_locus,
    record.mutation_authority,
    record.cloudflare_write_admission,
    record.write_effect,
    JSON.stringify(record.decision),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_SCHEMA,
    status: 'admission_recorded',
    site_id: siteId,
    mutation_authority: record.mutation_authority,
    cloudflare_write_admission: record.cloudflare_write_admission,
    write_effect: record.write_effect,
    decision,
    record,
  };
}

async function ensureCloudflareTaskLifecycleWriteAdmissionSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_write_admissions (
      admission_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      mutation_class TEXT NOT NULL,
      admission_action TEXT NOT NULL,
      admission_reason TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      target_authority_locus TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      write_effect TEXT NOT NULL,
      decision_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_task_lifecycle_write_admissions_site_recorded
    ON cloudflare_task_lifecycle_write_admissions(site_id, recorded_at)
  `).run();
}

async function listCloudflareTaskLifecycleWriteAdmissions(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareTaskLifecycleWriteAdmissionSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_task_lifecycle_write_admissions
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    admission_id: row.admission_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_TASK_LIFECYCLE_WRITE_ADMISSION_SCHEMA,
    mutation_class: row.mutation_class,
    admission_action: row.admission_action,
    admission_reason: row.admission_reason,
    authority_locus: row.authority_locus,
    target_authority_locus: row.target_authority_locus,
    mutation_authority: row.mutation_authority,
    cloudflare_write_admission: row.cloudflare_write_admission,
    write_effect: row.write_effect,
    decision: parseJsonObject(row.decision_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function taskLifecycleWriteAdmissionId(siteId, decision, recordedAt) {
  return `task_lifecycle_write_admission_${safeIdToken(siteId)}_${safeIdToken(decision.mutation_class)}_${safeIdToken(recordedAt)}`;
}

async function createCloudflareTaskLifecycleTask(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const title = String(params.title ?? '').trim();
  if (!title) return { ok: false, code: 'task_lifecycle_create_requires_title' };
  const decision = classifyCloudflareTaskLifecycleWriteAdmission({ ...params, mutation_class: 'task_create' }, params.state ?? {});
  const admission = await recordCloudflareTaskLifecycleWriteAdmission(env, siteId, { ...params, mutation_class: 'task_create' }, principal);
  if (!admission.ok) return admission;
  if (decision.action !== 'admit') {
    return {
      ok: false,
      schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CREATE_SCHEMA,
      code: 'task_lifecycle_create_not_admitted',
      site_id: siteId,
      decision,
      admission_record: admission.record,
    };
  }
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const now = new Date().toISOString();
  const taskNumber = await nextCloudflareTaskLifecycleTaskNumber(db, siteId);
  const task = {
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_SCHEMA,
    site_id: siteId,
    task_id: params.task_id ?? `cloudflare-task-lifecycle-${taskNumber}`,
    task_number: taskNumber,
    operation_id: normalizeNullableWorkerString(params.operation_id ?? null),
    carrier_session_id: normalizeNullableWorkerString(params.carrier_session_id ?? null),
    title,
    description: params.description == null ? null : String(params.description),
    status: 'opened',
    source: 'cloudflare_task_lifecycle_create',
    authority_locus: 'cloudflare_carrier_site',
    mutation_authority: 'cloudflare_task_lifecycle_d1',
    cloudflare_write_admission: 'admitted',
    cutover_point_ref: decision.cutover_point_ref,
    governed_write_contract_ref: decision.governed_write_contract_ref,
    confirmation_evidence_ref: decision.confirmation_evidence_ref,
    created_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    created_at: now,
    updated_at: now,
  };
  await db.prepare(`
    INSERT INTO cloudflare_task_lifecycle_tasks (
      site_id,
      task_id,
      task_number,
      title,
      description,
      status,
      source,
      authority_locus,
      mutation_authority,
      cloudflare_write_admission,
      cutover_point_ref,
      governed_write_contract_ref,
      confirmation_evidence_ref,
      task_json,
      created_by_principal_id,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    task.site_id,
    task.task_id,
    task.task_number,
    task.title,
    task.description,
    task.status,
    task.source,
    task.authority_locus,
    task.mutation_authority,
    task.cloudflare_write_admission,
    task.cutover_point_ref,
    task.governed_write_contract_ref,
    task.confirmation_evidence_ref,
    JSON.stringify(task),
    task.created_by_principal_id,
    task.created_at,
    task.updated_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_CREATE_SCHEMA,
    status: 'created',
    site_id: siteId,
    mutation_authority: task.mutation_authority,
    cloudflare_write_admission: task.cloudflare_write_admission,
    write_effect: 'task_lifecycle_create',
    decision,
    admission_record: admission.record,
    task,
  };
}

async function ensureCloudflareTaskLifecycleTaskSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_task_lifecycle_tasks (
      site_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      mutation_authority TEXT NOT NULL,
      cloudflare_write_admission TEXT NOT NULL,
      cutover_point_ref TEXT NOT NULL,
      governed_write_contract_ref TEXT NOT NULL,
      confirmation_evidence_ref TEXT NOT NULL,
      task_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (site_id, task_id)
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_task_lifecycle_tasks_site_number
    ON cloudflare_task_lifecycle_tasks(site_id, task_number)
  `).run();
}

async function nextCloudflareTaskLifecycleTaskNumber(db, siteId) {
  const row = await db.prepare('SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number FROM cloudflare_task_lifecycle_tasks WHERE site_id = ?')
    .bind(siteId)
    .first();
  return Number(row?.next_task_number ?? 1);
}

function normalizeCloudflareTaskLifecycleIncludeTaskIds(params = {}) {
  const raw = params.task_lifecycle_include_task_ids ?? params.task_lifecycle_task_ids ?? params.task_lifecycle_task_id;
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : raw == null ? [] : [raw];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))].slice(0, 25);
}

async function listCloudflareTaskLifecycleTasks(env = {}, siteId, limit, params = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareTaskLifecycleTaskSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const carrierSessionId = normalizeNullableWorkerString(params.carrier_session_id ?? params.session_id ?? null);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_task_lifecycle_tasks
    WHERE site_id = ?
    ORDER BY task_number ASC
    LIMIT ?
  `).bind(siteId, carrierSessionId ? boundedLimit + 1 : boundedLimit).all();
  let tasks = (rows.results ?? []).map(formatCloudflareTaskLifecycleTask);
  const focusedTask = carrierSessionId
    ? tasks.find((task) => task.carrier_session_id === carrierSessionId) ?? null
    : null;
  if (carrierSessionId) {
    tasks = tasks
      .filter((task) => task.carrier_session_id !== carrierSessionId)
      .slice(0, boundedLimit);
    if (focusedTask) tasks.push(focusedTask);
  }
  const seenTaskIds = new Set(tasks.map((task) => task.task_id));
  if (carrierSessionId && !focusedTask) {
    const focusedRows = await db.prepare(`
      SELECT * FROM cloudflare_task_lifecycle_tasks
      WHERE site_id = ?
        AND json_extract(task_json, '$.carrier_session_id') = ?
      ORDER BY task_number DESC
      LIMIT 1
    `).bind(siteId, carrierSessionId).all();
    for (const row of focusedRows.results ?? []) {
      const task = formatCloudflareTaskLifecycleTask(row);
      if (seenTaskIds.has(task.task_id)) continue;
      tasks.push(task);
      seenTaskIds.add(task.task_id);
    }
  }
  for (const taskId of normalizeCloudflareTaskLifecycleIncludeTaskIds(params)) {
    if (seenTaskIds.has(taskId)) continue;
    const task = await getCloudflareTaskLifecycleTask(db, siteId, taskId);
    if (!task) continue;
    tasks.push(task);
    seenTaskIds.add(taskId);
  }
  return tasks;
}

function formatCloudflareTaskLifecycleTask(row) {
  const taskJson = parseJsonObject(row.task_json);
  const roleResolutionRecords = Array.isArray(taskJson.task_lifecycle_role_resolution_records) ? taskJson.task_lifecycle_role_resolution_records : [];
  const roleResolutionWriteCount = roleResolutionRecords.length || Number(taskJson.task_lifecycle_role_resolution_write_count ?? 0);
  const rosterMutationRecords = Array.isArray(taskJson.task_lifecycle_roster_mutation_records) ? taskJson.task_lifecycle_roster_mutation_records : [];
  const rosterMutationWriteCount = rosterMutationRecords.length || Number(taskJson.task_lifecycle_roster_mutation_write_count ?? 0);
  return {
    schema: CLOUDFLARE_TASK_LIFECYCLE_TASK_SCHEMA,
    site_id: row.site_id,
    task_id: row.task_id,
    task_number: Number(row.task_number),
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    source: row.source,
    authority_locus: row.authority_locus,
    mutation_authority: row.mutation_authority,
    cloudflare_write_admission: row.cloudflare_write_admission,
    cutover_point_ref: row.cutover_point_ref,
    governed_write_contract_ref: row.governed_write_contract_ref,
    confirmation_evidence_ref: row.confirmation_evidence_ref,
    operation_id: taskJson.operation_id ?? null,
    carrier_session_id: taskJson.carrier_session_id ?? null,
    created_by_principal_id: row.created_by_principal_id,
    claimed_by_agent_id: taskJson.claimed_by_agent_id ?? null,
    claimed_by_principal_id: taskJson.claimed_by_principal_id ?? null,
    assignment_authority_ref: taskJson.assignment_authority_ref ?? null,
    claim_cutover_point_ref: taskJson.claim_cutover_point_ref ?? null,
    claim_governed_write_contract_ref: taskJson.claim_governed_write_contract_ref ?? null,
    claim_confirmation_evidence_ref: taskJson.claim_confirmation_evidence_ref ?? null,
    claim_conflict_policy: taskJson.claim_conflict_policy ?? null,
    claim_rollback_posture: taskJson.claim_rollback_posture ?? null,
    claimed_at: taskJson.claimed_at ?? null,
    report_id: taskJson.report_id ?? null,
    report_status: taskJson.report_status ?? null,
    reported_by_agent_id: taskJson.reported_by_agent_id ?? null,
    reported_by_principal_id: taskJson.reported_by_principal_id ?? null,
    report_authority_ref: taskJson.report_authority_ref ?? null,
    report_schema_ref: taskJson.report_schema_ref ?? null,
    report_cutover_point_ref: taskJson.report_cutover_point_ref ?? null,
    report_governed_write_contract_ref: taskJson.report_governed_write_contract_ref ?? null,
    report_confirmation_evidence_ref: taskJson.report_confirmation_evidence_ref ?? null,
    changed_file_evidence_boundary_ref: taskJson.changed_file_evidence_boundary_ref ?? null,
    changed_file_evidence_admission: taskJson.changed_file_evidence_admission ?? null,
    changed_file_evidence_records: Array.isArray(taskJson.changed_file_evidence_records) ? taskJson.changed_file_evidence_records : [],
    changed_file_evidence_count: Array.isArray(taskJson.changed_file_evidence_records) ? taskJson.changed_file_evidence_records.length : Number(taskJson.changed_file_evidence_count ?? 0),
    reported_at: taskJson.reported_at ?? null,
    report: taskJson.report ?? null,
    finish_id: taskJson.finish_id ?? null,
    finish_verdict: taskJson.finish_verdict ?? null,
    finished_by_agent_id: taskJson.finished_by_agent_id ?? null,
    finished_by_principal_id: taskJson.finished_by_principal_id ?? null,
    finished_at: taskJson.finished_at ?? null,
    finish_authority_ref: taskJson.finish_authority_ref ?? null,
    finish_schema_ref: taskJson.finish_schema_ref ?? null,
    finish_cutover_point_ref: taskJson.finish_cutover_point_ref ?? null,
    finish_governed_write_contract_ref: taskJson.finish_governed_write_contract_ref ?? null,
    finish_confirmation_evidence_ref: taskJson.finish_confirmation_evidence_ref ?? null,
    finish_conflict_policy: taskJson.finish_conflict_policy ?? null,
    finish_rollback_posture: taskJson.finish_rollback_posture ?? null,
    finish: taskJson.finish ?? null,
    task_lifecycle_projection_write_admission: taskJson.task_lifecycle_projection_write_admission ?? null,
    task_lifecycle_projection_records: Array.isArray(taskJson.task_lifecycle_projection_records) ? taskJson.task_lifecycle_projection_records : [],
    task_lifecycle_projection_write_count: Array.isArray(taskJson.task_lifecycle_projection_records) ? taskJson.task_lifecycle_projection_records.length : Number(taskJson.task_lifecycle_projection_write_count ?? 0),
    task_lifecycle_source_state_write_admission: taskJson.task_lifecycle_source_state_write_admission ?? null,
    task_lifecycle_source_state_write_records: Array.isArray(taskJson.task_lifecycle_source_state_write_records) ? taskJson.task_lifecycle_source_state_write_records : [],
    task_lifecycle_source_state_write_count: Array.isArray(taskJson.task_lifecycle_source_state_write_records) ? taskJson.task_lifecycle_source_state_write_records.length : Number(taskJson.task_lifecycle_source_state_write_count ?? 0),
    canonical_source_state_authority: taskJson.canonical_source_state_authority ?? null,
    windows_sqlite_source_write_admission: taskJson.windows_sqlite_source_write_admission ?? null,
    task_lifecycle_assignment_write_admission: taskJson.task_lifecycle_assignment_write_admission ?? null,
    task_lifecycle_assignment_records: Array.isArray(taskJson.task_lifecycle_assignment_records) ? taskJson.task_lifecycle_assignment_records : [],
    task_lifecycle_assignment_write_count: Array.isArray(taskJson.task_lifecycle_assignment_records) ? taskJson.task_lifecycle_assignment_records.length : Number(taskJson.task_lifecycle_assignment_write_count ?? 0),
    assignment_authority_admission: taskJson.assignment_authority_admission ?? null,
    task_lifecycle_role_resolution_write_admission: taskJson.task_lifecycle_role_resolution_write_admission ?? null,
    task_lifecycle_role_resolution_records: roleResolutionRecords,
    task_lifecycle_role_resolution_write_count: roleResolutionWriteCount,
    role_resolution_authority: roleResolutionWriteCount > 0 ? 'cloudflare_task_lifecycle_d1' : null,
    task_lifecycle_roster_mutation_write_admission: taskJson.task_lifecycle_roster_mutation_write_admission ?? null,
    task_lifecycle_roster_mutation_records: rosterMutationRecords,
    task_lifecycle_roster_mutation_write_count: rosterMutationWriteCount,
    roster_mutation_authority: rosterMutationWriteCount > 0 ? 'cloudflare_task_lifecycle_d1' : null,
    resolved_assignee_principal_id: taskJson.resolved_assignee_principal_id ?? null,
    resolved_assignee_role: taskJson.resolved_assignee_role ?? null,
    roster_read_admission: taskJson.roster_read_admission ?? null,
    roster_mutation_admission: taskJson.roster_mutation_admission ?? null,
    mailbox_mutation_admission: taskJson.mailbox_mutation_admission ?? null,
    filesystem_mutation_admission: taskJson.filesystem_mutation_admission ?? null,
    repository_publication_admission: taskJson.repository_publication_admission ?? null,
    role_resolution_authority_admission: taskJson.role_resolution_authority_admission ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function createTaskLifecycleShadowRead(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.shadow_read ?? params.read ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.task_lifecycle_shadow_read.v1') {
    return { ok: false, code: 'task_lifecycle_shadow_read_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const mutationAuthority = String(source.mutation_authority ?? params.mutation_authority ?? '');
  const cloudflareWriteAdmission = String(source.cloudflare_write_admission ?? params.cloudflare_write_admission ?? '');
  if (mutationAuthority !== 'windows_task_lifecycle_sqlite') return { ok: false, code: 'task_lifecycle_shadow_read_mutation_authority_invalid', mutation_authority: mutationAuthority };
  if (cloudflareWriteAdmission !== 'not_admitted') return { ok: false, code: 'task_lifecycle_shadow_read_cloudflare_write_admission_invalid', cloudflare_write_admission: cloudflareWriteAdmission };
  const tasks = Array.isArray(source.tasks) ? source.tasks.slice(0, clampInteger(source.limit, 0, 100, 25)).map((task) => ({
    task_id: String(task.task_id),
    task_number: Number(task.task_number),
    status: String(task.status),
    governed_by: task.governed_by == null ? null : String(task.governed_by),
    updated_at: task.updated_at == null ? null : String(task.updated_at),
    closed_at: task.closed_at == null ? null : String(task.closed_at),
    active_assignment_count: Number(task.active_assignment_count ?? 0),
    report_count: Number(task.report_count ?? 0),
  })) : [];
  return {
    ok: true,
    read: {
      schema: 'narada.sonar.cloudflare_task_lifecycle_shadow_read_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      authority_locus: String(source.authority_locus ?? params.source_locus ?? 'windows_local_site'),
      shadow_target_locus: String(source.shadow_target_locus ?? params.target_locus ?? 'cloudflare_carrier_site'),
      mutation_authority: mutationAuthority,
      shadow_read_posture: String(source.shadow_read_posture ?? params.shadow_read_posture ?? 'read_only_projection'),
      cloudflare_write_admission: cloudflareWriteAdmission,
      source_db_path: source.source_db_path == null ? null : String(source.source_db_path),
      limit: Number(source.limit ?? tasks.length),
      task_count: Number(source.task_count ?? tasks.length),
      status_counts: source.status_counts && typeof source.status_counts === 'object' ? source.status_counts : {},
      tasks,
      dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
      dispatch_action: 'none',
      shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    },
  };
}

function taskLifecycleShadowReadId(siteId, read) {
  return `task_lifecycle_shadow_read_${safeIdToken(siteId)}_${safeIdToken(read.generated_at)}_${safeIdToken(read.task_count)}`;
}

function mailboxStatusSourceReadId(siteId, accountRef, generatedAt) {
  return `mailbox_status_source_read_${safeIdToken(siteId)}_${safeIdToken(accountRef)}_${safeIdToken(generatedAt)}`;
}

function createMailboxStatusShadowRead(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.mailbox_status ?? params.status ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.mailbox_status_shadow_read.v1') {
    return { ok: false, code: 'mailbox_status_shadow_read_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const mailboxSendAdmission = String(source.mailbox_send_admission ?? params.mailbox_send_admission ?? '');
  const mailboxMutationAdmission = String(source.mailbox_mutation_admission ?? params.mailbox_mutation_admission ?? '');
  if (mailboxSendAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_status_shadow_read_send_admission_invalid', mailbox_send_admission: mailboxSendAdmission };
  if (mailboxMutationAdmission !== 'not_admitted') return { ok: false, code: 'mailbox_status_shadow_read_mutation_admission_invalid', mailbox_mutation_admission: mailboxMutationAdmission };
  const mailboxReadAuthority = String(source.mailbox_read_authority ?? params.mailbox_read_authority ?? 'windows_mailbox_status_source');
  const mailboxWriteAuthority = String(source.mailbox_write_authority ?? params.mailbox_write_authority ?? 'windows_mailbox_mcp');
  if (mailboxReadAuthority !== 'windows_mailbox_status_source') return { ok: false, code: 'mailbox_status_shadow_read_authority_invalid', mailbox_read_authority: mailboxReadAuthority };
  if (mailboxWriteAuthority !== 'windows_mailbox_mcp') return { ok: false, code: 'mailbox_status_shadow_write_authority_invalid', mailbox_write_authority: mailboxWriteAuthority };
  return {
    ok: true,
    read: {
      schema: 'narada.sonar.cloudflare_mailbox_status_shadow_read_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      authority_locus: String(source.authority_locus ?? params.source_locus ?? 'windows_local_site'),
      shadow_target_locus: String(source.shadow_target_locus ?? params.target_locus ?? 'cloudflare_carrier_site'),
      account_ref: String(source.account_ref ?? params.account_ref ?? 'mailbox:default'),
      mailbox_status: String(source.mailbox_status ?? params.mailbox_status ?? 'observed'),
      unread_count: clampInteger(source.unread_count ?? params.unread_count, 0, 1000000, 0),
      pending_draft_count: clampInteger(source.pending_draft_count ?? params.pending_draft_count, 0, 1000000, 0),
      pending_send_count: clampInteger(source.pending_send_count ?? params.pending_send_count, 0, 1000000, 0),
      latest_message_at: source.latest_message_at == null && params.latest_message_at == null ? null : String(source.latest_message_at ?? params.latest_message_at),
      ticket_count: clampInteger(source.ticket_count ?? params.ticket_count, 0, 1000000, 0),
      sync_state: String(source.sync_state ?? params.sync_state ?? 'unknown'),
      mailbox_read_authority: mailboxReadAuthority,
      mailbox_write_authority: mailboxWriteAuthority,
      mailbox_send_admission: mailboxSendAdmission,
      mailbox_mutation_admission: mailboxMutationAdmission,
      shadow_read_posture: String(source.shadow_read_posture ?? params.shadow_read_posture ?? 'read_only_status_projection'),
    },
  };
}

function mailboxStatusShadowReadId(siteId, read) {
  return `mailbox_status_shadow_read_${safeIdToken(siteId)}_${safeIdToken(read.generated_at)}_${safeIdToken(read.account_ref)}`;
}

function createSiteFileChangeProposal(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.proposal ?? {};
  const sourceSchema = String(source.schema ?? params.source_schema ?? '');
  if (sourceSchema !== 'narada.sonar.site_file_change_proposal.v1') {
    return { ok: false, code: 'site_file_change_proposal_source_schema_invalid', source_schema: sourceSchema || null };
  }
  const filesystemMutationAdmission = String(source.filesystem_mutation_admission ?? params.filesystem_mutation_admission ?? '');
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? '');
  const filesystemExecutorAuthority = String(source.filesystem_executor_authority ?? params.filesystem_executor_authority ?? 'windows_filesystem_executor');
  if (filesystemMutationAdmission !== 'not_admitted') return { ok: false, code: 'site_file_change_proposal_filesystem_mutation_admission_invalid', filesystem_mutation_admission: filesystemMutationAdmission };
  if (repositoryPublicationAdmission !== 'not_admitted') return { ok: false, code: 'site_file_change_proposal_repository_publication_admission_invalid', repository_publication_admission: repositoryPublicationAdmission };
  if (filesystemExecutorAuthority !== 'windows_filesystem_executor') return { ok: false, code: 'site_file_change_proposal_executor_authority_invalid', filesystem_executor_authority: filesystemExecutorAuthority };
  const files = Array.isArray(source.files ?? params.files) ? (source.files ?? params.files).slice(0, 100).map((file) => ({
    file_path: String(file.file_path ?? file.path ?? ''),
    change_kind: String(file.change_kind ?? file.kind ?? 'unknown'),
    material_source_ref: file.material_source_ref == null ? null : String(file.material_source_ref),
  })).filter((file) => file.file_path) : [];
  if (files.length === 0) return { ok: false, code: 'site_file_change_proposal_requires_files' };
  return {
    ok: true,
    proposal: {
      schema: 'narada.sonar.cloudflare_site_file_change_proposal_record.v1',
      site_id: siteId,
      source_schema: sourceSchema,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      task_id: source.task_id == null && params.task_id == null ? null : String(source.task_id ?? params.task_id),
      proposal_ref: String(source.proposal_ref ?? params.proposal_ref ?? 'site-file-change-proposal'),
      proposal_summary: String(source.proposal_summary ?? params.proposal_summary ?? 'site file change proposal'),
      authority_locus: String(source.authority_locus ?? params.authority_locus ?? 'cloudflare_carrier_site'),
      filesystem_executor_authority: filesystemExecutorAuthority,
      filesystem_mutation_admission: filesystemMutationAdmission,
      repository_publication_admission: repositoryPublicationAdmission,
      proposal_posture: String(source.proposal_posture ?? params.proposal_posture ?? 'proposal_only_no_filesystem_write'),
      files,
    },
  };
}

function siteFileChangeProposalId(siteId, proposal) {
  return `site_file_change_proposal_${safeIdToken(siteId)}_${safeIdToken(proposal.generated_at)}_${safeIdToken(proposal.proposal_ref)}`;
}

async function recordCloudflareSiteFileChangeProposal(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createSiteFileChangeProposal(siteId, params);
  if (!payload.ok) return payload;
  const proposal = payload.proposal;
  const record = {
    proposal_id: params.proposal_id ?? siteFileChangeProposalId(siteId, proposal),
    site_id: siteId,
    schema: CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SCHEMA,
    source_schema: proposal.source_schema,
    generated_at: proposal.generated_at,
    operation_id: proposal.operation_id,
    task_id: proposal.task_id,
    proposal_ref: proposal.proposal_ref,
    proposal_summary: proposal.proposal_summary,
    authority_locus: proposal.authority_locus,
    filesystem_executor_authority: proposal.filesystem_executor_authority,
    filesystem_mutation_admission: proposal.filesystem_mutation_admission,
    repository_publication_admission: proposal.repository_publication_admission,
    proposal_posture: proposal.proposal_posture,
    file_count: proposal.files.length,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareSiteFileChangeProposalSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_site_file_change_proposals (
      proposal_id,
      site_id,
      source_schema,
      generated_at,
      operation_id,
      task_id,
      proposal_ref,
      proposal_summary,
      authority_locus,
      filesystem_executor_authority,
      filesystem_mutation_admission,
      repository_publication_admission,
      proposal_posture,
      file_count,
      proposal_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(proposal_id) DO UPDATE SET
      source_schema = excluded.source_schema,
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      task_id = excluded.task_id,
      proposal_ref = excluded.proposal_ref,
      proposal_summary = excluded.proposal_summary,
      authority_locus = excluded.authority_locus,
      filesystem_executor_authority = excluded.filesystem_executor_authority,
      filesystem_mutation_admission = excluded.filesystem_mutation_admission,
      repository_publication_admission = excluded.repository_publication_admission,
      proposal_posture = excluded.proposal_posture,
      file_count = excluded.file_count,
      proposal_json = excluded.proposal_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.proposal_id,
    record.site_id,
    record.source_schema,
    record.generated_at,
    record.operation_id,
    record.task_id,
    record.proposal_ref,
    record.proposal_summary,
    record.authority_locus,
    record.filesystem_executor_authority,
    record.filesystem_mutation_admission,
    record.repository_publication_admission,
    record.proposal_posture,
    record.file_count,
    JSON.stringify({ ...record, proposal }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    proposal_authority: record.authority_locus,
    filesystem_executor_authority: record.filesystem_executor_authority,
    filesystem_mutation_admission: record.filesystem_mutation_admission,
    repository_publication_admission: record.repository_publication_admission,
    proposal,
    record,
  };
}

async function ensureCloudflareSiteFileChangeProposalSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_site_file_change_proposals (
      proposal_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_schema TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      proposal_ref TEXT NOT NULL,
      proposal_summary TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      filesystem_executor_authority TEXT NOT NULL,
      filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      proposal_posture TEXT NOT NULL,
      file_count INTEGER NOT NULL,
      proposal_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_site_file_change_proposals_site_recorded
    ON cloudflare_site_file_change_proposals(site_id, recorded_at)
  `).run();
}

async function listCloudflareSiteFileChangeProposals(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareSiteFileChangeProposalSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_site_file_change_proposals
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    proposal_id: row.proposal_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_SITE_FILE_CHANGE_PROPOSAL_SCHEMA,
    source_schema: row.source_schema,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    task_id: row.task_id,
    proposal_ref: row.proposal_ref,
    proposal_summary: row.proposal_summary,
    authority_locus: row.authority_locus,
    filesystem_executor_authority: row.filesystem_executor_authority,
    filesystem_mutation_admission: row.filesystem_mutation_admission,
    repository_publication_admission: row.repository_publication_admission,
    proposal_posture: row.proposal_posture,
    file_count: Number(row.file_count),
    record: parseJsonObject(row.proposal_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createSiteFileMaterialization(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.materialization ?? {};
  const cutoverAdmitted = source.cloudflare_site_file_materialization_cutover ?? params.cloudflare_site_file_materialization_cutover;
  const proposalId = String(source.proposal_id ?? params.proposal_id ?? '');
  const proposalRef = String(source.proposal_ref ?? params.proposal_ref ?? '');
  const filePath = String(source.file_path ?? params.file_path ?? '');
  const contentSha256 = String(source.content_sha256 ?? params.content_sha256 ?? '').toLowerCase();
  const materializationAuthorityRef = String(source.materialization_authority_ref ?? params.materialization_authority_ref ?? '');
  const cutoverPointRef = String(source.cutover_point_ref ?? params.cutover_point_ref ?? '');
  const governedWriteContractRef = String(source.governed_write_contract_ref ?? params.governed_write_contract_ref ?? '');
  const confirmationEvidenceRef = String(source.confirmation_evidence_ref ?? params.confirmation_evidence_ref ?? '');
  const filesystemExecutorAuthority = String(source.filesystem_executor_authority ?? params.filesystem_executor_authority ?? 'cloudflare_site_file_store');
  const windowsFilesystemMutationAdmission = String(source.windows_filesystem_mutation_admission ?? params.windows_filesystem_mutation_admission ?? 'not_admitted');
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? 'not_admitted');
  if (cutoverAdmitted !== true) return { ok: false, code: 'site_file_materialization_cutover_evidence_required' };
  if (!proposalId && !proposalRef) return { ok: false, code: 'site_file_materialization_proposal_ref_required' };
  if (!filePath) return { ok: false, code: 'site_file_materialization_file_path_required' };
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) return { ok: false, code: 'site_file_materialization_content_sha256_invalid' };
  if (!materializationAuthorityRef) return { ok: false, code: 'site_file_materialization_authority_ref_required' };
  if (!cutoverPointRef) return { ok: false, code: 'site_file_materialization_cutover_point_ref_required' };
  if (!governedWriteContractRef) return { ok: false, code: 'site_file_materialization_governed_write_contract_ref_required' };
  if (!confirmationEvidenceRef) return { ok: false, code: 'site_file_materialization_confirmation_evidence_ref_required' };
  if (filesystemExecutorAuthority !== 'cloudflare_site_file_store') return { ok: false, code: 'site_file_materialization_executor_authority_invalid', filesystem_executor_authority: filesystemExecutorAuthority };
  if (windowsFilesystemMutationAdmission !== 'not_admitted') return { ok: false, code: 'site_file_materialization_windows_filesystem_mutation_admission_invalid', windows_filesystem_mutation_admission: windowsFilesystemMutationAdmission };
  if (repositoryPublicationAdmission !== 'not_admitted') return { ok: false, code: 'site_file_materialization_repository_publication_admission_invalid', repository_publication_admission: repositoryPublicationAdmission };
  return {
    ok: true,
    materialization: {
      schema: 'narada.sonar.cloudflare_site_file_materialization_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      task_id: source.task_id == null && params.task_id == null ? null : String(source.task_id ?? params.task_id),
      proposal_id: proposalId || null,
      proposal_ref: proposalRef || null,
      file_path: filePath,
      content_sha256: contentSha256,
      content_ref: source.content_ref == null && params.content_ref == null ? null : String(source.content_ref ?? params.content_ref),
      materialization_authority_ref: materializationAuthorityRef,
      cutover_point_ref: cutoverPointRef,
      governed_write_contract_ref: governedWriteContractRef,
      confirmation_evidence_ref: confirmationEvidenceRef,
      authority_locus: String(source.authority_locus ?? params.authority_locus ?? 'cloudflare_carrier_site'),
      filesystem_executor_authority: filesystemExecutorAuthority,
      windows_filesystem_mutation_admission: windowsFilesystemMutationAdmission,
      repository_publication_admission: repositoryPublicationAdmission,
      write_effect: 'cloudflare_site_file_materialization_record',
      materialization_posture: String(source.materialization_posture ?? params.materialization_posture ?? 'cloudflare_site_file_store_only_no_windows_filesystem_write_no_repository_publication'),
    },
  };
}

function siteFileMaterializationId(siteId, materialization) {
  return `site_file_materialization_${safeIdToken(siteId)}_${safeIdToken(materialization.generated_at)}_${safeIdToken(materialization.file_path)}`;
}

async function recordCloudflareSiteFileMaterialization(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createSiteFileMaterialization(siteId, params);
  if (!payload.ok) return payload;
  const materialization = payload.materialization;
  const record = {
    materialization_id: params.materialization_id ?? siteFileMaterializationId(siteId, materialization),
    site_id: siteId,
    schema: CLOUDFLARE_SITE_FILE_MATERIALIZATION_SCHEMA,
    generated_at: materialization.generated_at,
    operation_id: materialization.operation_id,
    task_id: materialization.task_id,
    proposal_id: materialization.proposal_id,
    proposal_ref: materialization.proposal_ref,
    file_path: materialization.file_path,
    content_sha256: materialization.content_sha256,
    content_ref: materialization.content_ref,
    materialization_authority_ref: materialization.materialization_authority_ref,
    cutover_point_ref: materialization.cutover_point_ref,
    governed_write_contract_ref: materialization.governed_write_contract_ref,
    confirmation_evidence_ref: materialization.confirmation_evidence_ref,
    authority_locus: materialization.authority_locus,
    filesystem_executor_authority: materialization.filesystem_executor_authority,
    windows_filesystem_mutation_admission: materialization.windows_filesystem_mutation_admission,
    repository_publication_admission: materialization.repository_publication_admission,
    write_effect: materialization.write_effect,
    materialization_posture: materialization.materialization_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareSiteFileMaterializationSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_site_file_materializations (
      materialization_id,
      site_id,
      generated_at,
      operation_id,
      task_id,
      proposal_id,
      proposal_ref,
      file_path,
      content_sha256,
      content_ref,
      materialization_authority_ref,
      cutover_point_ref,
      governed_write_contract_ref,
      confirmation_evidence_ref,
      authority_locus,
      filesystem_executor_authority,
      windows_filesystem_mutation_admission,
      repository_publication_admission,
      write_effect,
      materialization_posture,
      materialization_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(materialization_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      task_id = excluded.task_id,
      proposal_id = excluded.proposal_id,
      proposal_ref = excluded.proposal_ref,
      file_path = excluded.file_path,
      content_sha256 = excluded.content_sha256,
      content_ref = excluded.content_ref,
      materialization_authority_ref = excluded.materialization_authority_ref,
      cutover_point_ref = excluded.cutover_point_ref,
      governed_write_contract_ref = excluded.governed_write_contract_ref,
      confirmation_evidence_ref = excluded.confirmation_evidence_ref,
      authority_locus = excluded.authority_locus,
      filesystem_executor_authority = excluded.filesystem_executor_authority,
      windows_filesystem_mutation_admission = excluded.windows_filesystem_mutation_admission,
      repository_publication_admission = excluded.repository_publication_admission,
      write_effect = excluded.write_effect,
      materialization_posture = excluded.materialization_posture,
      materialization_json = excluded.materialization_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.materialization_id,
    record.site_id,
    record.generated_at,
    record.operation_id,
    record.task_id,
    record.proposal_id,
    record.proposal_ref,
    record.file_path,
    record.content_sha256,
    record.content_ref,
    record.materialization_authority_ref,
    record.cutover_point_ref,
    record.governed_write_contract_ref,
    record.confirmation_evidence_ref,
    record.authority_locus,
    record.filesystem_executor_authority,
    record.windows_filesystem_mutation_admission,
    record.repository_publication_admission,
    record.write_effect,
    record.materialization_posture,
    JSON.stringify({ ...record, materialization }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_SITE_FILE_MATERIALIZATION_SCHEMA,
    status: 'admitted',
    site_id: siteId,
    site_file_materialization_authority: record.authority_locus,
    cloudflare_site_file_materialization_admission: 'admitted',
    filesystem_executor_authority: record.filesystem_executor_authority,
    windows_filesystem_mutation_admission: record.windows_filesystem_mutation_admission,
    repository_publication_admission: record.repository_publication_admission,
    write_effect: record.write_effect,
    materialization,
    record,
  };
}

async function ensureCloudflareSiteFileMaterializationSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_site_file_materializations (
      materialization_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      proposal_id TEXT,
      proposal_ref TEXT,
      file_path TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      content_ref TEXT,
      materialization_authority_ref TEXT NOT NULL,
      cutover_point_ref TEXT NOT NULL,
      governed_write_contract_ref TEXT NOT NULL,
      confirmation_evidence_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      filesystem_executor_authority TEXT NOT NULL,
      windows_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      write_effect TEXT NOT NULL,
      materialization_posture TEXT NOT NULL,
      materialization_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_site_file_materializations_site_recorded
    ON cloudflare_site_file_materializations(site_id, recorded_at)
  `).run();
}

async function listCloudflareSiteFileMaterializations(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareSiteFileMaterializationSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_site_file_materializations
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    materialization_id: row.materialization_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_SITE_FILE_MATERIALIZATION_SCHEMA,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    task_id: row.task_id,
    proposal_id: row.proposal_id,
    proposal_ref: row.proposal_ref,
    file_path: row.file_path,
    content_sha256: row.content_sha256,
    content_ref: row.content_ref,
    materialization_authority_ref: row.materialization_authority_ref,
    cutover_point_ref: row.cutover_point_ref,
    governed_write_contract_ref: row.governed_write_contract_ref,
    confirmation_evidence_ref: row.confirmation_evidence_ref,
    authority_locus: row.authority_locus,
    filesystem_executor_authority: row.filesystem_executor_authority,
    windows_filesystem_mutation_admission: row.windows_filesystem_mutation_admission,
    repository_publication_admission: row.repository_publication_admission,
    write_effect: row.write_effect,
    materialization_posture: row.materialization_posture,
    record: parseJsonObject(row.materialization_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createLocalIngressRequest(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.request ?? {};
  const requestedMutationClass = String(source.requested_mutation_class ?? params.requested_mutation_class ?? 'local_repository_filesystem_mutation');
  const requestedActionRef = String(source.requested_action_ref ?? params.requested_action_ref ?? '');
  const requestedActionSummary = String(source.requested_action_summary ?? params.requested_action_summary ?? '');
  const governedRequestContractRef = String(source.governed_request_contract_ref ?? params.governed_request_contract_ref ?? '');
  const evidenceReturnContractRef = String(source.evidence_return_contract_ref ?? params.evidence_return_contract_ref ?? '');
  const rollbackPlanRef = String(source.rollback_plan_ref ?? params.rollback_plan_ref ?? '');
  const targetAuthorityLocus = String(source.target_authority_locus ?? params.target_authority_locus ?? 'local-windows-site-authority');
  const localExecutorAuthority = String(source.local_executor_authority ?? params.local_executor_authority ?? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY);
  const localExecutionAdmission = String(source.local_execution_admission ?? params.local_execution_admission ?? 'pending_windows_admission');
  const directCloudflareFilesystemMutationAdmission = String(source.direct_cloudflare_filesystem_mutation_admission ?? params.direct_cloudflare_filesystem_mutation_admission ?? 'not_admitted');
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? 'not_admitted');
  if (requestedMutationClass !== 'local_repository_filesystem_mutation') return { ok: false, code: 'local_ingress_request_mutation_class_invalid', requested_mutation_class: requestedMutationClass };
  if (!requestedActionRef) return { ok: false, code: 'local_ingress_request_action_ref_required' };
  if (!governedRequestContractRef) return { ok: false, code: 'local_ingress_request_contract_ref_required' };
  if (!evidenceReturnContractRef) return { ok: false, code: 'local_ingress_evidence_return_contract_ref_required' };
  if (!rollbackPlanRef) return { ok: false, code: 'local_ingress_rollback_plan_ref_required' };
  if (targetAuthorityLocus !== 'local-windows-site-authority') return { ok: false, code: 'local_ingress_target_authority_locus_invalid', target_authority_locus: targetAuthorityLocus };
  if (localExecutorAuthority !== WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY) return { ok: false, code: 'local_ingress_executor_authority_invalid', local_executor_authority: localExecutorAuthority };
  if (localExecutionAdmission !== 'pending_windows_admission') return { ok: false, code: 'local_ingress_execution_admission_invalid', local_execution_admission: localExecutionAdmission };
  if (directCloudflareFilesystemMutationAdmission !== 'not_admitted') return { ok: false, code: 'local_ingress_direct_cloudflare_filesystem_mutation_admission_invalid', direct_cloudflare_filesystem_mutation_admission: directCloudflareFilesystemMutationAdmission };
  if (repositoryPublicationAdmission !== 'not_admitted') return { ok: false, code: 'local_ingress_repository_publication_admission_invalid', repository_publication_admission: repositoryPublicationAdmission };
  return {
    ok: true,
    request: {
      schema: 'narada.sonar.cloudflare_local_ingress_request_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      task_id: source.task_id == null && params.task_id == null ? null : String(source.task_id ?? params.task_id),
      requested_mutation_class: requestedMutationClass,
      requested_action_ref: requestedActionRef,
      requested_action_summary: requestedActionSummary || requestedActionRef,
      governed_request_contract_ref: governedRequestContractRef,
      evidence_return_contract_ref: evidenceReturnContractRef,
      rollback_plan_ref: rollbackPlanRef,
      authority_locus: CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY,
      target_authority_locus: targetAuthorityLocus,
      local_executor_authority: localExecutorAuthority,
      local_execution_admission: localExecutionAdmission,
      direct_cloudflare_filesystem_mutation_admission: directCloudflareFilesystemMutationAdmission,
      repository_publication_admission: repositoryPublicationAdmission,
      request_posture: 'cloudflare_queued_request_windows_must_admit_execute_and_return_evidence',
    },
  };
}

function localIngressRequestId(siteId, request) {
  return `local_ingress_request_${safeIdToken(siteId)}_${safeIdToken(request.generated_at)}_${safeIdToken(request.requested_action_ref)}`;
}

async function createCloudflareLocalIngressRequest(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createLocalIngressRequest(siteId, params);
  if (!payload.ok) return payload;
  const request = payload.request;
  const record = {
    local_ingress_request_id: params.local_ingress_request_id ?? localIngressRequestId(siteId, request),
    site_id: siteId,
    generated_at: request.generated_at,
    operation_id: request.operation_id,
    task_id: request.task_id,
    requested_mutation_class: request.requested_mutation_class,
    requested_action_ref: request.requested_action_ref,
    requested_action_summary: request.requested_action_summary,
    governed_request_contract_ref: request.governed_request_contract_ref,
    evidence_return_contract_ref: request.evidence_return_contract_ref,
    rollback_plan_ref: request.rollback_plan_ref,
    authority_locus: request.authority_locus,
    target_authority_locus: request.target_authority_locus,
    local_executor_authority: request.local_executor_authority,
    local_execution_admission: request.local_execution_admission,
    direct_cloudflare_filesystem_mutation_admission: request.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: request.repository_publication_admission,
    request_posture: request.request_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareLocalIngressRequestSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_local_ingress_requests (
      local_ingress_request_id,
      site_id,
      generated_at,
      operation_id,
      task_id,
      requested_mutation_class,
      requested_action_ref,
      requested_action_summary,
      governed_request_contract_ref,
      evidence_return_contract_ref,
      rollback_plan_ref,
      authority_locus,
      target_authority_locus,
      local_executor_authority,
      local_execution_admission,
      direct_cloudflare_filesystem_mutation_admission,
      repository_publication_admission,
      request_posture,
      request_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_ingress_request_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      task_id = excluded.task_id,
      requested_mutation_class = excluded.requested_mutation_class,
      requested_action_ref = excluded.requested_action_ref,
      requested_action_summary = excluded.requested_action_summary,
      governed_request_contract_ref = excluded.governed_request_contract_ref,
      evidence_return_contract_ref = excluded.evidence_return_contract_ref,
      rollback_plan_ref = excluded.rollback_plan_ref,
      authority_locus = excluded.authority_locus,
      target_authority_locus = excluded.target_authority_locus,
      local_executor_authority = excluded.local_executor_authority,
      local_execution_admission = excluded.local_execution_admission,
      direct_cloudflare_filesystem_mutation_admission = excluded.direct_cloudflare_filesystem_mutation_admission,
      repository_publication_admission = excluded.repository_publication_admission,
      request_posture = excluded.request_posture,
      request_json = excluded.request_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.local_ingress_request_id,
    record.site_id,
    record.generated_at,
    record.operation_id,
    record.task_id,
    record.requested_mutation_class,
    record.requested_action_ref,
    record.requested_action_summary,
    record.governed_request_contract_ref,
    record.evidence_return_contract_ref,
    record.rollback_plan_ref,
    record.authority_locus,
    record.target_authority_locus,
    record.local_executor_authority,
    record.local_execution_admission,
    record.direct_cloudflare_filesystem_mutation_admission,
    record.repository_publication_admission,
    record.request_posture,
    JSON.stringify({ ...record, request }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_LOCAL_INGRESS_REQUEST_SCHEMA,
    status: 'queued',
    site_id: siteId,
    local_ingress_request_authority: record.authority_locus,
    target_authority_locus: record.target_authority_locus,
    local_executor_authority: record.local_executor_authority,
    local_execution_admission: record.local_execution_admission,
    direct_cloudflare_filesystem_mutation_admission: record.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: record.repository_publication_admission,
    authority_partition: 'cloudflare_queues_governed_local_ingress_request_windows_admits_executes_and_returns_evidence',
    request,
    record,
  };
}

async function ensureCloudflareLocalIngressRequestSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_requests (
      local_ingress_request_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      requested_mutation_class TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      requested_action_summary TEXT NOT NULL,
      governed_request_contract_ref TEXT NOT NULL,
      evidence_return_contract_ref TEXT NOT NULL,
      rollback_plan_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      target_authority_locus TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_execution_admission TEXT NOT NULL,
      direct_cloudflare_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      request_posture TEXT NOT NULL,
      request_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_local_ingress_requests_site_recorded
    ON cloudflare_local_ingress_requests(site_id, recorded_at)
  `).run();
}

async function listCloudflareLocalIngressRequests(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareLocalIngressRequestSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_local_ingress_requests
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    local_ingress_request_id: row.local_ingress_request_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_LOCAL_INGRESS_REQUEST_SCHEMA,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    task_id: row.task_id,
    requested_mutation_class: row.requested_mutation_class,
    requested_action_ref: row.requested_action_ref,
    requested_action_summary: row.requested_action_summary,
    governed_request_contract_ref: row.governed_request_contract_ref,
    evidence_return_contract_ref: row.evidence_return_contract_ref,
    rollback_plan_ref: row.rollback_plan_ref,
    authority_locus: row.authority_locus,
    target_authority_locus: row.target_authority_locus,
    local_executor_authority: row.local_executor_authority,
    local_execution_admission: row.local_execution_admission,
    direct_cloudflare_filesystem_mutation_admission: row.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: row.repository_publication_admission,
    request_posture: row.request_posture,
    record: parseJsonObject(row.request_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createRepositoryPublicationRequest(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.request ?? {};
  const publicationRef = String(source.publication_ref ?? params.publication_ref ?? '');
  const requestedActionRef = String(source.requested_action_ref ?? params.requested_action_ref ?? publicationRef);
  const requestedActionSummary = String(source.requested_action_summary ?? params.requested_action_summary ?? 'repository publication request');
  const repositoryRef = String(source.repository_ref ?? params.repository_ref ?? '');
  const branchRef = String(source.branch_ref ?? params.branch_ref ?? '');
  const sourceChangeRef = String(source.source_change_ref ?? params.source_change_ref ?? '');
  const governedRequestContractRef = String(source.governed_request_contract_ref ?? params.governed_request_contract_ref ?? '');
  const evidenceReturnContractRef = String(source.evidence_return_contract_ref ?? params.evidence_return_contract_ref ?? '');
  const rollbackPlanRef = String(source.rollback_plan_ref ?? params.rollback_plan_ref ?? '');
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? 'pending_windows_publication_admission');
  const cloudflareGitPushAdmission = String(source.cloudflare_git_push_admission ?? params.cloudflare_git_push_admission ?? 'not_admitted');
  const directCloudflareRepositoryMutationAdmission = String(source.direct_cloudflare_repository_mutation_admission ?? params.direct_cloudflare_repository_mutation_admission ?? 'not_admitted');
  if (!publicationRef) return { ok: false, code: 'repository_publication_request_publication_ref_required' };
  if (!requestedActionRef) return { ok: false, code: 'repository_publication_request_action_ref_required' };
  if (!repositoryRef) return { ok: false, code: 'repository_publication_request_repository_ref_required' };
  if (!branchRef) return { ok: false, code: 'repository_publication_request_branch_ref_required' };
  if (!sourceChangeRef) return { ok: false, code: 'repository_publication_request_source_change_ref_required' };
  if (!governedRequestContractRef) return { ok: false, code: 'repository_publication_request_contract_ref_required' };
  if (!evidenceReturnContractRef) return { ok: false, code: 'repository_publication_evidence_return_contract_ref_required' };
  if (!rollbackPlanRef) return { ok: false, code: 'repository_publication_rollback_plan_ref_required' };
  if (repositoryPublicationAdmission !== 'pending_windows_publication_admission') return { ok: false, code: 'repository_publication_admission_invalid', repository_publication_admission: repositoryPublicationAdmission };
  if (cloudflareGitPushAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_cloudflare_git_push_admission_invalid', cloudflare_git_push_admission: cloudflareGitPushAdmission };
  if (directCloudflareRepositoryMutationAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_direct_cloudflare_repository_mutation_admission_invalid', direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission };
  return {
    ok: true,
    request: {
      schema: 'narada.sonar.cloudflare_repository_publication_request_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      operation_id: source.operation_id == null && params.operation_id == null ? null : String(source.operation_id ?? params.operation_id),
      task_id: source.task_id == null && params.task_id == null ? null : String(source.task_id ?? params.task_id),
      publication_ref: publicationRef,
      requested_action_ref: requestedActionRef,
      requested_action_summary: requestedActionSummary,
      repository_ref: repositoryRef,
      branch_ref: branchRef,
      source_change_ref: sourceChangeRef,
      governed_request_contract_ref: governedRequestContractRef,
      evidence_return_contract_ref: evidenceReturnContractRef,
      rollback_plan_ref: rollbackPlanRef,
      authority_locus: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY,
      repository_publication_executor_authority: WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
      repository_publication_admission: repositoryPublicationAdmission,
      cloudflare_git_push_admission: cloudflareGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission,
      request_posture: 'cloudflare_queued_repository_publication_request_windows_must_admit_publish_and_return_evidence',
    },
  };
}

function repositoryPublicationRequestId(siteId, request) {
  return `repository_publication_request_${safeIdToken(siteId)}_${safeIdToken(request.generated_at)}_${safeIdToken(request.publication_ref)}`;
}

async function createCloudflareRepositoryPublicationRequest(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createRepositoryPublicationRequest(siteId, params);
  if (!payload.ok) return payload;
  const request = payload.request;
  const record = {
    repository_publication_request_id: params.repository_publication_request_id ?? repositoryPublicationRequestId(siteId, request),
    site_id: siteId,
    generated_at: request.generated_at,
    operation_id: request.operation_id,
    task_id: request.task_id,
    publication_ref: request.publication_ref,
    requested_action_ref: request.requested_action_ref,
    requested_action_summary: request.requested_action_summary,
    repository_ref: request.repository_ref,
    branch_ref: request.branch_ref,
    source_change_ref: request.source_change_ref,
    governed_request_contract_ref: request.governed_request_contract_ref,
    evidence_return_contract_ref: request.evidence_return_contract_ref,
    rollback_plan_ref: request.rollback_plan_ref,
    authority_locus: request.authority_locus,
    repository_publication_executor_authority: request.repository_publication_executor_authority,
    repository_publication_admission: request.repository_publication_admission,
    cloudflare_git_push_admission: request.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: request.direct_cloudflare_repository_mutation_admission,
    request_posture: request.request_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareRepositoryPublicationRequestSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_repository_publication_requests (
      repository_publication_request_id,
      site_id,
      generated_at,
      operation_id,
      task_id,
      publication_ref,
      requested_action_ref,
      requested_action_summary,
      repository_ref,
      branch_ref,
      source_change_ref,
      governed_request_contract_ref,
      evidence_return_contract_ref,
      rollback_plan_ref,
      authority_locus,
      repository_publication_executor_authority,
      repository_publication_admission,
      cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission,
      request_posture,
      request_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_publication_request_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      operation_id = excluded.operation_id,
      task_id = excluded.task_id,
      publication_ref = excluded.publication_ref,
      requested_action_ref = excluded.requested_action_ref,
      requested_action_summary = excluded.requested_action_summary,
      repository_ref = excluded.repository_ref,
      branch_ref = excluded.branch_ref,
      source_change_ref = excluded.source_change_ref,
      governed_request_contract_ref = excluded.governed_request_contract_ref,
      evidence_return_contract_ref = excluded.evidence_return_contract_ref,
      rollback_plan_ref = excluded.rollback_plan_ref,
      authority_locus = excluded.authority_locus,
      repository_publication_executor_authority = excluded.repository_publication_executor_authority,
      repository_publication_admission = excluded.repository_publication_admission,
      cloudflare_git_push_admission = excluded.cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission = excluded.direct_cloudflare_repository_mutation_admission,
      request_posture = excluded.request_posture,
      request_json = excluded.request_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.repository_publication_request_id,
    record.site_id,
    record.generated_at,
    record.operation_id,
    record.task_id,
    record.publication_ref,
    record.requested_action_ref,
    record.requested_action_summary,
    record.repository_ref,
    record.branch_ref,
    record.source_change_ref,
    record.governed_request_contract_ref,
    record.evidence_return_contract_ref,
    record.rollback_plan_ref,
    record.authority_locus,
    record.repository_publication_executor_authority,
    record.repository_publication_admission,
    record.cloudflare_git_push_admission,
    record.direct_cloudflare_repository_mutation_admission,
    record.request_posture,
    JSON.stringify({ ...record, request }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_SCHEMA,
    status: 'queued',
    site_id: siteId,
    repository_publication_request_authority: record.authority_locus,
    repository_publication_executor_authority: record.repository_publication_executor_authority,
    repository_publication_admission: record.repository_publication_admission,
    cloudflare_git_push_admission: record.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: record.direct_cloudflare_repository_mutation_admission,
    authority_partition: 'cloudflare_queues_governed_repository_publication_request_windows_admits_publishes_and_returns_evidence',
    request,
    record,
  };
}

async function ensureCloudflareRepositoryPublicationRequestSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_requests (
      repository_publication_request_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      operation_id TEXT,
      task_id TEXT,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      requested_action_summary TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      governed_request_contract_ref TEXT NOT NULL,
      evidence_return_contract_ref TEXT NOT NULL,
      rollback_plan_ref TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      request_posture TEXT NOT NULL,
      request_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_requests_site_recorded
    ON cloudflare_repository_publication_requests(site_id, recorded_at)
  `).run();
}

async function listCloudflareRepositoryPublicationRequests(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareRepositoryPublicationRequestSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_repository_publication_requests
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    repository_publication_request_id: row.repository_publication_request_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_SCHEMA,
    generated_at: row.generated_at,
    operation_id: row.operation_id,
    task_id: row.task_id,
    publication_ref: row.publication_ref,
    requested_action_ref: row.requested_action_ref,
    requested_action_summary: row.requested_action_summary,
    repository_ref: row.repository_ref,
    branch_ref: row.branch_ref,
    source_change_ref: row.source_change_ref,
    governed_request_contract_ref: row.governed_request_contract_ref,
    evidence_return_contract_ref: row.evidence_return_contract_ref,
    rollback_plan_ref: row.rollback_plan_ref,
    authority_locus: row.authority_locus,
    repository_publication_executor_authority: row.repository_publication_executor_authority,
    repository_publication_admission: row.repository_publication_admission,
    cloudflare_git_push_admission: row.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: row.direct_cloudflare_repository_mutation_admission,
    request_posture: row.request_posture,
    record: parseJsonObject(row.request_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createRepositoryPublicationAdmission(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.admission ?? params.decision ?? {};
  const repositoryPublicationRequestId = String(source.repository_publication_request_id ?? params.repository_publication_request_id ?? '');
  const admissionAction = String(source.admission_action ?? params.admission_action ?? 'admit');
  const admissionReason = String(source.admission_reason ?? params.admission_reason ?? (admissionAction === 'admit' ? 'cloudflare_repository_publication_request_admitted' : 'cloudflare_repository_publication_request_refused'));
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? (admissionAction === 'admit' ? 'admitted_by_cloudflare_repository_publication' : 'refused_by_cloudflare_repository_publication'));
  const cloudflareGitPushAdmission = String(source.cloudflare_git_push_admission ?? params.cloudflare_git_push_admission ?? 'not_admitted');
  const directCloudflareRepositoryMutationAdmission = String(source.direct_cloudflare_repository_mutation_admission ?? params.direct_cloudflare_repository_mutation_admission ?? 'not_admitted');
  if (!repositoryPublicationRequestId) return { ok: false, code: 'repository_publication_admission_request_id_required' };
  if (!['admit', 'refuse'].includes(admissionAction)) return { ok: false, code: 'repository_publication_admission_action_invalid', admission_action: admissionAction };
  if (repositoryPublicationAdmission !== (admissionAction === 'admit' ? 'admitted_by_cloudflare_repository_publication' : 'refused_by_cloudflare_repository_publication')) {
    return { ok: false, code: 'repository_publication_admission_state_invalid', repository_publication_admission: repositoryPublicationAdmission };
  }
  if (cloudflareGitPushAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_admission_cloudflare_git_push_admission_invalid', cloudflare_git_push_admission: cloudflareGitPushAdmission };
  if (directCloudflareRepositoryMutationAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_admission_direct_cloudflare_repository_mutation_admission_invalid', direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission };
  return {
    ok: true,
    admission: {
      schema: 'narada.sonar.cloudflare_repository_publication_admission_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      repository_publication_request_id: repositoryPublicationRequestId,
      admission_action: admissionAction,
      admission_reason: admissionReason,
      authority_locus: CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY,
      repository_publication_admission: repositoryPublicationAdmission,
      repository_publication_executor_authority: WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
      cloudflare_git_push_admission: cloudflareGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission,
      admission_posture: 'cloudflare_admits_repository_publication_request_windows_executes_after_admission',
    },
  };
}

function repositoryPublicationAdmissionId(siteId, admission) {
  return `repository_publication_admission_${safeIdToken(siteId)}_${safeIdToken(admission.repository_publication_request_id)}_${safeIdToken(admission.generated_at)}`;
}

async function recordCloudflareRepositoryPublicationAdmission(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createRepositoryPublicationAdmission(siteId, params);
  if (!payload.ok) return payload;
  const admission = payload.admission;
  const requests = await listCloudflareRepositoryPublicationRequests(env, siteId, 100);
  const request = requests.find((entry) => entry.repository_publication_request_id === admission.repository_publication_request_id);
  if (!request) return { ok: false, code: 'repository_publication_admission_request_not_found', repository_publication_request_id: admission.repository_publication_request_id };
  const record = {
    repository_publication_admission_id: params.repository_publication_admission_id ?? repositoryPublicationAdmissionId(siteId, admission),
    ...admission,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareRepositoryPublicationAdmissionSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_repository_publication_admissions (
      repository_publication_admission_id,
      site_id,
      generated_at,
      repository_publication_request_id,
      admission_action,
      admission_reason,
      authority_locus,
      repository_publication_admission,
      repository_publication_executor_authority,
      cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission,
      admission_posture,
      admission_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_publication_admission_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      repository_publication_request_id = excluded.repository_publication_request_id,
      admission_action = excluded.admission_action,
      admission_reason = excluded.admission_reason,
      authority_locus = excluded.authority_locus,
      repository_publication_admission = excluded.repository_publication_admission,
      repository_publication_executor_authority = excluded.repository_publication_executor_authority,
      cloudflare_git_push_admission = excluded.cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission = excluded.direct_cloudflare_repository_mutation_admission,
      admission_posture = excluded.admission_posture,
      admission_json = excluded.admission_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.repository_publication_admission_id,
    record.site_id,
    record.generated_at,
    record.repository_publication_request_id,
    record.admission_action,
    record.admission_reason,
    record.authority_locus,
    record.repository_publication_admission,
    record.repository_publication_executor_authority,
    record.cloudflare_git_push_admission,
    record.direct_cloudflare_repository_mutation_admission,
    record.admission_posture,
    JSON.stringify({ ...record, admission, request }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_SCHEMA,
    status: 'admission_recorded',
    site_id: siteId,
    repository_publication_admission_authority: record.authority_locus,
    repository_publication_executor_authority: record.repository_publication_executor_authority,
    repository_publication_admission: record.repository_publication_admission,
    cloudflare_git_push_admission: record.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: record.direct_cloudflare_repository_mutation_admission,
    authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_returns_evidence',
    admission,
    request,
    record,
  };
}

async function ensureCloudflareRepositoryPublicationAdmissionSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_admissions (
      repository_publication_admission_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      admission_action TEXT NOT NULL,
      admission_reason TEXT NOT NULL,
      authority_locus TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      admission_posture TEXT NOT NULL,
      admission_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_admissions_site_recorded
    ON cloudflare_repository_publication_admissions(site_id, recorded_at)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_admissions_request_recorded
    ON cloudflare_repository_publication_admissions(site_id, repository_publication_request_id, recorded_at)
  `).run();
}

async function listCloudflareRepositoryPublicationAdmissions(env = {}, siteId, limit, repositoryPublicationRequestId = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareRepositoryPublicationAdmissionSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const statement = repositoryPublicationRequestId
    ? db.prepare(`
      SELECT * FROM cloudflare_repository_publication_admissions
      WHERE site_id = ? AND repository_publication_request_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, repositoryPublicationRequestId, boundedLimit)
    : db.prepare(`
      SELECT * FROM cloudflare_repository_publication_admissions
      WHERE site_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, boundedLimit);
  const rows = await statement.all();
  return (rows.results ?? []).map((row) => ({
    repository_publication_admission_id: row.repository_publication_admission_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_SCHEMA,
    generated_at: row.generated_at,
    repository_publication_request_id: row.repository_publication_request_id,
    admission_action: row.admission_action,
    admission_reason: row.admission_reason,
    authority_locus: row.authority_locus,
    repository_publication_admission: row.repository_publication_admission,
    repository_publication_executor_authority: row.repository_publication_executor_authority,
    cloudflare_git_push_admission: row.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: row.direct_cloudflare_repository_mutation_admission,
    admission_posture: row.admission_posture,
    record: parseJsonObject(row.admission_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function latestRepositoryPublicationAdmissionForRequest(admissions = [], requestId) {
  return admissions
    .filter((entry) => entry.repository_publication_request_id === requestId)
    .sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)) || String(right.generated_at).localeCompare(String(left.generated_at)))[0] ?? null;
}

async function listCloudflarePendingRepositoryPublicationRequests(env = {}, siteId, limit) {
  const requests = await listCloudflareRepositoryPublicationRequests(env, siteId, limit);
  if (requests.length === 0) return [];
  const pending = [];
  for (const request of requests) {
    const executions = await listCloudflareRepositoryPublicationExecutions(env, siteId, 1, request.repository_publication_request_id);
    const evidence = await listCloudflareRepositoryPublicationEvidence(env, siteId, 1, request.repository_publication_request_id);
    if (executions.length === 0 && evidence.length === 0) pending.push(request);
  }
  return pending;
}

async function nextCloudflareRepositoryPublicationRequest(env = {}, siteId, limit) {
  const pending = await listCloudflarePendingRepositoryPublicationRequests(env, siteId, limit);
  if (pending.length === 0) return { request: null, admission: null, pending_unadmitted_count: 0 };
  const admissions = await listCloudflareRepositoryPublicationAdmissions(env, siteId, 100);
  let pendingUnadmittedCount = 0;
  for (const request of pending) {
    const admission = latestRepositoryPublicationAdmissionForRequest(admissions, request.repository_publication_request_id);
    if (admission?.admission_action === 'admit') return { request, admission, pending_unadmitted_count: pendingUnadmittedCount };
    pendingUnadmittedCount += 1;
  }
  return { request: null, admission: null, pending_unadmitted_count: pendingUnadmittedCount };
}

function parseGithubRepositoryRef(repositoryRef) {
  const match = String(repositoryRef ?? '').trim().match(/^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], repository_ref: `github:${match[1]}/${match[2]}` };
}

function parseGitCommitRef(sourceChangeRef) {
  const match = String(sourceChangeRef ?? '').trim().match(/^git:commit:([0-9a-f]{40})$/i);
  return match ? match[1].toLowerCase() : null;
}

function cloudflarePublicationAllowedValues(value) {
  return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function isCloudflarePublicationValueAllowed(value, allowedValues) {
  return allowedValues.includes(value);
}

function githubBranchRefPath(branchRef) {
  return normalizeRepositoryBranchRef(branchRef).split('/').map((part) => encodeURIComponent(part)).join('/');
}

function normalizeRepositoryBranchRef(branchRef) {
  return String(branchRef ?? '').trim().replace(/^refs\/heads\//, '');
}

function readCloudflareGithubRepositoryPublicationReadiness(env = {}, siteId, params = {}) {
  const credential = readCloudflareGithubRepositoryPublicationCredentialConfig(env);
  const allowedRepositories = cloudflarePublicationAllowedValues(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_REPOSITORIES);
  const allowedBranches = cloudflarePublicationAllowedValues(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_BRANCHES);
  const requestedRepositoryRef = String(params.repository_ref ?? params.repository ?? '').trim();
  const requestedBranchRef = normalizeRepositoryBranchRef(params.branch_ref ?? params.branch ?? '');
  const requestedRepositoryAllowed = requestedRepositoryRef ? isCloudflarePublicationValueAllowed(requestedRepositoryRef, allowedRepositories) : null;
  const requestedBranchAllowed = requestedBranchRef ? isCloudflarePublicationValueAllowed(requestedBranchRef, allowedBranches) : null;
  const missingConfiguration = [];
  if (!credential.configured) missingConfiguration.push(...credential.missingConfiguration);
  if (allowedRepositories.length === 0) missingConfiguration.push('CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_REPOSITORIES');
  if (allowedBranches.length === 0) missingConfiguration.push('CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_BRANCHES');
  if (requestedRepositoryAllowed === false) missingConfiguration.push('requested_repository_not_allowed');
  if (requestedBranchAllowed === false) missingConfiguration.push('requested_branch_not_allowed');
  const ready = missingConfiguration.length === 0;
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_READINESS_SCHEMA,
    status: 'ok',
    site_id: siteId,
    readiness_status: ready ? 'ready' : 'not_ready',
    repository_publication_executor_authority: CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    repository_publication_admission_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_ADMISSION_AUTHORITY,
    github_credential_mode: credential.mode,
    github_token_configured: credential.tokenConfigured,
    github_token_secret_ref: 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN',
    github_app_configured: credential.appConfigured,
    github_app_id_configured: credential.appIdConfigured,
    github_app_installation_id_configured: credential.appInstallationIdConfigured,
    github_app_private_key_configured: credential.appPrivateKeyConfigured,
    github_app_secret_refs: credential.appSecretRefs,
    allowed_repository_count: allowedRepositories.length,
    allowed_branch_count: allowedBranches.length,
    allowed_repositories: allowedRepositories,
    allowed_branches: allowedBranches,
    requested_repository_ref: requestedRepositoryRef,
    requested_branch_ref: requestedBranchRef,
    requested_repository_allowed: requestedRepositoryAllowed,
    requested_branch_allowed: requestedBranchAllowed,
    missing_configuration: missingConfiguration,
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: ready ? 'admitted_by_cloudflare_github_repository_publication_ready' : 'not_admitted',
    authority_partition: ready ? 'cloudflare_repository_publication_executor_configured' : 'cloudflare_repository_publication_executor_not_ready',
  };
}

function readCloudflareGithubRepositoryPublicationCredentialConfig(env = {}) {
  const tokenConfigured = Boolean(String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN ?? '').trim());
  const appIdConfigured = Boolean(String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID ?? '').trim());
  const appInstallationIdConfigured = Boolean(String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID ?? '').trim());
  const appPrivateKeyConfigured = Boolean(String(env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY ?? '').trim());
  const appConfigured = appIdConfigured && appInstallationIdConfigured && appPrivateKeyConfigured;
  const appSecretRefs = [
    'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID',
    'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID',
    'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY',
  ];
  const missingAppConfiguration = [
    appIdConfigured ? null : 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_ID',
    appInstallationIdConfigured ? null : 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_INSTALLATION_ID',
    appPrivateKeyConfigured ? null : 'CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY',
  ].filter(Boolean);
  return {
    configured: tokenConfigured || appConfigured,
    mode: tokenConfigured ? 'github_token' : appConfigured ? 'github_app_installation' : 'missing',
    tokenConfigured,
    appConfigured,
    appIdConfigured,
    appInstallationIdConfigured,
    appPrivateKeyConfigured,
    appSecretRefs,
    missingConfiguration: tokenConfigured ? [] : (appConfigured ? [] : ['CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN', ...missingAppConfiguration]),
  };
}

async function executeCloudflareGithubRepositoryPublication(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const repositoryPublicationRequestId = String(params.repository_publication_request_id ?? params.request_id ?? '');
  if (!repositoryPublicationRequestId) return { ok: false, code: 'cloudflare_repository_publication_execution_request_id_required' };
  const requests = await listCloudflareRepositoryPublicationRequests(env, siteId, 100);
  const request = requests.find((entry) => entry.repository_publication_request_id === repositoryPublicationRequestId);
  if (!request) return { ok: false, code: 'cloudflare_repository_publication_execution_request_not_found', repository_publication_request_id: repositoryPublicationRequestId };
  const admissions = await listCloudflareRepositoryPublicationAdmissions(env, siteId, 100, repositoryPublicationRequestId);
  const admission = latestRepositoryPublicationAdmissionForRequest(admissions, repositoryPublicationRequestId);
  if (!admission) return { ok: false, code: 'cloudflare_repository_publication_execution_admission_required', repository_publication_request_id: repositoryPublicationRequestId };
  if (admission.admission_action !== 'admit') return { ok: false, code: 'cloudflare_repository_publication_execution_admission_refused', repository_publication_request_id: repositoryPublicationRequestId, repository_publication_admission: admission.repository_publication_admission };
  const repository = parseGithubRepositoryRef(request.repository_ref);
  if (!repository) return { ok: false, code: 'cloudflare_repository_publication_execution_repository_ref_invalid', repository_ref: request.repository_ref };
  const branchRef = normalizeRepositoryBranchRef(request.branch_ref);
  if (!branchRef) return { ok: false, code: 'cloudflare_repository_publication_execution_branch_ref_invalid', branch_ref: request.branch_ref };
  const commitSha = parseGitCommitRef(request.source_change_ref);
  if (!commitSha) return { ok: false, code: 'cloudflare_repository_publication_execution_source_change_ref_invalid', source_change_ref: request.source_change_ref };
  const allowedRepositories = cloudflarePublicationAllowedValues(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_REPOSITORIES);
  const allowedBranches = cloudflarePublicationAllowedValues(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_BRANCHES);
  if (!isCloudflarePublicationValueAllowed(repository.repository_ref, allowedRepositories)) {
    return { ok: false, code: 'cloudflare_repository_publication_repository_not_allowed', repository_ref: repository.repository_ref };
  }
  if (!isCloudflarePublicationValueAllowed(branchRef, allowedBranches)) {
    return { ok: false, code: 'cloudflare_repository_publication_branch_not_allowed', branch_ref: branchRef };
  }
  const fetchImpl = typeof env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_FETCH === 'function'
    ? env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_FETCH
    : fetch;
  const credential = await resolveCloudflareGithubRepositoryPublicationCredential(env, fetchImpl);
  if (!credential.ok) return credential;
  const executionId = String(params.repository_publication_execution_id ?? `cloudflare_github_repository_publication_execution_${safeIdToken(siteId)}_${safeIdToken(repositoryPublicationRequestId)}_${Date.now()}`);
  const generatedAt = String(params.generated_at ?? new Date().toISOString());
  const repositoryApiBaseUrl = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  const updateRefUrl = `${repositoryApiBaseUrl}/git/refs/heads/${githubBranchRefPath(branchRef)}`;
  let githubStatus = 0;
  let githubSummary = {};
  let publicationStatus = 'failed';
  try {
    const response = await fetchImpl(updateRefUrl, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${credential.accessToken}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'narada-cloudflare-carrier',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ sha: commitSha, force: false }),
    });
    githubStatus = Number(response.status ?? 0);
    const body = await response.json().catch(() => ({}));
    githubSummary = { ...summarizeGithubPublicationResponse(body), github_operation: 'update_ref' };
    if (response.ok) {
      publicationStatus = 'completed';
    } else if (githubSummary.message === 'Reference does not exist') {
      const createRefResponse = await fetchImpl(`${repositoryApiBaseUrl}/git/refs`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential.accessToken}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'narada-cloudflare-carrier',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({ ref: `refs/heads/${githubBranchRefPath(branchRef)}`, sha: commitSha }),
      });
      githubStatus = Number(createRefResponse.status ?? 0);
      const createRefBody = await createRefResponse.json().catch(() => ({}));
      githubSummary = { ...summarizeGithubPublicationResponse(createRefBody), github_operation: 'create_ref' };
      publicationStatus = createRefResponse.ok ? 'completed' : 'failed';
    } else {
      publicationStatus = 'failed';
    }
  } catch (error) {
    githubSummary = { message: String(error?.message ?? error ?? 'github_repository_publication_request_failed') };
  }
  const execution = {
    repository_publication_execution_id: executionId,
    site_id: siteId,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_SCHEMA,
    generated_at: generatedAt,
    repository_publication_request_id: repositoryPublicationRequestId,
    publication_ref: request.publication_ref,
    requested_action_ref: request.requested_action_ref,
    repository_ref: repository.repository_ref,
    branch_ref: branchRef,
    source_change_ref: request.source_change_ref,
    publication_status: publicationStatus,
    repository_publication_executor_authority: CLOUDFLARE_GITHUB_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    github_credential_mode: credential.mode,
    repository_publication_admission_authority: admission.authority_locus,
    repository_publication_admission: admission.repository_publication_admission,
    cloudflare_repository_publication_admission_id: admission.repository_publication_admission_id,
    cloudflare_repository_publication_admission_action: admission.admission_action,
    cloudflare_git_push_admission: 'not_admitted',
    direct_cloudflare_repository_mutation_admission: 'admitted_by_cloudflare_github_repository_publication',
    published_commit_ref: publicationStatus === 'completed' ? `git:commit:${commitSha}` : '',
    github_http_status: githubStatus,
    github_response_summary: githubSummary,
    rollback_evidence_ref: publicationStatus === 'completed' ? `rollback:github-ref:${repository.repository_ref}:${branchRef}` : `rollback:not-published:${executionId}`,
    execution_posture: 'cloudflare_admitted_and_executed_github_repository_publication',
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await recordCloudflareGithubRepositoryPublicationExecution(db, execution);
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_SCHEMA,
    status: 'execution_recorded',
    site_id: siteId,
    repository_publication_executor_authority: execution.repository_publication_executor_authority,
    repository_publication_admission_authority: execution.repository_publication_admission_authority,
    repository_publication_admission: execution.repository_publication_admission,
    cloudflare_git_push_admission: execution.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: execution.direct_cloudflare_repository_mutation_admission,
    publication_status: execution.publication_status,
    authority_partition: 'cloudflare_admits_and_executes_github_repository_publication',
    execution,
    request,
    admission,
  };
}

function summarizeGithubPublicationResponse(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    ref: body.ref ?? null,
    object_sha: body.object?.sha ?? null,
    object_type: body.object?.type ?? null,
    message: body.message ?? null,
  };
}

async function recordCloudflareGithubRepositoryPublicationExecution(db, execution) {
  await ensureCloudflareRepositoryPublicationExecutionSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_repository_publication_executions (
      repository_publication_execution_id,
      site_id,
      generated_at,
      repository_publication_request_id,
      publication_ref,
      requested_action_ref,
      repository_ref,
      branch_ref,
      source_change_ref,
      publication_status,
      repository_publication_executor_authority,
      repository_publication_admission_authority,
      repository_publication_admission,
      cloudflare_repository_publication_admission_id,
      cloudflare_repository_publication_admission_action,
      cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission,
      published_commit_ref,
      github_http_status,
      rollback_evidence_ref,
      execution_posture,
      execution_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_publication_execution_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      repository_publication_request_id = excluded.repository_publication_request_id,
      publication_ref = excluded.publication_ref,
      requested_action_ref = excluded.requested_action_ref,
      repository_ref = excluded.repository_ref,
      branch_ref = excluded.branch_ref,
      source_change_ref = excluded.source_change_ref,
      publication_status = excluded.publication_status,
      repository_publication_executor_authority = excluded.repository_publication_executor_authority,
      repository_publication_admission_authority = excluded.repository_publication_admission_authority,
      repository_publication_admission = excluded.repository_publication_admission,
      cloudflare_repository_publication_admission_id = excluded.cloudflare_repository_publication_admission_id,
      cloudflare_repository_publication_admission_action = excluded.cloudflare_repository_publication_admission_action,
      cloudflare_git_push_admission = excluded.cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission = excluded.direct_cloudflare_repository_mutation_admission,
      published_commit_ref = excluded.published_commit_ref,
      github_http_status = excluded.github_http_status,
      rollback_evidence_ref = excluded.rollback_evidence_ref,
      execution_posture = excluded.execution_posture,
      execution_json = excluded.execution_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    execution.repository_publication_execution_id,
    execution.site_id,
    execution.generated_at,
    execution.repository_publication_request_id,
    execution.publication_ref,
    execution.requested_action_ref,
    execution.repository_ref,
    execution.branch_ref,
    execution.source_change_ref,
    execution.publication_status,
    execution.repository_publication_executor_authority,
    execution.repository_publication_admission_authority,
    execution.repository_publication_admission,
    execution.cloudflare_repository_publication_admission_id,
    execution.cloudflare_repository_publication_admission_action,
    execution.cloudflare_git_push_admission,
    execution.direct_cloudflare_repository_mutation_admission,
    execution.published_commit_ref,
    execution.github_http_status,
    execution.rollback_evidence_ref,
    execution.execution_posture,
    JSON.stringify(execution),
    execution.recorded_by_principal_id,
    execution.recorded_at,
  ).run();
}

async function ensureCloudflareRepositoryPublicationExecutionSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_executions (
      repository_publication_execution_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      repository_publication_admission_authority TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      cloudflare_repository_publication_admission_id TEXT NOT NULL,
      cloudflare_repository_publication_admission_action TEXT NOT NULL,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      published_commit_ref TEXT,
      github_http_status INTEGER NOT NULL,
      rollback_evidence_ref TEXT NOT NULL,
      execution_posture TEXT NOT NULL,
      execution_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_executions_site_recorded
    ON cloudflare_repository_publication_executions(site_id, recorded_at)
  `).run();
}

async function listCloudflareRepositoryPublicationExecutions(env = {}, siteId, limit, repositoryPublicationRequestId = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareRepositoryPublicationExecutionSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const statement = repositoryPublicationRequestId
    ? db.prepare(`
      SELECT * FROM cloudflare_repository_publication_executions
      WHERE site_id = ? AND repository_publication_request_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, repositoryPublicationRequestId, boundedLimit)
    : db.prepare(`
      SELECT * FROM cloudflare_repository_publication_executions
      WHERE site_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, boundedLimit);
  const rows = await statement.all();
  return (rows.results ?? []).map((row) => ({
    repository_publication_execution_id: row.repository_publication_execution_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EXECUTION_SCHEMA,
    generated_at: row.generated_at,
    repository_publication_request_id: row.repository_publication_request_id,
    publication_ref: row.publication_ref,
    requested_action_ref: row.requested_action_ref,
    repository_ref: row.repository_ref,
    branch_ref: row.branch_ref,
    source_change_ref: row.source_change_ref,
    publication_status: row.publication_status,
    repository_publication_executor_authority: row.repository_publication_executor_authority,
    repository_publication_admission_authority: row.repository_publication_admission_authority,
    repository_publication_admission: row.repository_publication_admission,
    cloudflare_repository_publication_admission_id: row.cloudflare_repository_publication_admission_id,
    cloudflare_repository_publication_admission_action: row.cloudflare_repository_publication_admission_action,
    cloudflare_git_push_admission: row.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: row.direct_cloudflare_repository_mutation_admission,
    published_commit_ref: row.published_commit_ref,
    github_http_status: Number(row.github_http_status),
    rollback_evidence_ref: row.rollback_evidence_ref,
    execution_posture: row.execution_posture,
    record: parseJsonObject(row.execution_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createLocalIngressEvidence(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.evidence ?? {};
  const localIngressRequestId = String(source.local_ingress_request_id ?? params.local_ingress_request_id ?? '');
  const localExecutionId = String(source.local_execution_id ?? params.local_execution_id ?? '');
  const requestedMutationClass = String(source.requested_mutation_class ?? params.requested_mutation_class ?? 'local_repository_filesystem_mutation');
  const windowsAdmissionAction = String(source.windows_admission_action ?? params.windows_admission_action ?? 'admit');
  const localExecutionStatus = String(source.local_execution_status ?? params.local_execution_status ?? 'completed');
  const localFilesystemMutationAdmission = String(source.local_filesystem_mutation_admission ?? params.local_filesystem_mutation_admission ?? 'admitted_by_windows_local_ingress');
  const directCloudflareFilesystemMutationAdmission = String(source.direct_cloudflare_filesystem_mutation_admission ?? params.direct_cloudflare_filesystem_mutation_admission ?? 'not_admitted');
  const repositoryPublicationAdmission = String(source.repository_publication_admission ?? params.repository_publication_admission ?? 'not_admitted');
  const changedFiles = Array.isArray(source.changed_files ?? params.changed_files) ? source.changed_files ?? params.changed_files : [];
  if (!localIngressRequestId) return { ok: false, code: 'local_ingress_evidence_request_id_required' };
  if (!localExecutionId) return { ok: false, code: 'local_ingress_evidence_execution_id_required' };
  if (requestedMutationClass !== 'local_repository_filesystem_mutation') return { ok: false, code: 'local_ingress_evidence_mutation_class_invalid', requested_mutation_class: requestedMutationClass };
  if (windowsAdmissionAction !== 'admit') return { ok: false, code: 'local_ingress_evidence_windows_admission_action_invalid', windows_admission_action: windowsAdmissionAction };
  if (localExecutionStatus !== 'completed') return { ok: false, code: 'local_ingress_evidence_execution_status_invalid', local_execution_status: localExecutionStatus };
  if (localFilesystemMutationAdmission !== 'admitted_by_windows_local_ingress') return { ok: false, code: 'local_ingress_evidence_filesystem_mutation_admission_invalid', local_filesystem_mutation_admission: localFilesystemMutationAdmission };
  if (directCloudflareFilesystemMutationAdmission !== 'not_admitted') return { ok: false, code: 'local_ingress_evidence_direct_cloudflare_filesystem_mutation_admission_invalid', direct_cloudflare_filesystem_mutation_admission: directCloudflareFilesystemMutationAdmission };
  if (repositoryPublicationAdmission !== 'not_admitted') return { ok: false, code: 'local_ingress_evidence_repository_publication_admission_invalid', repository_publication_admission: repositoryPublicationAdmission };
  if (changedFiles.length < 1) return { ok: false, code: 'local_ingress_evidence_changed_file_required' };
  return {
    ok: true,
    evidence: {
      schema: 'narada.sonar.cloudflare_local_ingress_evidence_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      local_ingress_request_id: localIngressRequestId,
      local_execution_id: localExecutionId,
      requested_mutation_class: requestedMutationClass,
      windows_admission_action: windowsAdmissionAction,
      windows_admission_reason: String(source.windows_admission_reason ?? params.windows_admission_reason ?? 'governed_local_ingress_request_admitted'),
      local_execution_status: localExecutionStatus,
      local_executor_authority: String(source.local_executor_authority ?? params.local_executor_authority ?? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY),
      local_filesystem_mutation_admission: localFilesystemMutationAdmission,
      changed_files: changedFiles,
      rollback_evidence_ref: String(source.rollback_evidence_ref ?? params.rollback_evidence_ref ?? ''),
      direct_cloudflare_filesystem_mutation_admission: directCloudflareFilesystemMutationAdmission,
      repository_publication_admission: repositoryPublicationAdmission,
      evidence_posture: 'windows_local_ingress_executed_cloudflare_recorded_evidence',
    },
  };
}

async function recordCloudflareLocalIngressEvidence(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createLocalIngressEvidence(siteId, params);
  if (!payload.ok) return payload;
  const evidence = payload.evidence;
  const record = {
    local_ingress_evidence_id: params.local_ingress_evidence_id ?? `local_ingress_evidence_${safeIdToken(siteId)}_${safeIdToken(evidence.local_execution_id)}`,
    site_id: siteId,
    generated_at: evidence.generated_at,
    local_ingress_request_id: evidence.local_ingress_request_id,
    local_execution_id: evidence.local_execution_id,
    requested_mutation_class: evidence.requested_mutation_class,
    windows_admission_action: evidence.windows_admission_action,
    windows_admission_reason: evidence.windows_admission_reason,
    local_execution_status: evidence.local_execution_status,
    local_executor_authority: evidence.local_executor_authority,
    local_filesystem_mutation_admission: evidence.local_filesystem_mutation_admission,
    changed_file_count: evidence.changed_files.length,
    rollback_evidence_ref: evidence.rollback_evidence_ref,
    direct_cloudflare_filesystem_mutation_admission: evidence.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: evidence.repository_publication_admission,
    evidence_posture: evidence.evidence_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareLocalIngressEvidenceSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_local_ingress_evidence (
      local_ingress_evidence_id,
      site_id,
      generated_at,
      local_ingress_request_id,
      local_execution_id,
      requested_mutation_class,
      windows_admission_action,
      windows_admission_reason,
      local_execution_status,
      local_executor_authority,
      local_filesystem_mutation_admission,
      changed_file_count,
      rollback_evidence_ref,
      direct_cloudflare_filesystem_mutation_admission,
      repository_publication_admission,
      evidence_posture,
      evidence_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_ingress_evidence_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      local_ingress_request_id = excluded.local_ingress_request_id,
      local_execution_id = excluded.local_execution_id,
      requested_mutation_class = excluded.requested_mutation_class,
      windows_admission_action = excluded.windows_admission_action,
      windows_admission_reason = excluded.windows_admission_reason,
      local_execution_status = excluded.local_execution_status,
      local_executor_authority = excluded.local_executor_authority,
      local_filesystem_mutation_admission = excluded.local_filesystem_mutation_admission,
      changed_file_count = excluded.changed_file_count,
      rollback_evidence_ref = excluded.rollback_evidence_ref,
      direct_cloudflare_filesystem_mutation_admission = excluded.direct_cloudflare_filesystem_mutation_admission,
      repository_publication_admission = excluded.repository_publication_admission,
      evidence_posture = excluded.evidence_posture,
      evidence_json = excluded.evidence_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.local_ingress_evidence_id,
    record.site_id,
    record.generated_at,
    record.local_ingress_request_id,
    record.local_execution_id,
    record.requested_mutation_class,
    record.windows_admission_action,
    record.windows_admission_reason,
    record.local_execution_status,
    record.local_executor_authority,
    record.local_filesystem_mutation_admission,
    record.changed_file_count,
    record.rollback_evidence_ref,
    record.direct_cloudflare_filesystem_mutation_admission,
    record.repository_publication_admission,
    record.evidence_posture,
    JSON.stringify({ ...record, evidence, cloudflare_repository_publication_admission: record.repository_publication_admission }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    local_ingress_evidence_authority: record.local_executor_authority,
    cloudflare_evidence_store_authority: 'cloudflare_local_ingress_evidence_store',
    local_filesystem_mutation_admission: record.local_filesystem_mutation_admission,
    direct_cloudflare_filesystem_mutation_admission: record.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: record.repository_publication_admission,
    authority_partition: 'windows_executes_local_ingress_cloudflare_records_evidence_without_direct_filesystem_authority',
    evidence,
    record,
  };
}

async function ensureCloudflareLocalIngressEvidenceSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_evidence (
      local_ingress_evidence_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      local_ingress_request_id TEXT NOT NULL,
      local_execution_id TEXT NOT NULL,
      requested_mutation_class TEXT NOT NULL,
      windows_admission_action TEXT NOT NULL,
      windows_admission_reason TEXT NOT NULL,
      local_execution_status TEXT NOT NULL,
      local_executor_authority TEXT NOT NULL,
      local_filesystem_mutation_admission TEXT NOT NULL,
      changed_file_count INTEGER NOT NULL,
      rollback_evidence_ref TEXT,
      direct_cloudflare_filesystem_mutation_admission TEXT NOT NULL,
      repository_publication_admission TEXT NOT NULL,
      evidence_posture TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_local_ingress_evidence_site_recorded
    ON cloudflare_local_ingress_evidence(site_id, recorded_at)
  `).run();
}

async function listCloudflareLocalIngressEvidence(env = {}, siteId, limit, localIngressRequestId = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareLocalIngressEvidenceSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const statement = localIngressRequestId
    ? db.prepare(`
      SELECT * FROM cloudflare_local_ingress_evidence
      WHERE site_id = ? AND local_ingress_request_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, localIngressRequestId, boundedLimit)
    : db.prepare(`
      SELECT * FROM cloudflare_local_ingress_evidence
      WHERE site_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, boundedLimit);
  const rows = await statement.all();
  return (rows.results ?? []).map((row) => ({
    local_ingress_evidence_id: row.local_ingress_evidence_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_LOCAL_INGRESS_EVIDENCE_SCHEMA,
    generated_at: row.generated_at,
    local_ingress_request_id: row.local_ingress_request_id,
    local_execution_id: row.local_execution_id,
    requested_mutation_class: row.requested_mutation_class,
    windows_admission_action: row.windows_admission_action,
    windows_admission_reason: row.windows_admission_reason,
    local_execution_status: row.local_execution_status,
    local_executor_authority: row.local_executor_authority,
    local_filesystem_mutation_admission: row.local_filesystem_mutation_admission,
    changed_file_count: Number(row.changed_file_count),
    rollback_evidence_ref: row.rollback_evidence_ref,
    direct_cloudflare_filesystem_mutation_admission: row.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: row.repository_publication_admission,
    evidence_posture: row.evidence_posture,
    record: parseJsonObject(row.evidence_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createCloudflareLocalIngressProviderHeartbeat(siteId, params = {}, principal = null) {
  const generatedAt = params.generated_at ?? params.last_run_at ?? new Date().toISOString();
  const providerId = String(params.provider_id ?? 'windows_local_ingress_executor').trim();
  const status = String(params.status ?? '').trim();
  const directCloudflareFilesystemMutationAdmission = String(params.direct_cloudflare_filesystem_mutation_admission ?? 'not_admitted');
  const repositoryPublicationAdmission = String(params.repository_publication_admission ?? 'not_admitted');
  return {
    local_ingress_provider_heartbeat_id: params.local_ingress_provider_heartbeat_id ?? `local_ingress_provider_heartbeat_${providerId}_${Date.now()}`,
    site_id: siteId,
    schema: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_HEARTBEAT_SCHEMA,
    generated_at: generatedAt,
    last_run_at: params.last_run_at ?? generatedAt,
    provider_id: providerId,
    provider_authority: params.provider_authority ?? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY,
    provider_embodiment: params.provider_embodiment ?? params.embodiment ?? 'windows_current_user_local_ingress_executor',
    provider_refresh_trigger: params.provider_refresh_trigger ?? 'not_observed',
    scheduler_task_name: params.scheduler_task_name ?? null,
    scheduler_interval_minutes: Number.isFinite(Number(params.scheduler_interval_minutes)) ? Number(params.scheduler_interval_minutes) : null,
    status,
    local_ingress_request_id: params.local_ingress_request_id ?? null,
    local_execution_id: params.local_execution_id ?? null,
    evidence_record_status: params.evidence_record_status ?? null,
    cloudflare_evidence_http_status: Number.isFinite(Number(params.cloudflare_evidence_http_status)) ? Number(params.cloudflare_evidence_http_status) : null,
    completed_execution_count: Number.isFinite(Number(params.completed_execution_count)) ? Number(params.completed_execution_count) : 0,
    refused_execution_count: Number.isFinite(Number(params.refused_execution_count)) ? Number(params.refused_execution_count) : 0,
    resolved_execution_count: Number.isFinite(Number(params.resolved_execution_count)) ? Number(params.resolved_execution_count) : 0,
    cloudflare_dispatch_authority: params.cloudflare_dispatch_authority ?? CLOUDFLARE_LOCAL_INGRESS_REQUEST_AUTHORITY,
    provider_liveness_authority: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY,
    direct_cloudflare_filesystem_mutation_admission: directCloudflareFilesystemMutationAdmission,
    repository_publication_admission: repositoryPublicationAdmission,
    recorded_by_principal_id: principal?.principal_id ?? params.recorded_by_principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
}

function classifyLocalIngressProviderLiveness(heartbeats = [], { nowMs = Date.now(), staleAfterMs = DEFAULT_LOCAL_INGRESS_PROVIDER_STALE_AFTER_MS } = {}) {
  const heartbeat = Array.isArray(heartbeats) ? heartbeats[0] ?? null : null;
  if (!heartbeat) {
    return {
      schema: 'narada.sonar.cloudflare_local_ingress_provider_liveness.v1',
      state: 'missing',
      reason: 'local_ingress_provider_heartbeat_missing',
      provider_id: 'windows_local_ingress_executor',
      provider_authority: WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY,
      provider_liveness_authority: 'not_observed',
      stale_after_ms: staleAfterMs,
      scheduler_posture: classifyProviderHeartbeatSchedulerPosture(null, { providerKind: 'local_ingress', providerLivenessState: 'missing' }),
    };
  }
  const observedAt = Date.parse(heartbeat.last_run_at ?? heartbeat.generated_at ?? heartbeat.recorded_at ?? '');
  const ageMs = Number.isFinite(observedAt) ? Math.max(0, nowMs - observedAt) : null;
  const status = heartbeat.status ?? 'unknown';
  const state = ageMs == null
    ? 'unknown'
    : ageMs > staleAfterMs ? 'stale' : status === 'failed' ? 'failed' : 'fresh';
  const schedulerPosture = classifyProviderHeartbeatSchedulerPosture(heartbeat, {
    providerKind: 'local_ingress',
    providerLivenessState: state,
  });
  return {
    schema: 'narada.sonar.cloudflare_local_ingress_provider_liveness.v1',
    state,
    reason: state === 'fresh' ? 'local_ingress_provider_heartbeat_recent' : `local_ingress_provider_heartbeat_${state}`,
    provider_id: heartbeat.provider_id ?? 'windows_local_ingress_executor',
    provider_authority: heartbeat.provider_authority ?? WINDOWS_LOCAL_INGRESS_EXECUTOR_AUTHORITY,
    provider_embodiment: heartbeat.provider_embodiment ?? 'windows_current_user_local_ingress_executor',
    provider_status: status,
    latest_heartbeat_id: heartbeat.local_ingress_provider_heartbeat_id ?? null,
    latest_heartbeat_at: heartbeat.last_run_at ?? heartbeat.generated_at ?? heartbeat.recorded_at ?? null,
    latest_heartbeat_age_ms: ageMs,
    stale_after_ms: staleAfterMs,
    provider_liveness_authority: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY,
    scheduler_posture: schedulerPosture,
  };
}

function classifyProviderHeartbeatSchedulerPosture(heartbeat = null, { providerKind = 'provider', providerLivenessState = 'unknown' } = {}) {
  if (!heartbeat) {
    return {
      schema: 'narada.cloudflare_provider_liveness_scheduler_posture.v1',
      provider_kind: providerKind,
      state: 'not_observed',
      reason: 'provider_heartbeat_missing',
      refresh_trigger: 'not_observed',
      task_name: null,
      interval_minutes: null,
    };
  }
  const refreshTrigger = heartbeat.provider_refresh_trigger ?? 'not_observed';
  const scheduled = refreshTrigger === 'windows_task_scheduler';
  const intervalMinutes = Number.isFinite(Number(heartbeat.scheduler_interval_minutes)) ? Number(heartbeat.scheduler_interval_minutes) : null;
  const state = scheduled
    ? (providerLivenessState === 'fresh' ? 'fresh_from_scheduled_refresh' : `${providerLivenessState}_from_scheduled_refresh`)
    : 'not_observed';
  return {
    schema: 'narada.cloudflare_provider_liveness_scheduler_posture.v1',
    provider_kind: providerKind,
    state,
    reason: scheduled ? `provider_liveness_${state}` : 'provider_heartbeat_refresh_trigger_not_scheduled',
    refresh_trigger: refreshTrigger,
    task_name: heartbeat.scheduler_task_name ?? null,
    interval_minutes: intervalMinutes,
  };
}

async function recordCloudflareLocalIngressProviderHeartbeat(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const heartbeat = createCloudflareLocalIngressProviderHeartbeat(siteId, params, principal);
  if (!heartbeat.provider_id) return { ok: false, code: 'local_ingress_provider_heartbeat_provider_id_required' };
  if (!heartbeat.status) return { ok: false, code: 'local_ingress_provider_heartbeat_status_required' };
  if (heartbeat.direct_cloudflare_filesystem_mutation_admission !== 'not_admitted') return { ok: false, code: 'local_ingress_provider_heartbeat_direct_cloudflare_filesystem_mutation_admission_invalid', direct_cloudflare_filesystem_mutation_admission: heartbeat.direct_cloudflare_filesystem_mutation_admission };
  if (heartbeat.repository_publication_admission !== 'not_admitted') return { ok: false, code: 'local_ingress_provider_heartbeat_repository_publication_admission_invalid', repository_publication_admission: heartbeat.repository_publication_admission };
  await ensureCloudflareLocalIngressProviderHeartbeatSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_local_ingress_provider_heartbeats (
      local_ingress_provider_heartbeat_id, site_id, generated_at, last_run_at,
      provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(local_ingress_provider_heartbeat_id) DO UPDATE SET
      last_run_at = excluded.last_run_at,
      status = excluded.status,
      heartbeat_json = excluded.heartbeat_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    heartbeat.local_ingress_provider_heartbeat_id,
    heartbeat.site_id,
    heartbeat.generated_at,
    heartbeat.last_run_at,
    heartbeat.provider_id,
    heartbeat.provider_authority,
    heartbeat.provider_embodiment,
    heartbeat.status,
    JSON.stringify(heartbeat),
    heartbeat.recorded_by_principal_id,
    heartbeat.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_HEARTBEAT_SCHEMA,
    site_id: siteId,
    provider_liveness_authority: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY,
    direct_cloudflare_filesystem_mutation_admission: heartbeat.direct_cloudflare_filesystem_mutation_admission,
    repository_publication_admission: heartbeat.repository_publication_admission,
    heartbeat,
  };
}

async function ensureCloudflareLocalIngressProviderHeartbeatSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_local_ingress_provider_heartbeats (
      local_ingress_provider_heartbeat_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_authority TEXT NOT NULL,
      provider_embodiment TEXT NOT NULL,
      status TEXT NOT NULL,
      heartbeat_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_local_ingress_provider_heartbeats_site_recorded
    ON cloudflare_local_ingress_provider_heartbeats(site_id, recorded_at)
  `).run();
}

async function listCloudflareLocalIngressProviderHeartbeats(env = {}, siteId, limit = 20) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return [];
  if (!siteId || siteId === 'unknown-site') return [];
  await ensureCloudflareLocalIngressProviderHeartbeatSchema(db);
  const boundedLimit = Math.max(1, Math.min(100, Number.parseInt(limit ?? 20, 10) || 20));
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_local_ingress_provider_heartbeats
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => {
    try {
      return JSON.parse(row.heartbeat_json);
    } catch {
      return {
        local_ingress_provider_heartbeat_id: row.local_ingress_provider_heartbeat_id,
        site_id: row.site_id,
        schema: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_HEARTBEAT_SCHEMA,
        generated_at: row.generated_at,
        last_run_at: row.last_run_at,
        provider_id: row.provider_id,
        provider_authority: row.provider_authority,
        provider_embodiment: row.provider_embodiment,
        status: row.status,
        provider_liveness_authority: CLOUDFLARE_LOCAL_INGRESS_PROVIDER_LIVENESS_AUTHORITY,
        direct_cloudflare_filesystem_mutation_admission: 'not_admitted',
        repository_publication_admission: 'not_admitted',
        recorded_by_principal_id: row.recorded_by_principal_id,
        recorded_at: row.recorded_at,
      };
    }
  });
}

function createRepositoryPublicationEvidence(siteId, params = {}) {
  const source = params.source_payload ?? params.payload ?? params.evidence ?? {};
  const repositoryPublicationRequestId = String(source.repository_publication_request_id ?? params.repository_publication_request_id ?? '');
  const publicationExecutionId = String(source.publication_execution_id ?? params.publication_execution_id ?? '');
  const windowsAdmissionAction = String(source.windows_admission_action ?? params.windows_admission_action ?? 'refuse');
  const publicationStatus = String(source.publication_status ?? params.publication_status ?? (windowsAdmissionAction === 'admit' ? 'completed' : 'refused'));
  const repositoryRef = String(source.repository_ref ?? params.repository_ref ?? '');
  const branchRef = String(source.branch_ref ?? params.branch_ref ?? '');
  const sourceChangeRef = String(source.source_change_ref ?? params.source_change_ref ?? '');
  const publicationRef = String(source.publication_ref ?? params.publication_ref ?? repositoryPublicationRequestId);
  const requestedActionRef = String(source.requested_action_ref ?? params.requested_action_ref ?? publicationRef);
  const publishedCommitRef = String(source.published_commit_ref ?? params.published_commit_ref ?? '');
  const rollbackEvidenceRef = String(source.rollback_evidence_ref ?? params.rollback_evidence_ref ?? '');
  const cloudflareGitPushAdmission = String(source.cloudflare_git_push_admission ?? params.cloudflare_git_push_admission ?? 'not_admitted');
  const directCloudflareRepositoryMutationAdmission = String(source.direct_cloudflare_repository_mutation_admission ?? params.direct_cloudflare_repository_mutation_admission ?? 'not_admitted');
  if (!repositoryPublicationRequestId) return { ok: false, code: 'repository_publication_evidence_request_id_required' };
  if (!publicationExecutionId) return { ok: false, code: 'repository_publication_evidence_execution_id_required' };
  if (!['admit', 'refuse'].includes(windowsAdmissionAction)) return { ok: false, code: 'repository_publication_evidence_windows_admission_action_invalid', windows_admission_action: windowsAdmissionAction };
  if (!['completed', 'refused', 'failed'].includes(publicationStatus)) return { ok: false, code: 'repository_publication_evidence_status_invalid', publication_status: publicationStatus };
  if (windowsAdmissionAction === 'admit' && publicationStatus !== 'completed') return { ok: false, code: 'repository_publication_evidence_admitted_status_invalid', publication_status: publicationStatus };
  if (windowsAdmissionAction === 'refuse' && publicationStatus === 'completed') return { ok: false, code: 'repository_publication_evidence_refused_status_invalid', publication_status: publicationStatus };
  if (!repositoryRef) return { ok: false, code: 'repository_publication_evidence_repository_ref_required' };
  if (!branchRef) return { ok: false, code: 'repository_publication_evidence_branch_ref_required' };
  if (!sourceChangeRef) return { ok: false, code: 'repository_publication_evidence_source_change_ref_required' };
  if (windowsAdmissionAction === 'admit' && !publishedCommitRef) return { ok: false, code: 'repository_publication_evidence_published_commit_ref_required' };
  if (cloudflareGitPushAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_evidence_cloudflare_git_push_admission_invalid', cloudflare_git_push_admission: cloudflareGitPushAdmission };
  if (directCloudflareRepositoryMutationAdmission !== 'not_admitted') return { ok: false, code: 'repository_publication_evidence_direct_cloudflare_repository_mutation_admission_invalid', direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission };
  return {
    ok: true,
    evidence: {
      schema: 'narada.sonar.cloudflare_repository_publication_evidence_record.v1',
      site_id: siteId,
      generated_at: String(source.generated_at ?? params.generated_at ?? new Date().toISOString()),
      repository_publication_request_id: repositoryPublicationRequestId,
      publication_execution_id: publicationExecutionId,
      publication_ref: publicationRef,
      requested_action_ref: requestedActionRef,
      repository_ref: repositoryRef,
      branch_ref: branchRef,
      source_change_ref: sourceChangeRef,
      windows_admission_action: windowsAdmissionAction,
      windows_admission_reason: String(source.windows_admission_reason ?? params.windows_admission_reason ?? (windowsAdmissionAction === 'admit' ? 'governed_repository_publication_request_admitted' : 'governed_repository_publication_request_refused')),
      publication_status: publicationStatus,
      repository_publication_executor_authority: String(source.repository_publication_executor_authority ?? params.repository_publication_executor_authority ?? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY),
      published_commit_ref: publishedCommitRef,
      rollback_evidence_ref: rollbackEvidenceRef,
      cloudflare_git_push_admission: cloudflareGitPushAdmission,
      direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission,
      evidence_posture: 'windows_repository_publication_resolved_cloudflare_recorded_evidence',
    },
  };
}

async function recordCloudflareRepositoryPublicationEvidence(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const payload = createRepositoryPublicationEvidence(siteId, params);
  if (!payload.ok) return payload;
  const evidence = payload.evidence;
  const admissions = await listCloudflareRepositoryPublicationAdmissions(env, siteId, 100, evidence.repository_publication_request_id);
  const admission = latestRepositoryPublicationAdmissionForRequest(admissions, evidence.repository_publication_request_id);
  if (!admission) return { ok: false, code: 'repository_publication_evidence_cloudflare_admission_required', repository_publication_request_id: evidence.repository_publication_request_id };
  if (admission.admission_action !== 'admit') return { ok: false, code: 'repository_publication_evidence_cloudflare_admission_refused', repository_publication_request_id: evidence.repository_publication_request_id, repository_publication_admission: admission.repository_publication_admission };
  const record = {
    repository_publication_evidence_id: params.repository_publication_evidence_id ?? `repository_publication_evidence_${safeIdToken(siteId)}_${safeIdToken(evidence.publication_execution_id)}`,
    site_id: siteId,
    generated_at: evidence.generated_at,
    repository_publication_request_id: evidence.repository_publication_request_id,
    publication_execution_id: evidence.publication_execution_id,
    publication_ref: evidence.publication_ref,
    requested_action_ref: evidence.requested_action_ref,
    repository_ref: evidence.repository_ref,
    branch_ref: evidence.branch_ref,
    source_change_ref: evidence.source_change_ref,
    windows_admission_action: evidence.windows_admission_action,
    windows_admission_reason: evidence.windows_admission_reason,
    publication_status: evidence.publication_status,
    repository_publication_executor_authority: evidence.repository_publication_executor_authority,
    published_commit_ref: evidence.published_commit_ref,
    rollback_evidence_ref: evidence.rollback_evidence_ref,
    cloudflare_repository_publication_admission_id: admission.repository_publication_admission_id,
    cloudflare_repository_publication_admission_action: admission.admission_action,
    cloudflare_repository_publication_admission_authority: admission.authority_locus,
    cloudflare_git_push_admission: evidence.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: evidence.direct_cloudflare_repository_mutation_admission,
    evidence_posture: evidence.evidence_posture,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareRepositoryPublicationEvidenceSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_repository_publication_evidence (
      repository_publication_evidence_id,
      site_id,
      generated_at,
      repository_publication_request_id,
      publication_execution_id,
      publication_ref,
      requested_action_ref,
      repository_ref,
      branch_ref,
      source_change_ref,
      windows_admission_action,
      windows_admission_reason,
      publication_status,
      repository_publication_executor_authority,
      published_commit_ref,
      rollback_evidence_ref,
      cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission,
      evidence_posture,
      evidence_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_publication_evidence_id) DO UPDATE SET
      generated_at = excluded.generated_at,
      repository_publication_request_id = excluded.repository_publication_request_id,
      publication_execution_id = excluded.publication_execution_id,
      publication_ref = excluded.publication_ref,
      requested_action_ref = excluded.requested_action_ref,
      repository_ref = excluded.repository_ref,
      branch_ref = excluded.branch_ref,
      source_change_ref = excluded.source_change_ref,
      windows_admission_action = excluded.windows_admission_action,
      windows_admission_reason = excluded.windows_admission_reason,
      publication_status = excluded.publication_status,
      repository_publication_executor_authority = excluded.repository_publication_executor_authority,
      published_commit_ref = excluded.published_commit_ref,
      rollback_evidence_ref = excluded.rollback_evidence_ref,
      cloudflare_git_push_admission = excluded.cloudflare_git_push_admission,
      direct_cloudflare_repository_mutation_admission = excluded.direct_cloudflare_repository_mutation_admission,
      evidence_posture = excluded.evidence_posture,
      evidence_json = excluded.evidence_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.repository_publication_evidence_id,
    record.site_id,
    record.generated_at,
    record.repository_publication_request_id,
    record.publication_execution_id,
    record.publication_ref,
    record.requested_action_ref,
    record.repository_ref,
    record.branch_ref,
    record.source_change_ref,
    record.windows_admission_action,
    record.windows_admission_reason,
    record.publication_status,
    record.repository_publication_executor_authority,
    record.published_commit_ref,
    record.rollback_evidence_ref,
    record.cloudflare_git_push_admission,
    record.direct_cloudflare_repository_mutation_admission,
    record.evidence_posture,
    JSON.stringify({ ...record, evidence }),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    repository_publication_evidence_authority: record.repository_publication_executor_authority,
    repository_publication_admission_authority: record.cloudflare_repository_publication_admission_authority,
    cloudflare_evidence_store_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_AUTHORITY,
    repository_publication_admission: admission.repository_publication_admission,
    cloudflare_repository_publication_admission_id: admission.repository_publication_admission_id,
    cloudflare_repository_publication_admission_action: admission.admission_action,
    cloudflare_git_push_admission: record.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: record.direct_cloudflare_repository_mutation_admission,
    authority_partition: 'cloudflare_admits_repository_publication_windows_executes_and_cloudflare_records_evidence',
    evidence,
    record,
  };
}

async function ensureCloudflareRepositoryPublicationEvidenceSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_evidence (
      repository_publication_evidence_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      repository_publication_request_id TEXT NOT NULL,
      publication_execution_id TEXT NOT NULL,
      publication_ref TEXT NOT NULL,
      requested_action_ref TEXT NOT NULL,
      repository_ref TEXT NOT NULL,
      branch_ref TEXT NOT NULL,
      source_change_ref TEXT NOT NULL,
      windows_admission_action TEXT NOT NULL,
      windows_admission_reason TEXT NOT NULL,
      publication_status TEXT NOT NULL,
      repository_publication_executor_authority TEXT NOT NULL,
      published_commit_ref TEXT,
      rollback_evidence_ref TEXT,
      cloudflare_git_push_admission TEXT NOT NULL,
      direct_cloudflare_repository_mutation_admission TEXT NOT NULL,
      evidence_posture TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_evidence_site_recorded
    ON cloudflare_repository_publication_evidence(site_id, recorded_at)
  `).run();
}

async function listCloudflareRepositoryPublicationEvidence(env = {}, siteId, limit, repositoryPublicationRequestId = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareRepositoryPublicationEvidenceSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const statement = repositoryPublicationRequestId
    ? db.prepare(`
      SELECT * FROM cloudflare_repository_publication_evidence
      WHERE site_id = ? AND repository_publication_request_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, repositoryPublicationRequestId, boundedLimit)
    : db.prepare(`
      SELECT * FROM cloudflare_repository_publication_evidence
      WHERE site_id = ?
      ORDER BY recorded_at DESC, generated_at DESC
      LIMIT ?
    `).bind(siteId, boundedLimit);
  const rows = await statement.all();
  return (rows.results ?? []).map((row) => ({
    repository_publication_evidence_id: row.repository_publication_evidence_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_EVIDENCE_SCHEMA,
    generated_at: row.generated_at,
    repository_publication_request_id: row.repository_publication_request_id,
    publication_execution_id: row.publication_execution_id,
    publication_ref: row.publication_ref,
    requested_action_ref: row.requested_action_ref,
    repository_ref: row.repository_ref,
    branch_ref: row.branch_ref,
    source_change_ref: row.source_change_ref,
    windows_admission_action: row.windows_admission_action,
    windows_admission_reason: row.windows_admission_reason,
    publication_status: row.publication_status,
    repository_publication_executor_authority: row.repository_publication_executor_authority,
    published_commit_ref: row.published_commit_ref,
    rollback_evidence_ref: row.rollback_evidence_ref,
    cloudflare_repository_publication_admission_id: parseJsonObject(row.evidence_json).cloudflare_repository_publication_admission_id ?? null,
    cloudflare_repository_publication_admission_action: parseJsonObject(row.evidence_json).cloudflare_repository_publication_admission_action ?? null,
    cloudflare_repository_publication_admission_authority: parseJsonObject(row.evidence_json).cloudflare_repository_publication_admission_authority ?? null,
    cloudflare_git_push_admission: row.cloudflare_git_push_admission,
    direct_cloudflare_repository_mutation_admission: row.direct_cloudflare_repository_mutation_admission,
    evidence_posture: row.evidence_posture,
    record: parseJsonObject(row.evidence_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createCloudflareRepositoryPublicationProviderHeartbeat(siteId, params = {}, principal = null) {
  const generatedAt = params.generated_at ?? params.last_run_at ?? new Date().toISOString();
  const providerId = String(params.provider_id ?? 'windows_repository_publication_drain_loop').trim();
  const status = String(params.status ?? '').trim();
  const cloudflareGitPushAdmission = String(params.cloudflare_git_push_admission ?? 'not_admitted');
  const directCloudflareRepositoryMutationAdmission = String(params.direct_cloudflare_repository_mutation_admission ?? 'not_admitted');
  return {
    repository_publication_provider_heartbeat_id: params.repository_publication_provider_heartbeat_id ?? `repository_publication_provider_heartbeat_${providerId}_${Date.now()}`,
    site_id: siteId,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_SCHEMA,
    generated_at: generatedAt,
    last_run_at: params.last_run_at ?? generatedAt,
    provider_id: providerId,
    provider_authority: params.provider_authority ?? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    provider_embodiment: params.provider_embodiment ?? params.embodiment ?? 'windows_current_user_startup_provider',
    provider_refresh_trigger: params.provider_refresh_trigger ?? 'not_observed',
    scheduler_task_name: params.scheduler_task_name ?? null,
    scheduler_interval_minutes: Number.isFinite(Number(params.scheduler_interval_minutes)) ? Number(params.scheduler_interval_minutes) : null,
    status,
    max_cycles: Number.isFinite(Number(params.max_cycles)) ? Number(params.max_cycles) : null,
    iteration_count: Number.isFinite(Number(params.iteration_count)) ? Number(params.iteration_count) : 0,
    completed_publication_count: Number.isFinite(Number(params.completed_publication_count)) ? Number(params.completed_publication_count) : 0,
    refused_publication_count: Number.isFinite(Number(params.refused_publication_count)) ? Number(params.refused_publication_count) : 0,
    resolved_publication_count: Number.isFinite(Number(params.resolved_publication_count)) ? Number(params.resolved_publication_count) : 0,
    drained: Boolean(params.drained),
    cloudflare_dispatch_authority: params.cloudflare_dispatch_authority ?? CLOUDFLARE_REPOSITORY_PUBLICATION_REQUEST_AUTHORITY,
    provider_liveness_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY,
    cloudflare_git_push_admission: cloudflareGitPushAdmission,
    direct_cloudflare_repository_mutation_admission: directCloudflareRepositoryMutationAdmission,
    recorded_by_principal_id: principal?.principal_id ?? params.recorded_by_principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
}

function classifyRepositoryPublicationProviderLiveness(heartbeats = [], { nowMs = Date.now(), staleAfterMs = DEFAULT_REPOSITORY_PUBLICATION_PROVIDER_STALE_AFTER_MS } = {}) {
  const heartbeat = Array.isArray(heartbeats) ? heartbeats[0] ?? null : null;
  if (!heartbeat) {
    return {
      schema: 'narada.sonar.cloudflare_repository_publication_provider_liveness.v1',
      state: 'missing',
      reason: 'repository_publication_provider_heartbeat_missing',
      provider_id: 'windows_repository_publication_drain_loop',
      provider_authority: WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
      provider_liveness_authority: 'not_observed',
      stale_after_ms: staleAfterMs,
      scheduler_posture: classifyProviderHeartbeatSchedulerPosture(null, { providerKind: 'repository_publication', providerLivenessState: 'missing' }),
    };
  }
  const observedAt = Date.parse(heartbeat.last_run_at ?? heartbeat.generated_at ?? heartbeat.recorded_at ?? '');
  const ageMs = Number.isFinite(observedAt) ? Math.max(0, nowMs - observedAt) : null;
  const status = heartbeat.status ?? 'unknown';
  const state = ageMs == null
    ? 'unknown'
    : ageMs > staleAfterMs ? 'stale' : status === 'failed' ? 'failed' : 'fresh';
  const schedulerPosture = classifyProviderHeartbeatSchedulerPosture(heartbeat, {
    providerKind: 'repository_publication',
    providerLivenessState: state,
  });
  return {
    schema: 'narada.sonar.cloudflare_repository_publication_provider_liveness.v1',
    state,
    reason: state === 'fresh' ? 'repository_publication_provider_heartbeat_recent' : `repository_publication_provider_heartbeat_${state}`,
    provider_id: heartbeat.provider_id ?? 'windows_repository_publication_drain_loop',
    provider_authority: heartbeat.provider_authority ?? WINDOWS_REPOSITORY_PUBLICATION_EXECUTOR_AUTHORITY,
    provider_embodiment: heartbeat.provider_embodiment ?? 'windows_current_user_startup_provider',
    provider_status: status,
    latest_heartbeat_id: heartbeat.repository_publication_provider_heartbeat_id ?? null,
    latest_heartbeat_at: heartbeat.last_run_at ?? heartbeat.generated_at ?? heartbeat.recorded_at ?? null,
    latest_heartbeat_age_ms: ageMs,
    stale_after_ms: staleAfterMs,
    provider_liveness_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY,
    scheduler_posture: schedulerPosture,
  };
}

async function recordCloudflareRepositoryPublicationProviderHeartbeat(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const heartbeat = createCloudflareRepositoryPublicationProviderHeartbeat(siteId, params, principal);
  if (!heartbeat.provider_id) return { ok: false, code: 'repository_publication_provider_heartbeat_provider_id_required' };
  if (!heartbeat.status) return { ok: false, code: 'repository_publication_provider_heartbeat_status_required' };
  if (heartbeat.cloudflare_git_push_admission !== 'not_admitted') return { ok: false, code: 'repository_publication_provider_heartbeat_cloudflare_git_push_admission_invalid', cloudflare_git_push_admission: heartbeat.cloudflare_git_push_admission };
  if (heartbeat.direct_cloudflare_repository_mutation_admission !== 'not_admitted') return { ok: false, code: 'repository_publication_provider_heartbeat_direct_cloudflare_repository_mutation_admission_invalid', direct_cloudflare_repository_mutation_admission: heartbeat.direct_cloudflare_repository_mutation_admission };
  await ensureCloudflareRepositoryPublicationProviderHeartbeatSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_repository_publication_provider_heartbeats (
      repository_publication_provider_heartbeat_id, site_id, generated_at, last_run_at,
      provider_id, provider_authority, provider_embodiment, status, heartbeat_json, recorded_by_principal_id, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repository_publication_provider_heartbeat_id) DO UPDATE SET
      last_run_at = excluded.last_run_at,
      status = excluded.status,
      heartbeat_json = excluded.heartbeat_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    heartbeat.repository_publication_provider_heartbeat_id,
    heartbeat.site_id,
    heartbeat.generated_at,
    heartbeat.last_run_at,
    heartbeat.provider_id,
    heartbeat.provider_authority,
    heartbeat.provider_embodiment,
    heartbeat.status,
    JSON.stringify(heartbeat),
    heartbeat.recorded_by_principal_id,
    heartbeat.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_SCHEMA,
    site_id: siteId,
    provider_liveness_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY,
    heartbeat,
  };
}

async function ensureCloudflareRepositoryPublicationProviderHeartbeatSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_repository_publication_provider_heartbeats (
      repository_publication_provider_heartbeat_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_run_at TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      provider_authority TEXT NOT NULL,
      provider_embodiment TEXT NOT NULL,
      status TEXT NOT NULL,
      heartbeat_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_repository_publication_provider_heartbeats_site_recorded
    ON cloudflare_repository_publication_provider_heartbeats(site_id, recorded_at)
  `).run();
}

async function listCloudflareRepositoryPublicationProviderHeartbeats(env = {}, siteId, limit = 20) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return [];
  if (!siteId || siteId === 'unknown-site') return [];
  await ensureCloudflareRepositoryPublicationProviderHeartbeatSchema(db);
  const boundedLimit = Math.max(1, Math.min(100, Number.parseInt(limit ?? 20, 10) || 20));
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_repository_publication_provider_heartbeats
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => {
    try {
      return JSON.parse(row.heartbeat_json);
    } catch {
      return {
        repository_publication_provider_heartbeat_id: row.repository_publication_provider_heartbeat_id,
        site_id: row.site_id,
        schema: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_HEARTBEAT_SCHEMA,
        generated_at: row.generated_at,
        last_run_at: row.last_run_at,
        provider_id: row.provider_id,
        provider_authority: row.provider_authority,
        provider_embodiment: row.provider_embodiment,
        status: row.status,
        provider_liveness_authority: CLOUDFLARE_REPOSITORY_PUBLICATION_PROVIDER_LIVENESS_AUTHORITY,
        recorded_by_principal_id: row.recorded_by_principal_id,
        recorded_at: row.recorded_at,
      };
    }
  });
}

async function recordCloudflareWebhookDelayShadowObservation(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  const record = {
    observation_id: params.observation_id ?? webhookDelayShadowObservationId(siteId, observation.observation),
    site_id: siteId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    source_locus: params.source_locus ?? 'windows_local_site',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    observation: observation.observation,
    classification,
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareWebhookDelayShadowObservationSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_shadow_observations (
      observation_id,
      site_id,
      source_locus,
      target_locus,
      generated_at,
      latest_delay_minutes,
      critical_minutes,
      classification_state,
      dispatch_authority,
      shadow_mode,
      dispatch_action,
      observation_json,
      classification_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      target_locus = excluded.target_locus,
      generated_at = excluded.generated_at,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      classification_state = excluded.classification_state,
      dispatch_authority = excluded.dispatch_authority,
      shadow_mode = excluded.shadow_mode,
      dispatch_action = excluded.dispatch_action,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.observation_id,
    record.site_id,
    record.source_locus,
    record.target_locus,
    record.observation.generated_at,
    record.classification.latest_delay_minutes,
    record.classification.critical_minutes,
    record.classification.state,
    record.dispatch_authority,
    record.shadow_mode,
    record.dispatch_action,
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation: record.observation,
    classification,
    record,
  };
}

async function ensureCloudflareWebhookDelayShadowObservationSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_shadow_observations (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      shadow_mode TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_shadow_observations_site_recorded
    ON cloudflare_webhook_delay_shadow_observations(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayShadowObservations(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayShadowObservationSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_shadow_observations
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    observation_id: row.observation_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_READ_SCHEMA,
    source_locus: row.source_locus,
    target_locus: row.target_locus,
    generated_at: row.generated_at,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    classification_state: row.classification_state,
    dispatch_authority: row.dispatch_authority,
    shadow_mode: row.shadow_mode,
    dispatch_action: row.dispatch_action,
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function recordCloudflareWebhookDelayObservationPrimaryRead(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayObservationPrimaryRead(observation.observation);
  const record = {
    observation_id: params.observation_id ?? webhookDelayObservationPrimaryReadId(siteId, observation.observation),
    site_id: siteId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    source_locus: params.source_locus ?? 'cloudflare_carrier_site',
    source_material_locus: params.source_material_locus ?? 'windows_local_site_summary',
    target_locus: params.target_locus ?? 'cloudflare_carrier_site',
    observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
    fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: 'available',
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation: observation.observation,
    classification,
    retained_windows_authority: ['windows_observation_refresh_fallback', 'mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: new Date().toISOString(),
  };
  await ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_observation_primary_reads (
      observation_id,
      site_id,
      source_locus,
      source_material_locus,
      target_locus,
      generated_at,
      latest_delay_minutes,
      critical_minutes,
      classification_state,
      observation_authority,
      fallback_authority,
      fallback_status,
      dispatch_authority,
      dispatch_action,
      observation_json,
      classification_json,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET
      source_locus = excluded.source_locus,
      source_material_locus = excluded.source_material_locus,
      target_locus = excluded.target_locus,
      generated_at = excluded.generated_at,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      classification_state = excluded.classification_state,
      observation_authority = excluded.observation_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      dispatch_authority = excluded.dispatch_authority,
      dispatch_action = excluded.dispatch_action,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.observation_id,
    record.site_id,
    record.source_locus,
    record.source_material_locus,
    record.target_locus,
    record.observation.generated_at,
    record.classification.latest_delay_minutes,
    record.classification.critical_minutes,
    record.classification.state,
    record.observation_authority,
    record.fallback_authority,
    record.fallback_status,
    record.dispatch_authority,
    record.dispatch_action,
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    status: 'cloudflare_primary_recorded',
    site_id: siteId,
    observation_authority: record.observation_authority,
    fallback_authority: record.fallback_authority,
    fallback_status: record.fallback_status,
    dispatch_authority: record.dispatch_authority,
    dispatch_action: record.dispatch_action,
    observation: record.observation,
    classification,
    record,
  };
}

async function ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_observation_primary_reads (
      observation_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_locus TEXT NOT NULL,
      source_material_locus TEXT NOT NULL,
      target_locus TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      classification_state TEXT NOT NULL,
      observation_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      dispatch_action TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_observation_primary_reads_site_recorded
    ON cloudflare_webhook_delay_observation_primary_reads(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayObservationPrimaryReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayObservationPrimaryReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_observation_primary_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, generated_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    observation_id: row.observation_id,
    site_id: row.site_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_SCHEMA,
    source_locus: row.source_locus,
    source_material_locus: row.source_material_locus,
    target_locus: row.target_locus,
    generated_at: row.generated_at,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    classification_state: row.classification_state,
    observation_authority: row.observation_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    dispatch_authority: row.dispatch_authority,
    dispatch_action: row.dispatch_action,
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function putCloudflareWebhookDelayRemoteSourceSamples(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const sourceAdapterId = params.source_adapter_id ?? 'sonar_webhook_delay_d1_remote_source_v1';
  const rawSamples = Array.isArray(params.samples) ? params.samples : [params.sample ?? params].filter(Boolean);
  const samples = rawSamples.map((sample, index) => normalizeWebhookDelayRemoteSourceSample(siteId, sourceAdapterId, sample, index));
  if (samples.length === 0) return { ok: false, code: 'webhook_delay_remote_source_samples_missing' };
  if (samples.some((sample) => !sample.ok)) return samples.find((sample) => !sample.ok);
  await ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db);
  const recordedAt = new Date().toISOString();
  for (const { sample } of samples) {
    await db.prepare(`
      INSERT INTO cloudflare_webhook_delay_remote_source_samples (
        sample_id,
        site_id,
        source_adapter_id,
        sample_role,
        observed_at,
        observed_at_ct,
        elapsed_minutes,
        delay_minutes,
        sample_json,
        recorded_by_principal_id,
        recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sample_id) DO UPDATE SET
        sample_role = excluded.sample_role,
        observed_at = excluded.observed_at,
        observed_at_ct = excluded.observed_at_ct,
        elapsed_minutes = excluded.elapsed_minutes,
        delay_minutes = excluded.delay_minutes,
        sample_json = excluded.sample_json,
        recorded_by_principal_id = excluded.recorded_by_principal_id,
        recorded_at = excluded.recorded_at
    `).bind(
      sample.sample_id,
      sample.site_id,
      sample.source_adapter_id,
      sample.sample_role,
      sample.observed_at,
      sample.observed_at_ct,
      sample.elapsed_minutes,
      sample.delay_minutes,
      JSON.stringify(sample),
      principal?.principal_id ?? 'unknown-principal',
      recordedAt,
    ).run();
  }
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
    status: 'samples_recorded',
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    sample_count: samples.length,
    samples: samples.map(({ sample }) => sample),
  };
}

async function readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const sourceAdapterId = params.source_adapter_id ?? 'sonar_webhook_delay_d1_remote_source_v1';
  const sourceMaterialLocus = params.source_material_locus ?? 'cloudflare_remote_source_adapter';
  const samples = await listCloudflareWebhookDelayRemoteSourceSamples(env, siteId, sourceAdapterId, params.sample_limit ?? 200);
  if (samples.length === 0) return { ok: false, code: 'webhook_delay_remote_source_samples_missing', source_adapter_id: sourceAdapterId };
  const summary = createWebhookDelaySummaryFromRemoteSourceSamples(siteId, samples, params);
  const result = await recordCloudflareWebhookDelayObservationPrimaryRead(env, siteId, {
    ...params,
    observation_id: params.observation_id ?? `webhook_delay_remote_source_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(summary.generated_at)}`,
    source_summary_path: null,
    source_locus: 'cloudflare_carrier_site',
    source_material_locus: sourceMaterialLocus,
    summary,
  }, principal);
  if (!result.ok) return result;
  return {
    ...result,
    schema: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_SCHEMA,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    source_material_locus: sourceMaterialLocus,
    source_sample_count: samples.length,
    source_samples: samples,
  };
}

async function readCloudflareWebhookDelayDirectRemoteMetricSource(env = {}, siteId, params = {}, principal = null) {
  const sourceUrl = resolveDirectMetricSourceUrl(env, params);
  if (!sourceUrl) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_url_missing' };
  const sourceAdapterId = params.source_adapter_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_direct_remote_metric_source_v1';
  const sourceId = params.source_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ID ?? 'sonar_webhook_delay_direct_remote_metric_source';
  const fetched = await fetchWebhookDelayDirectMetricSource(env, sourceUrl, params);
  if (!fetched.ok) return fetched;
  const samples = createWebhookDelayDirectMetricSourceSamples(siteId, sourceAdapterId, sourceId, sourceUrl, fetched.body, params);
  if (!samples.ok) return samples;
  const put = await putCloudflareWebhookDelayRemoteSourceSamples(env, siteId, { source_adapter_id: sourceAdapterId, samples: samples.samples }, principal);
  if (!put.ok) return put;
  const read = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, siteId, {
    ...params,
    source_adapter_id: sourceAdapterId,
    source_material_locus: 'direct_remote_metric_source',
    observation_id: params.observation_id ?? `webhook_delay_direct_remote_metric_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(samples.generated_at)}`,
    generated_at: params.generated_at ?? samples.generated_at,
  }, principal);
  if (!read.ok) return read;
  return {
    ...read,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_SCHEMA,
    status: 'direct_remote_metric_source_recorded',
    source_id: sourceId,
    source_adapter_id: sourceAdapterId,
    source_authority: CLOUDFLARE_WEBHOOK_DELAY_DIRECT_REMOTE_METRIC_SOURCE_AUTHORITY,
    source_material_locus: 'direct_remote_metric_source',
    direct_source_url_host: safeUrlHost(sourceUrl),
    direct_source_sample_count: samples.samples.length,
    source_sample_count: samples.samples.length,
    put,
  };
}

function resolveDirectMetricSourceUrl(env = {}, params = {}) {
  if (env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_URL) return env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_URL;
  if (env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_ALLOW_OPERATOR_URL === '1' && params.source_url) return params.source_url;
  return null;
}

async function fetchWebhookDelayDirectMetricSource(env = {}, sourceUrl, params = {}) {
  const headers = { accept: 'application/json' };
  const token = params.source_token ?? env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_TOKEN ?? null;
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(sourceUrl, { method: 'GET', headers });
  const body = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_fetch_failed', http_status: response.status, body };
  if (!body || typeof body !== 'object') return { ok: false, code: 'webhook_delay_direct_remote_metric_source_invalid_json' };
  return { ok: true, body };
}

function createWebhookDelayDirectMetricSourceSamples(siteId, sourceAdapterId, sourceId, sourceUrl, body = {}, params = {}) {
  const rows = Array.isArray(body.samples) ? body.samples
    : Array.isArray(body.rows) ? body.rows
      : Array.isArray(body.observations) ? body.observations
        : [];
  if (rows.length === 0) return { ok: false, code: 'webhook_delay_direct_remote_metric_source_rows_missing' };
  const generatedAt = params.generated_at ?? body.generated_at ?? new Date().toISOString();
  const sourceHost = safeUrlHost(sourceUrl);
  const samples = rows.map((row, index) => {
    const observedAt = row.observed_at ?? row.created_at ?? row.at ?? row.last_event_datetime_that_arrived ?? generatedAt;
    return {
      sample_id: row.sample_id ?? `webhook_delay_direct_metric_sample_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(observedAt)}_${index}`,
      sample_role: row.sample_role ?? row.role ?? (index === rows.length - 1 ? 'today_latest' : 'historical_source_row'),
      observed_at: observedAt,
      observed_at_ct: row.observed_at_ct ?? row.at_ct ?? null,
      elapsed_minutes: row.elapsed_minutes ?? null,
      delay_minutes: row.delay_minutes ?? row.delayMinutes ?? row.latest?.delay_minutes,
      source_record: {
        source_id: sourceId,
        source_schema: body.schema ?? null,
        direct_source_url_host: sourceHost,
        source_record_id: row.id ?? row.sample_id ?? null,
        last_event_datetime_that_arrived: row.last_event_datetime_that_arrived ?? null,
      },
    };
  });
  return { ok: true, generated_at: generatedAt, samples };
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return 'unknown-host';
  }
}

async function runCloudflareWebhookDelayScheduledSourceRead(env = {}, params = {}, principal = null) {
  if (env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_READ_ENABLED !== '1') {
    return { ok: true, schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA, status: 'disabled' };
  }
  const siteId = params.site_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SITE_ID ?? env.CLOUDFLARE_CARRIER_SITE_ID ?? 'site_narada_cloudflare';
  const sourceAdapterId = params.source_adapter_id ?? env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_ADAPTER_ID ?? 'sonar_webhook_delay_windows_readonly_db_summary_feed_v1';
  const criticalMinutes = Number(params.critical_minutes ?? env.CLOUDFLARE_WEBHOOK_DELAY_CRITICAL_MINUTES ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  const scheduledAt = params.scheduled_time ?? params.scheduled_at ?? new Date().toISOString();
  const runId = params.scheduled_run_id ?? `webhook_delay_scheduled_source_read_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(scheduledAt)}`;
  const observationId = params.observation_id ?? `webhook_delay_scheduled_source_observation_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(scheduledAt)}`;
  const triggerKind = params.trigger_kind ?? 'operator_requested';
  const cron = params.cron ?? null;
  let read = null;
  let status = 'failed';
  let failureCode = null;
  try {
    read = await readCloudflareWebhookDelayRemoteSourceWithWindowsFallback(env, siteId, {
      ...params,
      source_adapter_id: sourceAdapterId,
      observation_id: observationId,
      critical_minutes: criticalMinutes,
      generated_at: params.generated_at ?? scheduledAt,
    }, principal ?? { principal_id: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY });
    status = read.ok ? 'cloudflare_scheduled_read_recorded' : 'failed';
    failureCode = read.ok ? null : read.code ?? 'scheduled_remote_source_read_failed';
  } catch (error) {
    read = { ok: false, code: 'scheduled_remote_source_read_exception', error: error?.message ?? String(error) };
    failureCode = read.code;
  }
  const record = {
    schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
    scheduled_run_id: runId,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    observation_id: read?.observation?.observation_id ?? read?.record?.observation_id ?? observationId,
    trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
    trigger_kind: triggerKind,
    cron,
    scheduled_at: scheduledAt,
    status,
    failure_code: failureCode,
    source_material_locus: read?.source_material_locus ?? 'cloudflare_remote_source_adapter',
    source_authority: read?.source_authority ?? CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
    source_sample_count: read?.source_sample_count ?? null,
    classification_state: read?.classification?.state ?? null,
    latest_delay_minutes: numberOrNull(read?.observation?.latest?.delay_minutes),
    critical_minutes: Number.isFinite(criticalMinutes) ? criticalMinutes : DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES,
    fallback_authority: read?.fallback_authority ?? WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: read?.fallback_status ?? 'available',
    read,
  };
  const persisted = await recordCloudflareWebhookDelayScheduledSourceRead(env, siteId, record, principal ?? { principal_id: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY });
  if (!persisted.ok) return persisted;
  return {
    ok: read?.ok === true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_SOURCE_READ_SCHEMA,
    status,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    scheduled_run_id: runId,
    observation_id: record.observation_id,
    trigger_authority: CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_TRIGGER_AUTHORITY,
    source_material_locus: record.source_material_locus,
    source_authority: record.source_authority,
    source_sample_count: record.source_sample_count,
    classification_state: record.classification_state,
    fallback_authority: record.fallback_authority,
    fallback_status: record.fallback_status,
    failure_code: failureCode,
    record,
  };
}

async function recordCloudflareWebhookDelayScheduledSourceRead(env = {}, siteId, record, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareWebhookDelayScheduledSourceReadSchema(db);
  const recordedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_scheduled_source_reads (
      scheduled_run_id,
      site_id,
      source_adapter_id,
      observation_id,
      trigger_authority,
      trigger_kind,
      cron,
      scheduled_at,
      run_status,
      failure_code,
      source_material_locus,
      source_authority,
      source_sample_count,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      fallback_authority,
      fallback_status,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scheduled_run_id) DO UPDATE SET
      run_status = excluded.run_status,
      failure_code = excluded.failure_code,
      source_sample_count = excluded.source_sample_count,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      fallback_status = excluded.fallback_status,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.scheduled_run_id,
    siteId,
    record.source_adapter_id,
    record.observation_id,
    record.trigger_authority,
    record.trigger_kind,
    record.cron,
    record.scheduled_at,
    record.status,
    record.failure_code,
    record.source_material_locus,
    record.source_authority,
    record.source_sample_count,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.fallback_authority,
    record.fallback_status,
    JSON.stringify(record),
    principal?.principal_id ?? 'unknown-principal',
    recordedAt,
  ).run();
  return { ok: true, record: { ...record, recorded_at: recordedAt } };
}

async function listCloudflareWebhookDelayScheduledSourceReads(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayScheduledSourceReadSchema(db);
  const boundedLimit = clampInteger(limit, 0, 500, 100);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_scheduled_source_reads
    WHERE site_id = ?
    ORDER BY recorded_at DESC, scheduled_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    scheduled_run_id: row.scheduled_run_id,
    site_id: row.site_id,
    source_adapter_id: row.source_adapter_id,
    observation_id: row.observation_id,
    trigger_authority: row.trigger_authority,
    trigger_kind: row.trigger_kind,
    cron: row.cron,
    scheduled_at: row.scheduled_at,
    status: row.run_status,
    failure_code: row.failure_code,
    source_material_locus: row.source_material_locus,
    source_authority: row.source_authority,
    source_sample_count: numberOrNull(row.source_sample_count),
    classification_state: row.classification_state,
    latest_delay_minutes: numberOrNull(row.latest_delay_minutes),
    critical_minutes: numberOrNull(row.critical_minutes),
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function ensureCloudflareWebhookDelayScheduledSourceReadSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_scheduled_source_reads (
      scheduled_run_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      observation_id TEXT NOT NULL,
      trigger_authority TEXT NOT NULL,
      trigger_kind TEXT NOT NULL,
      cron TEXT,
      scheduled_at TEXT NOT NULL,
      run_status TEXT NOT NULL,
      failure_code TEXT,
      source_material_locus TEXT NOT NULL,
      source_authority TEXT NOT NULL,
      source_sample_count INTEGER,
      classification_state TEXT,
      latest_delay_minutes REAL,
      critical_minutes REAL NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_scheduled_source_reads_site_recorded
    ON cloudflare_webhook_delay_scheduled_source_reads(site_id, recorded_at)
  `).run();
}

async function ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_remote_source_samples (
      sample_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL,
      sample_role TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      observed_at_ct TEXT,
      elapsed_minutes REAL,
      delay_minutes REAL NOT NULL,
      sample_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_remote_source_samples_site_adapter_observed
    ON cloudflare_webhook_delay_remote_source_samples(site_id, source_adapter_id, observed_at)
  `).run();
}

async function listCloudflareWebhookDelayRemoteSourceSamples(env = {}, siteId, sourceAdapterId = 'sonar_webhook_delay_d1_remote_source_v1', limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayRemoteSourceSampleSchema(db);
  const boundedLimit = clampInteger(limit, 0, 500, 100);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_remote_source_samples
    WHERE site_id = ? AND source_adapter_id = ?
    ORDER BY observed_at DESC, recorded_at DESC
    LIMIT ?
  `).bind(siteId, sourceAdapterId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    sample_id: row.sample_id,
    site_id: row.site_id,
    source_adapter_id: row.source_adapter_id,
    sample_role: row.sample_role,
    observed_at: row.observed_at,
    observed_at_ct: row.observed_at_ct,
    elapsed_minutes: numberOrNull(row.elapsed_minutes),
    delay_minutes: Number(row.delay_minutes),
    sample: parseJsonObject(row.sample_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function normalizeWebhookDelayRemoteSourceSample(siteId, sourceAdapterId, input = {}, index = 0) {
  const delayMinutes = Number(input.delay_minutes ?? input.delayMinutes ?? input.latest?.delay_minutes);
  if (!Number.isFinite(delayMinutes)) return { ok: false, code: 'webhook_delay_remote_source_sample_delay_minutes_missing' };
  const observedAt = String(input.observed_at ?? input.at ?? input.latest?.at ?? new Date().toISOString());
  const sampleRole = input.sample_role ?? input.role ?? 'today_latest';
  const sample = {
    schema: 'narada.sonar.webhook_delay_remote_source_sample.v1',
    sample_id: input.sample_id ?? `webhook_delay_source_sample_${safeIdToken(siteId)}_${safeIdToken(sourceAdapterId)}_${safeIdToken(observedAt)}_${index}`,
    site_id: siteId,
    source_adapter_id: sourceAdapterId,
    sample_role: sampleRole,
    observed_at: observedAt,
    observed_at_ct: input.observed_at_ct ?? input.at_ct ?? input.latest?.at_ct ?? null,
    elapsed_minutes: numberOrNull(input.elapsed_minutes ?? input.latest?.elapsed_minutes),
    delay_minutes: delayMinutes,
    source_record: input.source_record ?? null,
  };
  return { ok: true, sample };
}

function createWebhookDelaySummaryFromRemoteSourceSamples(siteId, samples = [], params = {}) {
  const sorted = [...samples].sort((left, right) => String(right.observed_at).localeCompare(String(left.observed_at)));
  const latest = sorted.find((sample) => sample.sample_role === 'today_latest') ?? sorted[0];
  const comparison = sorted.find((sample) => sample.sample_role === 'yesterday_same_clock') ?? null;
  const latestDelay = Number(latest.delay_minutes);
  const comparisonDelay = comparison ? Number(comparison.delay_minutes) : null;
  return {
    schema: 'narada.sonar/webhook-delay-remote-source-adapter/v1',
    generated_at: params.generated_at ?? new Date().toISOString(),
    source_adapter: {
      adapter_id: latest.source_adapter_id,
      authority: CLOUDFLARE_WEBHOOK_DELAY_REMOTE_SOURCE_AUTHORITY,
      site_id: siteId,
      sample_count: samples.length,
    },
    rows72: samples.length,
    today: {
      rows: samples.filter((sample) => sample.sample_role === 'today_latest').length || null,
      latest: {
        at: latest.observed_at,
        at_ct: latest.observed_at_ct,
        elapsed_minutes: latest.elapsed_minutes,
        delay_minutes: latestDelay,
      },
    },
    yesterday_same_clock: comparison ? {
      rows: 1,
      at: comparison.observed_at,
      at_ct: comparison.observed_at_ct,
      elapsed_minutes: comparison.elapsed_minutes,
      delay_minutes: comparisonDelay,
      delta_minutes_today_minus_yesterday: Number.isFinite(comparisonDelay) ? latestDelay - comparisonDelay : null,
    } : null,
  };
}

function createWebhookDelayShadowObservation(siteId, params = {}) {
  const summary = params.summary ?? params.observation ?? {};
  const latest = summary.today?.latest ?? params.latest ?? {};
  const latestDelayMinutes = Number(params.latest_delay_minutes ?? latest.delay_minutes);
  if (!Number.isFinite(latestDelayMinutes)) return { ok: false, code: 'webhook_delay_latest_delay_minutes_missing' };
  const criticalMinutes = Number(params.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  if (!Number.isFinite(criticalMinutes) || criticalMinutes <= 0) return { ok: false, code: 'webhook_delay_critical_minutes_invalid' };
  const generatedAt = String(params.generated_at ?? summary.generated_at ?? new Date().toISOString());
  return {
    ok: true,
    observation: {
      schema: 'narada.sonar.webhook_delay_observation.v1',
      site_id: siteId,
      source_schema: summary.schema ?? null,
      source_summary_path: params.source_summary_path ?? params.summary_path ?? null,
      generated_at: generatedAt,
      rows72: numberOrNull(summary.rows72 ?? params.rows72),
      latest: {
        at: latest.at ?? params.latest_at ?? null,
        at_ct: latest.at_ct ?? params.latest_at_ct ?? null,
        elapsed_minutes: numberOrNull(latest.elapsed_minutes ?? params.latest_elapsed_minutes),
        delay_minutes: latestDelayMinutes,
      },
      yesterday_same_clock: summary.yesterday_same_clock ?? params.yesterday_same_clock ?? null,
      critical_minutes: criticalMinutes,
    },
  };
}

function classifyWebhookDelayShadowObservation(observation) {
  const latestDelayMinutes = Number(observation?.latest?.delay_minutes);
  const criticalMinutes = Number(observation?.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  const state = Number.isFinite(latestDelayMinutes) && latestDelayMinutes >= criticalMinutes ? 'critical' : 'ok';
  return {
    schema: 'narada.sonar.webhook_delay_classification.v1',
    state,
    reason: state === 'critical' ? 'webhook_delay_critical_threshold_crossed' : 'webhook_delay_below_critical_threshold',
    latest_delay_minutes: latestDelayMinutes,
    critical_minutes: criticalMinutes,
    dispatch_authority: WINDOWS_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    shadow_mode: CLOUDFLARE_WEBHOOK_DELAY_SHADOW_MODE,
  };
}

function classifyWebhookDelayObservationPrimaryRead(observation) {
  const classification = classifyWebhookDelayShadowObservation(observation);
  return {
    ...classification,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    dispatch_action: 'none',
    observation_authority: CLOUDFLARE_WEBHOOK_DELAY_OBSERVATION_PRIMARY_AUTHORITY,
    fallback_authority: WINDOWS_OBSERVATION_READ_FALLBACK_AUTHORITY,
    fallback_status: 'available',
    read_mode: 'cloudflare_primary_with_windows_fallback',
  };
}

function webhookDelayShadowObservationId(siteId, observation) {
  return `webhook_delay_shadow_${safeIdToken(siteId)}_${safeIdToken(observation.generated_at)}_${safeIdToken(observation.latest.delay_minutes)}`;
}

function webhookDelayObservationPrimaryReadId(siteId, observation) {
  return `webhook_delay_observation_primary_${safeIdToken(siteId)}_${safeIdToken(observation.generated_at)}_${safeIdToken(observation.latest.delay_minutes)}`;
}

async function recordCloudflareWebhookDelayDirectiveDualRecord(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  if (classification.state !== 'critical') return { ok: false, code: 'webhook_delay_directive_requires_critical_classification', classification };

  const now = new Date().toISOString();
  const operationId = params.operation_id ?? null;
  const directiveRecordId = params.directive_record_id ?? webhookDelayDirectiveRecordId(siteId, operationId, observation.observation.generated_at);
  const directiveId = params.directive_id ?? `directive_webhook_delay_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const inputEventId = params.input_event_id ?? `input_webhook_delay_directive_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const thresholdPolicy = createWebhookDelayThresholdPolicy(params, classification);
  const directiveIntent = createWebhookDelayDirectiveIntent({
    siteId,
    operationId,
    directiveId,
    inputEventId,
    observation: observation.observation,
    classification,
    thresholdPolicy,
    createdAt: now,
    principal,
  });
  const carrierAdmission = classifyCarrierInputAdmission(directiveIntent.input_event, { activeTurn: false, observerMuted: false });
  const record = {
    directive_record_id: directiveRecordId,
    site_id: siteId,
    operation_id: operationId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    threshold_policy: thresholdPolicy,
    observation: observation.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    classification_state: classification.state,
    critical_minutes: classification.critical_minutes,
    latest_delay_minutes: classification.latest_delay_minutes,
    directive_action: 'record_directive_emission_intent',
    directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: 'available',
    migrated_authority: 'directive_emission_intent_only',
    retained_windows_authority: ['mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write', 'windows_fallback_dispatch'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_directive_dual_records (
      directive_record_id,
      site_id,
      operation_id,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      directive_action,
      directive_authority,
      fallback_authority,
      fallback_status,
      threshold_policy_json,
      observation_json,
      classification_json,
      directive_intent_json,
      carrier_admission_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(directive_record_id) DO UPDATE SET
      operation_id = excluded.operation_id,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      directive_action = excluded.directive_action,
      directive_authority = excluded.directive_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      threshold_policy_json = excluded.threshold_policy_json,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      directive_intent_json = excluded.directive_intent_json,
      carrier_admission_json = excluded.carrier_admission_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.directive_record_id,
    record.site_id,
    record.operation_id,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.directive_action,
    record.directive_authority,
    record.fallback_authority,
    record.fallback_status,
    JSON.stringify(record.threshold_policy),
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record.directive_intent),
    JSON.stringify(record.carrier_admission),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return {
    ok: true,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    status: 'recorded',
    site_id: siteId,
    operation_id: operationId,
    directive_action: record.directive_action,
    directive_authority: CLOUDFLARE_DIRECTIVE_DUAL_RECORD_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    threshold_policy: thresholdPolicy,
    observation: record.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    record,
  };
}

async function ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_dual_records (
      directive_record_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_action TEXT NOT NULL,
      directive_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_directive_dual_records_site_recorded
    ON cloudflare_webhook_delay_directive_dual_records(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayDirectiveDualRecords(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayDirectiveDualRecordSchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_directive_dual_records
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    directive_record_id: row.directive_record_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_DUAL_RECORD_SCHEMA,
    classification_state: row.classification_state,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    directive_action: row.directive_action,
    directive_authority: row.directive_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    threshold_policy: parseJsonObject(row.threshold_policy_json),
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    directive_intent: parseJsonObject(row.directive_intent_json),
    carrier_admission: parseJsonObject(row.carrier_admission_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

async function deliverCloudflareWebhookDelayDirectiveWithWindowsFallback(env = {}, siteId, params = {}, principal = null) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  if (!siteId || siteId === 'unknown-site') return { ok: false, code: 'missing_site_id' };
  const observation = createWebhookDelayShadowObservation(siteId, params);
  if (!observation.ok) return observation;
  const classification = classifyWebhookDelayShadowObservation(observation.observation);
  if (classification.state !== 'critical') return { ok: false, code: 'webhook_delay_directive_delivery_requires_critical_classification', classification };

  const now = new Date().toISOString();
  const nowToken = now.replace(/[-:.TZ]/g, '').slice(0, 14);
  const operationId = params.operation_id ?? 'operation_narada_cloudflare_control';
  const carrierSessionId = params.carrier_session_id ?? `carrier_session_webhook_delay_directive_${nowToken}`;
  const deliveryId = params.delivery_id ?? `webhook_delay_directive_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(carrierSessionId)}`;
  const directiveRecordId = params.directive_record_id ?? webhookDelayDirectiveRecordId(siteId, operationId, observation.observation.generated_at);
  const directiveId = params.directive_id ?? `directive_webhook_delay_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const inputEventId = params.input_event_id ?? `input_webhook_delay_directive_delivery_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(now)}`;
  const thresholdPolicy = createWebhookDelayThresholdPolicy(params, classification);
  const directiveIntent = createWebhookDelayDirectiveIntent({
    siteId,
    operationId,
    directiveId,
    inputEventId,
    observation: observation.observation,
    classification,
    thresholdPolicy,
    createdAt: now,
    principal,
    directiveVisibility: params.directive_visibility ?? 'agent_visible',
    carrierInputOperation: 'carrier.input.deliver',
    deliverySemantics: 'cloudflare_primary_delivery',
    authorityRef: 'cloudflare-carrier:authority/webhook-delay-directive-primary-with-windows-fallback:v1',
  });
  const carrierAdmission = classifyCarrierInputAdmission(directiveIntent.input_event, { activeTurn: false, observerMuted: false });
  const sessionStart = {
    operation: 'session.start',
    request_id: params.session_start_request_id ?? `request_webhook_delay_directive_session_start_${nowToken}`,
    params: {
      carrier_session_id: carrierSessionId,
      agent_id: params.agent_id ?? 'narada.cloudflare.webhook_delay.directive',
      site_id: siteId,
      site_root: params.site_root ?? params.site_ref ?? `cloudflare://${siteId}`,
      site_ref: params.site_ref ?? `cloudflare://${siteId}`,
      operation_id: operationId,
    },
  };
  const sessionStartRouted = await routeCarrierSessionRequest('https://carrier.webhook-delay-directive.local/api/carrier', sessionStart, principal, env);
  const sessionStarted = sessionStartRouted.status >= 200 && sessionStartRouted.status < 300 && sessionStartRouted.body?.ok !== false;
  const deliveryRequest = {
    operation: 'carrier.input.deliver',
    request_id: params.delivery_request_id ?? `request_webhook_delay_directive_delivery_${nowToken}`,
    carrier_session_id: carrierSessionId,
    params: {
      site_id: siteId,
      operation_id: operationId,
      input: directiveIntent.input_event,
    },
  };
  const delivered = sessionStarted
    ? await routeCarrierSessionRequest('https://carrier.webhook-delay-directive.local/api/carrier', deliveryRequest, principal, env)
    : { status: 424, body: { ok: false, code: 'cloudflare_session_start_required_before_directive_delivery' } };
  const cloudflareDelivered = delivered.status >= 200 && delivered.status < 300 && delivered.body?.ok !== false && delivered.body?.admitted === true;
  const record = {
    delivery_id: deliveryId,
    directive_record_id: directiveRecordId,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    delivery_state: cloudflareDelivered ? 'cloudflare_primary_delivered' : 'cloudflare_primary_failed_windows_fallback_available',
    threshold_policy: thresholdPolicy,
    observation: observation.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    classification_state: classification.state,
    critical_minutes: classification.critical_minutes,
    latest_delay_minutes: classification.latest_delay_minutes,
    directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: 'available',
    delivery_action: 'cloudflare_carrier_input_deliver',
    session_start_status: sessionStartRouted.status,
    session_start_ok: sessionStartRouted.body?.ok === true,
    session_start_body: sessionStartRouted.body,
    delivery_status: delivered.status,
    delivery_ok: delivered.body?.ok === true,
    delivery_body: delivered.body,
    migrated_authority: 'webhook_delay_directive_delivery',
    retained_windows_authority: ['mailbox_send', 'local_filesystem_mutation', 'task_lifecycle_write', 'windows_fallback_dispatch'],
    recorded_by_principal_id: principal?.principal_id ?? 'unknown-principal',
    recorded_at: now,
  };
  await recordCloudflareWebhookDelayDirectiveDelivery(env, record);
  return {
    ok: cloudflareDelivered,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    status: record.delivery_state,
    site_id: siteId,
    operation_id: operationId,
    carrier_session_id: carrierSessionId,
    directive_authority: CLOUDFLARE_DIRECTIVE_PRIMARY_AUTHORITY,
    dispatch_authority: CLOUDFLARE_PRIMARY_DISPATCH_AUTHORITY,
    fallback_authority: WINDOWS_FALLBACK_DISPATCH_AUTHORITY,
    fallback_status: record.fallback_status,
    delivery_action: record.delivery_action,
    threshold_policy: thresholdPolicy,
    observation: record.observation,
    classification,
    directive_intent: directiveIntent,
    carrier_admission: carrierAdmission,
    session_start: sessionStartRouted.body,
    delivery: delivered.body,
    record,
  };
}

async function recordCloudflareWebhookDelayDirectiveDelivery(env = {}, record) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_site_registry_binding' };
  await ensureCloudflareWebhookDelayDirectiveDeliverySchema(db);
  await db.prepare(`
    INSERT INTO cloudflare_webhook_delay_directive_deliveries (
      delivery_id,
      directive_record_id,
      site_id,
      operation_id,
      carrier_session_id,
      delivery_state,
      classification_state,
      latest_delay_minutes,
      critical_minutes,
      directive_authority,
      dispatch_authority,
      fallback_authority,
      fallback_status,
      delivery_action,
      session_start_status,
      session_start_ok,
      delivery_status,
      delivery_ok,
      threshold_policy_json,
      observation_json,
      classification_json,
      directive_intent_json,
      carrier_admission_json,
      session_start_json,
      delivery_json,
      record_json,
      recorded_by_principal_id,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(delivery_id) DO UPDATE SET
      directive_record_id = excluded.directive_record_id,
      operation_id = excluded.operation_id,
      carrier_session_id = excluded.carrier_session_id,
      delivery_state = excluded.delivery_state,
      classification_state = excluded.classification_state,
      latest_delay_minutes = excluded.latest_delay_minutes,
      critical_minutes = excluded.critical_minutes,
      directive_authority = excluded.directive_authority,
      dispatch_authority = excluded.dispatch_authority,
      fallback_authority = excluded.fallback_authority,
      fallback_status = excluded.fallback_status,
      delivery_action = excluded.delivery_action,
      session_start_status = excluded.session_start_status,
      session_start_ok = excluded.session_start_ok,
      delivery_status = excluded.delivery_status,
      delivery_ok = excluded.delivery_ok,
      threshold_policy_json = excluded.threshold_policy_json,
      observation_json = excluded.observation_json,
      classification_json = excluded.classification_json,
      directive_intent_json = excluded.directive_intent_json,
      carrier_admission_json = excluded.carrier_admission_json,
      session_start_json = excluded.session_start_json,
      delivery_json = excluded.delivery_json,
      record_json = excluded.record_json,
      recorded_by_principal_id = excluded.recorded_by_principal_id,
      recorded_at = excluded.recorded_at
  `).bind(
    record.delivery_id,
    record.directive_record_id,
    record.site_id,
    record.operation_id,
    record.carrier_session_id,
    record.delivery_state,
    record.classification_state,
    record.latest_delay_minutes,
    record.critical_minutes,
    record.directive_authority,
    record.dispatch_authority,
    record.fallback_authority,
    record.fallback_status,
    record.delivery_action,
    record.session_start_status,
    record.session_start_ok ? 1 : 0,
    record.delivery_status,
    record.delivery_ok ? 1 : 0,
    JSON.stringify(record.threshold_policy),
    JSON.stringify(record.observation),
    JSON.stringify(record.classification),
    JSON.stringify(record.directive_intent),
    JSON.stringify(record.carrier_admission),
    JSON.stringify(record.session_start_body),
    JSON.stringify(record.delivery_body),
    JSON.stringify(record),
    record.recorded_by_principal_id,
    record.recorded_at,
  ).run();
  return { ok: true };
}

async function ensureCloudflareWebhookDelayDirectiveDeliverySchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_webhook_delay_directive_deliveries (
      delivery_id TEXT PRIMARY KEY,
      directive_record_id TEXT,
      site_id TEXT NOT NULL,
      operation_id TEXT,
      carrier_session_id TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      classification_state TEXT NOT NULL,
      latest_delay_minutes REAL NOT NULL,
      critical_minutes REAL NOT NULL,
      directive_authority TEXT NOT NULL,
      dispatch_authority TEXT NOT NULL,
      fallback_authority TEXT NOT NULL,
      fallback_status TEXT NOT NULL,
      delivery_action TEXT NOT NULL,
      session_start_status INTEGER NOT NULL,
      session_start_ok INTEGER NOT NULL,
      delivery_status INTEGER NOT NULL,
      delivery_ok INTEGER NOT NULL,
      threshold_policy_json TEXT NOT NULL,
      observation_json TEXT NOT NULL,
      classification_json TEXT NOT NULL,
      directive_intent_json TEXT NOT NULL,
      carrier_admission_json TEXT NOT NULL,
      session_start_json TEXT NOT NULL,
      delivery_json TEXT NOT NULL,
      record_json TEXT NOT NULL,
      recorded_by_principal_id TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_webhook_delay_directive_deliveries_site_recorded
    ON cloudflare_webhook_delay_directive_deliveries(site_id, recorded_at)
  `).run();
}

async function listCloudflareWebhookDelayDirectiveDeliveries(env = {}, siteId, limit) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  await ensureCloudflareWebhookDelayDirectiveDeliverySchema(db);
  const boundedLimit = clampInteger(limit, 0, 100, 25);
  const rows = await db.prepare(`
    SELECT * FROM cloudflare_webhook_delay_directive_deliveries
    WHERE site_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `).bind(siteId, boundedLimit).all();
  return (rows.results ?? []).map((row) => ({
    delivery_id: row.delivery_id,
    directive_record_id: row.directive_record_id,
    site_id: row.site_id,
    operation_id: row.operation_id,
    carrier_session_id: row.carrier_session_id,
    schema: CLOUDFLARE_WEBHOOK_DELAY_DIRECTIVE_PRIMARY_SCHEMA,
    delivery_state: row.delivery_state,
    classification_state: row.classification_state,
    latest_delay_minutes: Number(row.latest_delay_minutes),
    critical_minutes: Number(row.critical_minutes),
    directive_authority: row.directive_authority,
    dispatch_authority: row.dispatch_authority,
    fallback_authority: row.fallback_authority,
    fallback_status: row.fallback_status,
    delivery_action: row.delivery_action,
    session_start_status: Number(row.session_start_status),
    session_start_ok: Boolean(row.session_start_ok),
    delivery_status: Number(row.delivery_status),
    delivery_ok: Boolean(row.delivery_ok),
    threshold_policy: parseJsonObject(row.threshold_policy_json),
    observation: parseJsonObject(row.observation_json),
    classification: parseJsonObject(row.classification_json),
    directive_intent: parseJsonObject(row.directive_intent_json),
    carrier_admission: parseJsonObject(row.carrier_admission_json),
    session_start: parseJsonObject(row.session_start_json),
    delivery: parseJsonObject(row.delivery_json),
    record: parseJsonObject(row.record_json),
    recorded_by_principal_id: row.recorded_by_principal_id,
    recorded_at: row.recorded_at,
  }));
}

function createWebhookDelayThresholdPolicy(params = {}, classification = {}) {
  const criticalMinutes = Number(params.critical_minutes ?? classification.critical_minutes ?? DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES);
  return {
    schema: 'narada.sonar.webhook_delay_threshold_policy.v1',
    policy_id: params.threshold_policy_id ?? 'webhook_delay_critical_threshold_policy',
    policy_source_ref: params.threshold_policy_source_ref ?? 'D:/code/narada.sonar/.narada/capabilities/operating-loop-policy.json',
    policy_authority: 'cloudflare_carrier_site_recorded_policy',
    critical_minutes: Number.isFinite(criticalMinutes) ? criticalMinutes : DEFAULT_WEBHOOK_DELAY_CRITICAL_MINUTES,
    classification_reason: classification.reason ?? null,
  };
}

function createWebhookDelayDirectiveIntent({
  siteId,
  operationId,
  directiveId,
  inputEventId,
  observation,
  classification,
  thresholdPolicy,
  createdAt,
  principal,
  directiveVisibility = 'record_only',
  carrierInputOperation = 'carrier.input.record',
  deliverySemantics = 'record_only',
  authorityRef = 'cloudflare-carrier:authority/webhook-delay-directive-dual-record:v1',
}) {
  const directive = {
    schema: 'narada.directive.operation_update_request.v1',
    kind: 'webhook_delay_critical',
    visibility: directiveVisibility,
    target: { kind: 'operation', id: operationId },
    operation: 'Operation: Update on webhook delays',
    content_kind: 'operation_update_request',
    content: {
      kind: 'operation_update_request',
      operation_name: 'Operation: Update on webhook delays',
      reason: classification.reason,
      latest_delay_minutes: classification.latest_delay_minutes,
      critical_minutes: classification.critical_minutes,
      observation_generated_at: observation.generated_at,
    },
  };
  const inputEvent = {
    schema: 'narada.carrier.input_event.v1',
    event_id: inputEventId,
    source_kind: 'system',
    source_id: 'narada.sonar.cloudflare.webhook_delay_directive_emitter',
    source_display_name: 'Narada Sonar Webhook Delay Directive Emitter',
    transport: 'carrier_server_api',
    created_at: createdAt,
    content: 'Operation: Update on webhook delays',
    delivery_mode: 'admit_for_current_turn',
    hold_condition: null,
    authority_ref: authorityRef,
    directive_id: directiveId,
    metadata: {
      directive,
      directive_provenance: {
        kind: 'system_directive',
        source: 'webhook_delay_critical_threshold',
        site_id: siteId,
        operation_id: operationId,
        threshold_policy: thresholdPolicy,
        emitted_by_principal_id: principal?.principal_id ?? 'unknown-principal',
      },
    },
  };
  return {
    schema: 'narada.sonar.webhook_delay_directive_intent.v1',
    directive_id: directiveId,
    input_event_id: inputEventId,
    carrier_input_operation: carrierInputOperation,
    delivery_semantics: deliverySemantics,
    directive_kind: 'webhook_delay_critical',
    input_event: inputEvent,
  };
}

function webhookDelayDirectiveRecordId(siteId, operationId, generatedAt) {
  return `webhook_delay_directive_${safeIdToken(siteId)}_${safeIdToken(operationId)}_${safeIdToken(generatedAt)}`;
}

function safeIdToken(value) {
  return String(value ?? 'unknown').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unknown';
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function listSiteTasks(env = {}, siteId) {
  const db = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !siteId) return [];
  const store = createD1SessionTaskStore(db, { site_id: siteId });
  return store.list();
}

async function listOperationTasks(env = {}, siteId, sessions = []) {
  const sessionIds = new Set((sessions ?? []).map((session) => session.carrier_session_id).filter(Boolean));
  if (sessionIds.size === 0) return [];
  const tasks = await listSiteTasks(env, siteId);
  return tasks.filter((task) => sessionIds.has(task.carrier_session_id));
}

async function readCarrierEvidenceForSiteSessions(env = {}, sessions = [], principal = null, params = {}) {
  const indexedEvidence = await readCloudflareCarrierEvidenceIndex(env, sessions, params);
  if (indexedEvidence?.complete) return indexedEvidence.evidence;
  if (!env?.CLOUDFLARE_CARRIER_SESSIONS) return indexedEvidence?.evidence ?? [];
  const boundedLimit = clampInteger(params.carrier_event_limit, 0, 100, 25);
  const evidence = indexedEvidence?.evidence ?? [];
  const indexedSessionIds = new Set(evidence.map((entry) => entry.carrier_session_id).filter(Boolean));
  const sessionOffset = clampInteger(params.session_offset, 0, sessions.length, 0);
  const sessionLimit = clampInteger(params.session_limit, 0, 50, 25);
  for (const session of sessions.slice(sessionOffset, sessionOffset + sessionLimit)) {
    const carrierSessionId = session.carrier_session_id;
    if (indexedSessionIds.has(carrierSessionId)) continue;
    try {
      const id = env.CLOUDFLARE_CARRIER_SESSIONS.idFromName(carrierSessionId);
      const durableResponse = await env.CLOUDFLARE_CARRIER_SESSIONS.get(id).fetch(new Request('https://carrier.site-read.local/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation: 'session.events.read',
          carrier_session_id: carrierSessionId,
          principal,
          params: { after_sequence: 0, limit: boundedLimit },
        }),
      }));
      const body = await durableResponse.json();
      evidence.push({
        carrier_session_id: carrierSessionId,
        ok: body.ok === true,
        source: 'cloudflare-durable-object',
        events: body.events ?? [],
        next_cursor: body.next_cursor ?? 0,
      });
    } catch (error) {
      evidence.push({
        carrier_session_id: carrierSessionId,
        ok: false,
        error: error?.message ?? 'carrier_evidence_read_failed',
        events: [],
        next_cursor: 0,
      });
    }
  }
  return evidence;
}

function carrierEventsFromResponse(response = {}) {
  return (response.events ?? [response.event]).filter((event) => event?.schema && event?.carrier_session_id);
}

async function recordCloudflareCarrierEvidenceEvents(env = {}, session = null, events = []) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function' || !Array.isArray(events) || events.length === 0) return { ok: false, code: 'missing_carrier_evidence_index_input' };
  try {
    await ensureCloudflareCarrierEvidenceIndexSchema(db);
    for (const event of events) {
      await db.prepare(`
        INSERT INTO cloudflare_carrier_session_events (
          carrier_session_id,
          sequence,
          event_id,
          site_id,
          operation_id,
          agent_id,
          event_kind,
          occurred_at,
          event_json,
          indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(carrier_session_id, sequence) DO UPDATE SET
          event_id = excluded.event_id,
          site_id = excluded.site_id,
          operation_id = excluded.operation_id,
          agent_id = excluded.agent_id,
          event_kind = excluded.event_kind,
          occurred_at = excluded.occurred_at,
          event_json = excluded.event_json,
          indexed_at = excluded.indexed_at
      `).bind(
        event.carrier_session_id,
        Number(event.sequence),
        event.event_id ?? `session_event_${event.carrier_session_id}_${event.sequence}`,
        event.site_id ?? session?.state?.site_id ?? null,
        event.payload?.operation_id ?? session?.state?.operation_id ?? null,
        event.agent_id ?? session?.state?.agent_id ?? null,
        event.event_kind,
        event.occurred_at ?? new Date().toISOString(),
        JSON.stringify(event),
        new Date().toISOString(),
      ).run();
    }
    return { ok: true, indexed_event_count: events.length };
  } catch (error) {
    return { ok: false, code: 'carrier_evidence_index_write_failed', error: error?.message ?? 'unknown_error' };
  }
}

async function readCloudflareCarrierEvidenceIndex(env = {}, sessions = [], params = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  const sessionList = sessions ?? [];
  const sessionOffset = clampInteger(params.session_offset, 0, sessionList.length, 0);
  const sessionLimit = clampInteger(params.session_limit, 0, 50, 25);
  const sessionSlice = sessionList.slice(sessionOffset, sessionOffset + sessionLimit);
  if (!db || typeof db.prepare !== 'function' || sessionSlice.length === 0) return null;
  await ensureCloudflareCarrierEvidenceIndexSchema(db);
  const boundedLimit = clampInteger(params.carrier_event_limit, 0, 100, 25);
  const evidence = [];
  const missingSessionIds = [];
  for (const session of sessionSlice) {
    const carrierSessionId = session.carrier_session_id;
    if (!carrierSessionId) continue;
    const rows = await db.prepare(`
      SELECT event_json, sequence FROM cloudflare_carrier_session_events
      WHERE carrier_session_id = ?
      ORDER BY sequence ASC
      LIMIT ?
    `).bind(carrierSessionId, boundedLimit).all();
    const events = (rows.results ?? []).map((row) => parseJsonObject(row.event_json)).filter((event) => event?.event_kind);
    if (events.length === 0) {
      missingSessionIds.push(carrierSessionId);
      continue;
    }
    evidence.push({
      carrier_session_id: carrierSessionId,
      ok: true,
      source: 'cloudflare-site-registry-d1-index',
      events,
      next_cursor: events.at(-1)?.sequence ?? 0,
    });
  }
  return { evidence, complete: missingSessionIds.length === 0, missing_session_ids: missingSessionIds };
}

async function ensureCloudflareCarrierEvidenceIndexSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cloudflare_carrier_session_events (
      carrier_session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      site_id TEXT,
      operation_id TEXT,
      agent_id TEXT,
      event_kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      event_json TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      PRIMARY KEY (carrier_session_id, sequence)
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_carrier_session_events_site_occurred
    ON cloudflare_carrier_session_events(site_id, occurred_at)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_cloudflare_carrier_session_events_operation_occurred
    ON cloudflare_carrier_session_events(operation_id, occurred_at)
  `).run();
}

async function handleOperatorAuthRequest(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/auth/microsoft/login') {
    return startMicrosoftLogin(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/microsoft/callback') {
    return completeMicrosoftLogin(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/operator/session-capture') {
    return captureOperatorSessionCookie(request, env);
  }
  if (request.method === 'GET' && url.pathname === '/auth/session') {
    const auth = await authenticateOperatorSessionRequest(request, env);
    if (!auth.ok) return jsonResponse({ ok: false, code: auth.code }, auth.status);
    return jsonResponse({ ok: true, principal: auth.principal });
  }
  if ((request.method === 'POST' || request.method === 'GET') && url.pathname === '/auth/logout') {
    return operatorRedirectResponse('/console', 302, [
      clearCookie(OPERATOR_SESSION_COOKIE),
      clearCookie(MICROSOFT_OIDC_PENDING_COOKIE),
    ]);
  }
  return jsonResponse({ ok: false, code: 'not_found' }, 404);
}

async function startMicrosoftLogin(request, env = {}) {
  const config = microsoftOidcConfig(request, env);
  if (!config.ok) return jsonResponse({ ok: false, code: config.code }, config.status);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const pending = {
    state,
    nonce,
    code_verifier: codeVerifier,
    created_at: Date.now(),
    post_login_redirect: validatedOperatorPostLoginRedirect(new URL(request.url)),
  };
  const pendingCookie = await signedCookie(MICROSOFT_OIDC_PENDING_COOKIE, pending, env, {
    maxAge: MICROSOFT_OIDC_PENDING_TTL_SECONDS,
  });
  const authorize = new URL(config.authorize_endpoint);
  authorize.searchParams.set('client_id', config.client_id);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('redirect_uri', config.redirect_uri);
  authorize.searchParams.set('response_mode', 'query');
  authorize.searchParams.set('scope', 'openid profile email');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('nonce', nonce);
  authorize.searchParams.set('code_challenge', codeChallenge);
  authorize.searchParams.set('code_challenge_method', 'S256');
  return operatorRedirectResponse(authorize.toString(), 302, [pendingCookie]);
}

async function completeMicrosoftLogin(request, env = {}) {
  const config = microsoftOidcConfig(request, env);
  if (!config.ok) return jsonResponse({ ok: false, code: config.code }, config.status);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return jsonResponse({ ok: false, code: 'missing_microsoft_oauth_code' }, 400);
  const pending = await readSignedCookie(request, MICROSOFT_OIDC_PENDING_COOKIE, env);
  if (!pending.ok) return jsonResponse({ ok: false, code: pending.code }, pending.status);
  if (pending.value.state !== state) return jsonResponse({ ok: false, code: 'microsoft_oauth_state_mismatch' }, 400);
  if (Date.now() - Number(pending.value.created_at ?? 0) > MICROSOFT_OIDC_PENDING_TTL_SECONDS * 1000) {
    return jsonResponse({ ok: false, code: 'microsoft_oauth_pending_expired' }, 400);
  }
  const tokenResponse = await exchangeMicrosoftCodeForTokens(code, pending.value.code_verifier, config, env);
  if (!tokenResponse.ok) return jsonResponse({ ok: false, code: tokenResponse.code, detail: tokenResponse.detail }, tokenResponse.status);
  const validation = await validateMicrosoftIdToken(tokenResponse.id_token, pending.value.nonce, config, env);
  if (!validation.ok) return jsonResponse({ ok: false, code: validation.code, detail: validation.detail }, validation.status);
  const session = await createOperatorSessionForMicrosoftPrincipal(validation.claims, env);
  if (!session.ok) return jsonResponse({ ok: false, code: session.code }, session.status);
  const cookie = await signedCookie(OPERATOR_SESSION_COOKIE, { operator_session_id: session.operator_session_id }, env, {
    maxAge: session.expires_in,
  });
  return operatorRedirectResponse(pending.value.post_login_redirect ?? '/console', 302, [cookie, clearCookie(MICROSOFT_OIDC_PENDING_COOKIE)]);
}

async function captureOperatorSessionCookie(request, env = {}) {
  const url = new URL(request.url);
  const returnTo = validateOperatorCaptureReturnTo(url.searchParams.get('return_to'));
  if (!returnTo.ok) return jsonResponse({ ok: false, code: returnTo.code }, returnTo.status);
  const auth = await authenticateOperatorSessionRequest(request, env);
  if (!auth.ok) {
    const loginUrl = new URL('/auth/microsoft/login', url.origin);
    loginUrl.searchParams.set('return_to', `${url.pathname}${url.search}`);
    return operatorRedirectResponse(loginUrl.toString(), 302);
  }
  const rawCookie = readCookie(request, OPERATOR_SESSION_COOKIE);
  if (!rawCookie) return jsonResponse({ ok: false, code: 'operator_session_cookie_missing' }, 401);
  const redirect = new URL(returnTo.value);
  redirect.searchParams.set('cookie', rawCookie);
  redirect.searchParams.set('principal_id', auth.principal.principal_id);
  if (auth.principal.email) redirect.searchParams.set('email', auth.principal.email);
  return operatorRedirectResponse(redirect.toString(), 302);
}

function microsoftOidcConfig(request, env = {}) {
  const tenantId = String(env.MICROSOFT_OIDC_TENANT_ID ?? '').trim();
  const clientId = String(env.MICROSOFT_OIDC_CLIENT_ID ?? '').trim();
  const clientSecret = String(env.MICROSOFT_OIDC_CLIENT_SECRET ?? '').trim();
  if (!tenantId || !clientId || (!clientSecret && !env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD)) {
    return { ok: false, code: 'microsoft_oidc_not_configured', status: 500 };
  }
  const origin = new URL(request.url).origin;
  const redirectUri = String(env.MICROSOFT_OIDC_REDIRECT_URI ?? `${origin}/auth/microsoft/callback`).trim();
  const issuer = `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/v2.0`;
  return {
    ok: true,
    tenant_id: tenantId,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    issuer,
    authorize_endpoint: `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/oauth2/v2.0/authorize`,
    token_endpoint: String(env.MICROSOFT_OIDC_TOKEN_ENDPOINT ?? `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/oauth2/v2.0/token`),
    jwks_uri: String(env.MICROSOFT_OIDC_JWKS_URI ?? `${MICROSOFT_OIDC_ISSUER_BASE}/${tenantId}/discovery/v2.0/keys`),
  };
}

async function exchangeMicrosoftCodeForTokens(code, codeVerifier, config, env = {}) {
  if (env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD) return { ok: true, id_token: 'fake.microsoft.id_token' };
  const body = new URLSearchParams();
  body.set('client_id', config.client_id);
  body.set('client_secret', config.client_secret);
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', config.redirect_uri);
  body.set('code_verifier', codeVerifier);
  const response = await fetch(config.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const tokenBody = await response.json().catch(() => ({}));
  if (!response.ok || !tokenBody.id_token) {
    return { ok: false, code: 'microsoft_token_exchange_failed', status: 502, detail: tokenBody.error ?? response.statusText };
  }
  return { ok: true, id_token: tokenBody.id_token };
}

async function validateMicrosoftIdToken(idToken, nonce, config, env = {}) {
  if (env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD) {
    const claims = typeof env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD === 'string'
      ? JSON.parse(env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD)
      : env.MICROSOFT_OIDC_FAKE_ID_TOKEN_PAYLOAD;
    return validateMicrosoftClaims({ ...claims, nonce: claims.nonce ?? nonce }, nonce, config);
  }
  const parts = String(idToken).split('.');
  if (parts.length !== 3) return { ok: false, code: 'invalid_microsoft_id_token', status: 400 };
  const header = parseJwtPart(parts[0]);
  const claims = parseJwtPart(parts[1]);
  const claimValidation = validateMicrosoftClaims(claims, nonce, config);
  if (!claimValidation.ok) return claimValidation;
  const jwksResponse = await fetch(config.jwks_uri);
  const jwks = await jwksResponse.json().catch(() => ({}));
  const key = (jwks.keys ?? []).find((entry) => entry.kid === header.kid);
  if (!key) return { ok: false, code: 'microsoft_jwks_key_not_found', status: 502 };
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    key,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const verified = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    base64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) return { ok: false, code: 'microsoft_id_token_signature_invalid', status: 400 };
  return { ok: true, claims };
}

function validateMicrosoftClaims(claims, nonce, config) {
  if (claims.iss !== config.issuer) return { ok: false, code: 'microsoft_issuer_mismatch', status: 400 };
  if (claims.aud !== config.client_id) return { ok: false, code: 'microsoft_audience_mismatch', status: 400 };
  if (claims.tid !== config.tenant_id) return { ok: false, code: 'microsoft_tenant_mismatch', status: 400 };
  if (claims.nonce !== nonce) return { ok: false, code: 'microsoft_nonce_mismatch', status: 400 };
  if (!claims.oid) return { ok: false, code: 'microsoft_oid_missing', status: 400 };
  if (Number(claims.exp ?? 0) * 1000 <= Date.now()) return { ok: false, code: 'microsoft_id_token_expired', status: 400 };
  return { ok: true, claims };
}

async function createOperatorSessionForMicrosoftPrincipal(claims, env = {}) {
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_operator_session_db', status: 500 };
  await ensureOperatorSessionSchema(db);
  const sessionId = `operator_session_${randomBase64Url(24)}`;
  const now = new Date();
  const ttl = clampInteger(env.NARADA_OPERATOR_SESSION_TTL_SECONDS, 300, 7 * 24 * 60 * 60, DEFAULT_OPERATOR_SESSION_TTL_SECONDS);
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const principalId = microsoftPrincipalId(claims);
  await db.prepare(`INSERT INTO cloudflare_operator_sessions (
    operator_session_id, principal_id, auth_type, issuer, tenant_id, subject, object_id, email, display_name, created_at, expires_at, revoked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    sessionId,
    principalId,
    'microsoft_oidc',
    claims.iss,
    claims.tid,
    claims.sub ?? null,
    claims.oid,
    claims.preferred_username ?? claims.email ?? null,
    claims.name ?? null,
    now.toISOString(),
    expiresAt,
    null,
  ).run();
  return { ok: true, operator_session_id: sessionId, principal_id: principalId, expires_in: ttl };
}

async function authenticateCarrierApiRequest(request, env = {}) {
  const bearer = authenticateCarrierRequest(request, env);
  if (bearer.ok) return bearer;
  const operator = await authenticateOperatorSessionRequest(request, env);
  if (operator.ok) return operator;
  if (bearer.code === 'auth_not_configured' && operator.code !== 'unauthorized') return operator;
  return bearer.code === 'auth_not_configured' ? bearer : operator;
}

async function authenticateOperatorSessionRequest(request, env = {}) {
  const cookie = await readSignedCookie(request, OPERATOR_SESSION_COOKIE, env);
  if (!cookie.ok) return { ok: false, code: 'unauthorized', status: 401 };
  const sessionId = String(cookie.value.operator_session_id ?? '').trim();
  if (!sessionId) return { ok: false, code: 'unauthorized', status: 401 };
  const db = env.CLOUDFLARE_SITE_REGISTRY_DB ?? env.NARADA_SITE_REGISTRY_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return { ok: false, code: 'missing_operator_session_db', status: 500 };
  await ensureOperatorSessionSchema(db);
  const row = await db.prepare(`SELECT * FROM cloudflare_operator_sessions
    WHERE operator_session_id = ? AND revoked_at IS NULL AND expires_at > ?`).bind(sessionId, new Date().toISOString()).first();
  if (!row) return { ok: false, code: 'unauthorized', status: 401 };
  return {
    ok: true,
    principal: {
      auth_type: row.auth_type,
      principal_id: row.principal_id,
      issuer: row.issuer,
      tenant_id: row.tenant_id,
      subject: row.subject,
      object_id: row.object_id,
      email: row.email,
      name: row.display_name,
      operator_session_id: row.operator_session_id,
      controlled_actions: [],
    },
  };
}

async function ensureOperatorSessionSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_operator_sessions (
    operator_session_id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL,
    auth_type TEXT NOT NULL,
    issuer TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    subject TEXT,
    object_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    revoked_at TEXT
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS cloudflare_operator_sessions_principal_idx ON cloudflare_operator_sessions(principal_id, expires_at)').run();
}

function microsoftPrincipalId(claims = {}) {
  return `microsoft:${claims.tid}:${claims.oid}`;
}

function validatedOperatorPostLoginRedirect(url) {
  const value = url.searchParams.get('return_to');
  if (!value) return null;
  try {
    const redirect = new URL(value, url.origin);
    if (redirect.origin !== url.origin) return null;
    if (redirect.pathname !== '/auth/operator/session-capture') return null;
    if (!validateOperatorCaptureReturnTo(redirect.searchParams.get('return_to')).ok) return null;
    return `${redirect.pathname}${redirect.search}`;
  } catch {
    return null;
  }
}

function validateOperatorCaptureReturnTo(value) {
  if (!value) return { ok: false, code: 'operator_capture_requires_return_to', status: 400 };
  try {
    const url = new URL(value);
    const loopbackHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
    if (url.protocol !== 'http:' || !loopbackHost) return { ok: false, code: 'operator_capture_return_to_must_be_loopback_http', status: 400 };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, code: 'operator_capture_return_to_invalid', status: 400 };
  }
}

export function createCloudflareAiProviderAdapter(env = {}, { config = createCloudflareCarrierConfig(env) } = {}) {
  return createCloudflareProviderAdapter(env, {
    config,
    toolEffectConfig: cloudflareToolEffectConfig(env),
  });
}

function createCloudflareAiProviderAdapterLegacy(env = {}, { config = createCloudflareCarrierConfig(env) } = {}) {
  const aiBinding = config.bindings.ai ?? env.AI;
  if (!aiBinding || typeof aiBinding.run !== 'function') return null;
  const intelligenceDiagnosticsEnabled = config.capabilities.intelligenceDiagnostics;
  const toolEffectConfig = cloudflareToolEffectConfig(env);
  const workersAiTools = toolEffectConfig.tool_definitions.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  const workersAiRequest = (input, tool_results) => tool_results.length > 0
    ? {
        messages: createWorkersAiToolResultMessages(input, tool_results),
        tools: workersAiTools,
      }
    : {
        messages: createWorkersAiInitialMessages(input),
        tools: workersAiTools,
      };
  let gatewayPromise = null;
  const ensureGateway = () => {
    gatewayPromise ??= createCarrierIntelligenceGateway(env, (store) => ({
      async invoke({ plan, offering, messages, invocationScope }) {
        const modelSlug = offering.invocation_model_key;
        const timeoutMs = clampInteger(plan.options.timeout_ms, 1000, 30000, 15000);
        const { input, tool_results = [] } = messages ?? {};
        const intelligenceDiagnostic = invocationScope?.intelligence_diagnostic ?? null;
        if (intelligenceDiagnostic === 'provider-failure') {
          return {
            error: {
              code: 'cloudflare_workers_ai_provider_failed',
              message: 'cloudflare_live_diagnostic_provider_failure',
              retryable: true,
            },
            admission: 'acknowledged',
            transportSubmitted: false,
          };
        }
        if (intelligenceDiagnostic === 'provider-recovery') {
          return {
            response: {
              text: 'cloudflare_live_diagnostic_provider_recovered',
              tool_calls: [],
            },
            admission: 'acknowledged',
            transportSubmitted: false,
          };
        }
        if (intelligenceDiagnostic === 'acknowledgment-uncertain') {
          return {
            error: {
              code: 'cloudflare_workers_ai_timeout',
              message: 'cloudflare_live_diagnostic_acknowledgment_uncertain',
              retryable: true,
            },
            admission: 'uncertain',
            transportSubmitted: false,
          };
        }
        try {
          const result = await withTimeout(aiBinding.run(modelSlug, workersAiRequest(input, tool_results)), timeoutMs);
          return {
            response: {
              text: extractWorkersAiText(result),
              tool_calls: extractWorkersAiToolCalls(result),
            },
            admission: 'acknowledged',
            transportSubmitted: true,
            providerRequestRef: result?.request_id ?? result?.requestId ?? undefined,
          };
        } catch (error) {
          const timedOut = error instanceof Error && error.message === 'cloudflare_workers_ai_provider_timeout';
          return {
            error: {
              code: timedOut ? 'cloudflare_workers_ai_timeout' : 'cloudflare_workers_ai_provider_failed',
              message: error instanceof Error ? error.message : String(error),
              retryable: true,
            },
            admission: timedOut ? 'uncertain' : 'acknowledged',
            transportSubmitted: true,
          };
        }
      },
    }));
    return gatewayPromise;
  };
  return {
    posture: 'cloudflare-workers-ai',
    adapter_kind: 'cloudflare-workers-ai',
    provider: 'cloudflare-workers-ai',
    model: null,
    resolution: 'invokable-intelligence',
    async run({
      input,
      tool_results = [],
      turn_id = null,
      carrier_session_id = null,
      site_id = null,
      operation_id = null,
      carrier_context = null,
      intelligence_invocation = null,
      intelligence_diagnostic = null,
    }) {
      if (intelligence_diagnostic && !intelligenceDiagnosticsEnabled) {
        const error = new Error('cloudflare_intelligence_diagnostic_disabled');
        error.code = 'cloudflare_intelligence_diagnostic_disabled';
        throw error;
      }
      const { gateway } = await ensureGateway();
      const normalizedIntelligenceInvocation = intelligence_invocation === null
        ? null
        : normalizeIntelligenceInvocationControl(intelligence_invocation);
      const invocationOperationId = normalizedIntelligenceInvocation?.operation_id
        ?? `${carrier_session_id ?? 'unbound'}:${turn_id ?? input?.event_id ?? 'turn'}:${tool_results.length > 0 ? 'tool-results' : 'initial'}`;
      const result = await gateway.invoke({
        purpose: 'carrier-turn',
        ...(normalizedIntelligenceInvocation?.intent_id ? { intentId: normalizedIntelligenceInvocation.intent_id } : {}),
        ...(intelligence_diagnostic === 'resolver-refusal'
          ? { requestedModel: { kind: 'model', id: 'model:cloudflare-live-diagnostic-missing' } }
          : {}),
        operationId: invocationOperationId,
        mode: normalizedIntelligenceInvocation?.mode ?? 'immediate',
        allowReplan: normalizedIntelligenceInvocation?.allow_replan !== false,
        messages: { input, tool_results },
        turnId: turn_id ?? undefined,
        inputEventId: input?.event_id ?? undefined,
        requestId: input?.event_id ?? undefined,
        invocationScope: {
          carrier_session_id,
          site_id,
          operation_id,
          ...(intelligence_diagnostic ? { intelligence_diagnostic } : {}),
        },
        carrierContext: carrier_context,
      });
      if (result.kind === 'refusal') {
        const error = new Error('intelligence_resolution_refused:' + result.refusal.reason_code + ':' + result.refusal.explanation);
        error.code = `intelligence_resolver_${result.refusal.reason_code.replaceAll('-', '_')}`;
        error.refusal = result.refusal;
        error.intelligence = {
          intent_id: result.intent.id,
          outcome_id: result.outcome.id,
          outcome_kind: result.outcome.kind,
          audit_evidence_ids: result.auditEvidence.map(({ id }) => id),
        };
        throw error;
      }
      const intelligence = {
        intent_id: result.intent.id,
        plan_id: result.plan.id,
        attempt_id: result.attempt.id,
        result_id: result.result?.id ?? null,
        outcome_id: result.outcome.id,
        outcome_kind: result.outcome.kind,
        selection: result.plan.selected,
        offering_id: result.plan.route.offering.id,
        route_id: result.plan.route.route_id,
        topology_id: result.plan.route.topology_id,
        access: result.plan.access,
        audit_evidence_ids: result.auditEvidence.map(({ id }) => id),
        observation_ids: result.observations.map(({ id }) => id),
        telemetry_ids: result.telemetry.map(({ id }) => id),
        replayed: result.replayed,
        authority_binding: result.intent.authority_binding ?? null,
      };
      if (result.replayed && !result.adapterOutcome) {
        return {
          response_available: false,
          intelligence: {
            schema: 'narada.invokable-intelligence.metadata-only-result.v1',
            response_available: false,
            ...intelligence,
          },
        };
      }
      if (result.adapterOutcome.error) {
        const error = new Error(result.adapterOutcome.error.message);
        error.code = result.adapterOutcome.error.code;
        error.intelligence = intelligence;
        throw error;
      }
      return {
        ...result.adapterOutcome.response,
        intelligence,
      };
    },
  };
}

function createWorkersAiInitialMessages(input) {
  return [
    {
      role: 'system',
      content: 'You are Narada running inside a Cloudflare carrier. Answer the operator input concisely. Use available tools only when needed; tool effects are carrier-admitted and may be denied.',
    },
    {
      role: 'user',
      content: input.content,
    },
  ];
}

function createWorkersAiToolResultMessages(input, toolResults) {
  return [
    ...createWorkersAiInitialMessages(input),
    {
      role: 'assistant',
      content: 'Tool calls were evaluated by the Cloudflare carrier boundary.',
    },
    {
      role: 'user',
      content: `Carrier tool results:\n${JSON.stringify(toolResults.map((result) => ({
        tool_name: result.tool_name,
        status: result.status,
        admission_action: result.admission_action,
        admission_reason: result.admission_reason,
        capability_ref: result.capability_ref,
        effect_scope: result.effect_scope,
        result_summary: result.result_summary,
        authority_ref: result.authority_ref,
      })))}`,
    },
  ];
}

function cloudflareToolEffectConfig(env = {}) {
  const runtimeReadsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS === true;
  const kvReadsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS === true;
  const kvWritesEnabled = env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES === true;
  const taskToolsEnabled = env.CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS === '1'
    || env.CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS === true;
  const kvBinding = env.CLOUDFLARE_CARRIER_KV ?? env.NARADA_CARRIER_KV ?? null;
  const taskDb = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  const d1TasksConfigured = taskToolsEnabled && taskDb && typeof taskDb.prepare === 'function';
  const tools = [];
  const capabilities = [];
  const toolDefinitions = [];
  if (runtimeReadsEnabled) {
    tools.push('cloudflare_carrier_runtime_metadata_read');
    capabilities.push({ ...CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_RUNTIME_METADATA_READ_TOOL_DEFINITION);
  }
  if (kvReadsEnabled && kvBinding && typeof kvBinding.get === 'function') {
    tools.push('cloudflare_carrier_kv_get');
    capabilities.push({ ...CLOUDFLARE_KV_GET_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_KV_GET_TOOL_DEFINITION);
  }
  if (kvWritesEnabled && kvBinding && typeof kvBinding.put === 'function') {
    tools.push('cloudflare_carrier_kv_put');
    capabilities.push({ ...CLOUDFLARE_KV_PUT_CAPABILITY });
    toolDefinitions.push(CLOUDFLARE_KV_PUT_TOOL_DEFINITION);
  }
  if (d1TasksConfigured) {
    tools.push('cloudflare_carrier_task_create', 'cloudflare_carrier_task_update', 'cloudflare_carrier_task_list');
    capabilities.push(
      { ...CLOUDFLARE_TASK_CREATE_CAPABILITY },
      { ...CLOUDFLARE_TASK_UPDATE_CAPABILITY },
      { ...CLOUDFLARE_TASK_LIST_CAPABILITY },
    );
    toolDefinitions.push(
      CLOUDFLARE_TASK_CREATE_TOOL_DEFINITION,
      CLOUDFLARE_TASK_UPDATE_TOOL_DEFINITION,
      CLOUDFLARE_TASK_LIST_TOOL_DEFINITION,
    );
  }
  return {
    configured: tools.length > 0,
    runtimeReadsEnabled,
    kvReadsEnabled: kvReadsEnabled && Boolean(kvBinding && typeof kvBinding.get === 'function'),
    kvWritesEnabled: kvWritesEnabled && Boolean(kvBinding && typeof kvBinding.put === 'function'),
    taskToolsEnabled: d1TasksConfigured,
    taskDb,
    kvBinding,
    supported_tools: tools,
    capabilities,
    tool_definitions: toolDefinitions,
  };
}

export function createCloudflareToolEffectAdapter(env = {}) {
  return createCloudflareToolEffectAdapterBoundary({
    env,
    createImplementation: createCloudflareToolEffectAdapterLegacy,
  });
}

function createCloudflareToolEffectAdapterLegacy(env = {}) {
  const config = cloudflareToolEffectConfig(env);
  if (!config.configured) return null;
  return {
    posture: 'configured',
    adapter_kind: 'cloudflare-tool-effect-boundary',
    supported_tools: [...config.supported_tools],
    capabilities: config.capabilities.map((capability) => ({ ...capability })),
    async execute({ toolCall, context }) {
      const admission = classifyCloudflareToolEffectAdmission(toolCall, config);
      if (admission.action !== 'admit') {
        return {
          status: 'denied',
          admission_action: admission.action,
          admission_reason: admission.reason,
          result_summary: admission.reason,
          result_ref: null,
        };
      }
      const authority = classifyToolEffectAuthority(context.principal, admission.tool_name);
      if (!authority.ok) {
        return {
          status: 'denied',
          admission_action: 'deny',
          admission_reason: 'tool_effect_authority_denied',
          result_summary: 'tool_effect_authority_denied',
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_kv_put') {
        const args = parseToolArguments(toolCall.arguments_summary);
        const key = typeof args.key === 'string' ? args.key.trim() : '';
        const value = typeof args.value === 'string' ? args.value : '';
        if (!key) {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_kv_put_requires_key',
            result_ref: null,
          };
        }
        await config.kvBinding.put(key, value);
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_KV_PUT_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_KV_PUT_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({
            key,
            bytes_written: value.length,
          }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_create') {
        const { decision: siteAuthorityDecision } = classifyCloudflareSiteAuthority(config, context.site_id, SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION);
        if (siteAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
          return {
            status: 'denied',
            admission_action: 'deny',
            admission_reason: 'tool_effect_authority_denied',
            result_summary: JSON.stringify({ reason: 'site_authority_route_denied', site_authority_decision: siteAuthorityDecision }),
            result_ref: null,
          };
        }
        if (!context.taskStore || typeof context.taskStore.create !== 'function') {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_task_store_unavailable',
            result_ref: null,
          };
        }
        const args = parseToolArguments(toolCall.arguments_summary);
        const task = await context.taskStore.create({
          title: args.title,
          description: args.description,
          source: 'cloudflare-carrier-task-effect',
        });
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_CREATE_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_CREATE_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ task, task_count: (await context.taskStore?.list?.())?.length ?? null, site_authority_decision: siteAuthorityDecision }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_update') {
        const { decision: siteAuthorityDecision } = classifyCloudflareSiteAuthority(config, context.site_id, SITE_MUTATION_CLASSES.TASK_ARTIFACT_MUTATION);
        if (siteAuthorityDecision.action !== SITE_AUTHORITY_ACTIONS.ADMIT) {
          return {
            status: 'denied',
            admission_action: 'deny',
            admission_reason: 'tool_effect_authority_denied',
            result_summary: JSON.stringify({ reason: 'site_authority_route_denied', site_authority_decision: siteAuthorityDecision }),
            result_ref: null,
          };
        }
        if (!context.taskStore || typeof context.taskStore.update !== 'function') {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_task_store_unavailable',
            result_ref: null,
          };
        }
        const args = parseToolArguments(toolCall.arguments_summary);
        const task = await context.taskStore.update({
          task_id: args.task_id,
          status: args.status,
          note: args.note,
        });
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_UPDATE_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_UPDATE_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ task, task_count: (await context.taskStore?.list?.())?.length ?? null, site_authority_decision: siteAuthorityDecision }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_task_list') {
        const tasks = await context.taskStore?.list?.() ?? [];
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_TASK_LIST_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_TASK_LIST_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({ tasks, task_count: tasks.length }),
          result_ref: null,
        };
      }
      if (admission.tool_name === 'cloudflare_carrier_kv_get') {
        const args = parseToolArguments(toolCall.arguments_summary);
        const key = typeof args.key === 'string' ? args.key.trim() : '';
        if (!key) {
          return {
            status: 'failed',
            admission_action: admission.action,
            admission_reason: admission.reason,
            capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
            effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
            authority_ref: authority.authority_ref,
            result_summary: 'cloudflare_kv_get_requires_key',
            result_ref: null,
          };
        }
        const value = await config.kvBinding.get(key);
        return {
          status: 'ok',
          admission_action: admission.action,
          admission_reason: admission.reason,
          capability_ref: CLOUDFLARE_KV_GET_CAPABILITY_REF,
          effect_scope: CLOUDFLARE_KV_GET_EFFECT_SCOPE,
          authority_ref: authority.authority_ref,
          result_summary: JSON.stringify({
            key,
            found: value !== null && value !== undefined,
            value_preview: value === null || value === undefined ? null : String(value).slice(0, 240),
          }),
          result_ref: null,
        };
      }
      return {
        status: 'ok',
        admission_action: admission.action,
        admission_reason: admission.reason,
        capability_ref: CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY_REF,
        effect_scope: CLOUDFLARE_RUNTIME_METADATA_READ_EFFECT_SCOPE,
        authority_ref: authority.authority_ref,
        result_summary: JSON.stringify({
          carrier_session_id: context.carrier_session_id,
          agent_id: context.agent_id,
          site_id: context.site_id,
          turn_id: context.turn_id,
          worker_runtime: 'cloudflare-workers',
        }),
        result_ref: null,
      };
    },
  };
}

export function createCloudflareD1TaskStoreAdapter(env = {}) {
  return createCloudflareD1TaskStoreAdapterBoundary(env);
}

function createCloudflareD1TaskStoreAdapterLegacy(env = {}) {
  const db = env.CLOUDFLARE_CARRIER_TASK_DB ?? env.NARADA_TASK_DB ?? null;
  if (!db || typeof db.prepare !== 'function') return null;
  return {
    posture: 'cloudflare-d1',
    adapter_kind: 'cloudflare-d1-task-store',
    forSession(context = {}) {
      return createD1SessionTaskStore(db, context);
    },
  };
}

function createD1SessionTaskStore(db, context = {}) {
  const siteId = String(context.site_id ?? 'unknown-site');
  const siteRoot = context.site_root ?? `cloudflare://${siteId}`;
  const now = typeof context.now === 'function' ? context.now : () => new Date().toISOString();
  let initialized = false;
  async function ensureSchema() {
    if (initialized) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS narada_tasks (
      site_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      carrier_session_id TEXT,
      agent_id TEXT,
      site_root TEXT,
      PRIMARY KEY (site_id, task_id)
    )`).run();
    await db.prepare('CREATE INDEX IF NOT EXISTS narada_tasks_site_number_idx ON narada_tasks(site_id, task_number)').run();
    initialized = true;
  }
  async function nextTaskNumber() {
    await ensureSchema();
    const row = await db.prepare('SELECT COALESCE(MAX(task_number), 0) + 1 AS next_task_number FROM narada_tasks WHERE site_id = ?')
      .bind(siteId)
      .first();
    return Number(row?.next_task_number ?? 1);
  }
  return {
    async create({ title, description = null, status = 'open', source = 'carrier' }) {
      const trimmedTitle = String(title ?? '').trim();
      if (!trimmedTitle) throw new Error('cloudflare_task_create_requires_title');
      const taskNumber = await nextTaskNumber();
      const timestamp = now();
      const task = {
        site_id: siteId,
        task_id: `cloudflare-task-${taskNumber}`,
        task_number: taskNumber,
        title: trimmedTitle,
        description: description ? String(description) : null,
        status: String(status ?? 'open'),
        source: String(source ?? 'carrier'),
        note: null,
        created_at: timestamp,
        updated_at: timestamp,
        carrier_session_id: context.carrier_session_id ?? null,
        agent_id: context.agent_id ?? null,
        site_root: siteRoot,
      };
      await ensureSchema();
      await db.prepare(`INSERT INTO narada_tasks (
        site_id, task_id, task_number, title, description, status, source, note,
        created_at, updated_at, carrier_session_id, agent_id, site_root
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        task.site_id,
        task.task_id,
        task.task_number,
        task.title,
        task.description,
        task.status,
        task.source,
        task.note,
        task.created_at,
        task.updated_at,
        task.carrier_session_id,
        task.agent_id,
        task.site_root,
      ).run();
      return publicTask(task);
    },
    async update({ task_id, status = null, note = null }) {
      await ensureSchema();
      const taskId = String(task_id ?? '').trim();
      const existing = await findTask(db, siteId, taskId);
      if (!existing) throw new Error('cloudflare_task_not_found');
      const updated = {
        ...existing,
        status: status ? String(status) : existing.status,
        note: note ? String(note) : existing.note,
        updated_at: now(),
      };
      await db.prepare('UPDATE narada_tasks SET status = ?, note = ?, updated_at = ? WHERE site_id = ? AND task_id = ?')
        .bind(updated.status, updated.note, updated.updated_at, siteId, updated.task_id)
        .run();
      return publicTask(updated);
    },
    async list() {
      await ensureSchema();
      const result = await db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? ORDER BY task_number ASC')
        .bind(siteId)
        .all();
      return (result.results ?? []).map(publicTask);
    },
  };
}

async function findTask(db, siteId, taskIdOrNumber) {
  const byId = await db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_id = ?')
    .bind(siteId, taskIdOrNumber)
    .first();
  if (byId) return byId;
  const numeric = Number(taskIdOrNumber);
  if (!Number.isInteger(numeric)) return null;
  return db.prepare('SELECT * FROM narada_tasks WHERE site_id = ? AND task_number = ?')
    .bind(siteId, numeric)
    .first();
}

function publicTask(task) {
  return {
    task_id: String(task.task_id),
    task_number: Number(task.task_number),
    title: String(task.title),
    description: task.description ?? null,
    status: String(task.status),
    source: String(task.source),
    created_at: String(task.created_at),
    updated_at: String(task.updated_at),
    note: task.note ?? null,
    site_id: task.site_id ?? null,
    carrier_session_id: task.carrier_session_id ?? null,
    agent_id: task.agent_id ?? null,
    site_root: task.site_root ?? null,
  };
}

function classifyToolEffectAuthority(principal, toolName) {
  const principalId = String(principal?.principal_id ?? principal?.user_id ?? 'anonymous');
  const controlledActions = Array.isArray(principal?.controlled_actions) ? principal.controlled_actions.map(String) : [];
  const capability = capabilityForTool(toolName);
  const allowed = controlledActions.includes('*')
    || controlledActions.includes(toolName)
    || controlledActions.includes(capability?.capability_ref)
    || controlledActions.includes(capability?.effect_scope);
  return {
    ok: allowed,
    authority_ref: allowed ? `principal:${principalId}` : null,
  };
}

function capabilityForTool(toolName) {
  if (toolName === 'cloudflare_carrier_runtime_metadata_read') return CLOUDFLARE_RUNTIME_METADATA_READ_CAPABILITY;
  if (toolName === 'cloudflare_carrier_kv_get') return CLOUDFLARE_KV_GET_CAPABILITY;
  if (toolName === 'cloudflare_carrier_kv_put') return CLOUDFLARE_KV_PUT_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_create') return CLOUDFLARE_TASK_CREATE_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_update') return CLOUDFLARE_TASK_UPDATE_CAPABILITY;
  if (toolName === 'cloudflare_carrier_task_list') return CLOUDFLARE_TASK_LIST_CAPABILITY;
  return null;
}

export function classifyCloudflareToolEffectAdmission(toolCall = {}, state = {}) {
  const toolName = String(toolCall?.tool_name ?? toolCall?.name ?? '').trim();
  const supportedTools = Array.isArray(state.supportedTools)
    ? state.supportedTools
    : Array.isArray(state.supported_tools)
    ? state.supported_tools
    : state.runtimeReadsEnabled
      ? ['cloudflare_carrier_runtime_metadata_read']
      : [];
  const writesTask = toolName === 'cloudflare_carrier_task_create' || toolName === 'cloudflare_carrier_task_update';
  const writesKv = toolName === 'cloudflare_carrier_kv_put';
  return classifyToolEffectAdmission(toolCall, {
    adapterConfigured: state.adapterConfigured ?? state.configured ?? state.runtimeReadsEnabled ?? false,
    admissionRequired: state.admissionRequired === true,
    supportedTools,
    admitReason: writesKv || writesTask ? 'write_tool_effect_admitted' : 'read_only_tool_effect_admitted',
  });
}

function parseToolArguments(argumentsSummary) {
  if (typeof argumentsSummary !== 'string') return {};
  try {
    const parsed = JSON.parse(argumentsSummary);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function authenticateCarrierRequest(request, env = {}) {
  const configured = Boolean(env.SERVICE_TOKEN || env.ADMIN_BEARER_TOKEN || env.CLOUDFLARE_CARRIER_SERVICE_TOKEN || env.CLOUDFLARE_CARRIER_ADMIN_TOKEN);
  if (!configured) return { ok: false, code: 'auth_not_configured', status: 500 };

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, code: 'unauthorized', status: 401 };

  if (token === (env.CLOUDFLARE_CARRIER_SERVICE_TOKEN ?? env.SERVICE_TOKEN)) {
    return {
      ok: true,
      principal: {
        auth_type: 'service',
        principal_id: 'service',
        controlled_actions: ['*'],
      },
    };
  }

  if (token === (env.CLOUDFLARE_CARRIER_ADMIN_TOKEN ?? env.ADMIN_BEARER_TOKEN)) {
    return {
      ok: true,
      principal: {
        auth_type: 'user',
        principal_id: 'admin',
        user_id: 'admin',
        email: 'admin@system',
        name: 'Administrator',
        roles: [1],
        controlled_actions: ['*'],
      },
    };
  }

  return { ok: false, code: 'unauthorized', status: 401 };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function operatorRedirectResponse(location, status = 302, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const cookie of cookies.filter(Boolean)) headers.append('set-cookie', cookie);
  return new Response(null, { status, headers });
}

async function signedCookie(name, value, env = {}, { maxAge = 300 } = {}) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await hmacBase64Url(payload, operatorSessionSecret(env));
  return `${name}=${payload}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function readSignedCookie(request, name, env = {}) {
  const raw = readCookie(request, name);
  if (!raw) return { ok: false, code: 'missing_signed_cookie', status: 401 };
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return { ok: false, code: 'invalid_signed_cookie', status: 401 };
  const secret = optionalOperatorSessionSecret(env);
  if (!secret) return { ok: false, code: 'operator_session_secret_not_configured', status: 500 };
  const expected = await hmacBase64Url(payload, secret);
  if (!timingSafeEqual(signature, expected)) return { ok: false, code: 'invalid_signed_cookie_signature', status: 401 };
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) };
  } catch {
    return { ok: false, code: 'invalid_signed_cookie_payload', status: 401 };
  }
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function operatorSessionSecret(env = {}) {
  const secret = optionalOperatorSessionSecret(env);
  if (!secret) throw new Error('operator_session_secret_not_configured');
  return secret;
}

function optionalOperatorSessionSecret(env = {}) {
  return String(env.NARADA_OPERATOR_SESSION_SECRET ?? env.SERVICE_TOKEN ?? env.ADMIN_BEARER_TOKEN ?? '').trim();
}

async function hmacBase64Url(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function parseJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

function base64UrlToBytes(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function withPrincipalEvidence(body, operation, principal) {
  if (!body || typeof body !== 'object') return body;
  if (operation === 'session.status') return { ...body, reader_principal: principal };
  if (operation === 'session.events.read') return { ...body, reader_principal: principal };
  if (operation === 'site.read') return { ...body, reader_principal: principal };
  if (operation === 'operation.read') return { ...body, reader_principal: principal };
  if (operation === 'operation.list') return { ...body, reader_principal: principal };
  return { ...body, principal };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('cloudflare_workers_ai_provider_timeout')),
      timeoutMs,
    );
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function extractWorkersAiText(result) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.result?.response === 'string') return result.result.response;
  if (typeof result?.response?.content === 'string') return result.response.content;
  if (typeof result?.result?.response?.content === 'string') return result.result.response.content;
  if (typeof result?.choices?.[0]?.message?.content === 'string') return result.choices[0].message.content;
  if (typeof result?.result?.choices?.[0]?.message?.content === 'string') return result.result.choices[0].message.content;
  if (Array.isArray(result?.response)) return result.response.map(String).join('\n');
  return JSON.stringify(result);
}

function extractWorkersAiToolCalls(result) {
  if (Array.isArray(result?.tool_calls)) return result.tool_calls;
  if (Array.isArray(result?.toolCalls)) return result.toolCalls;
  if (Array.isArray(result?.response?.tool_calls)) return result.response.tool_calls;
  if (Array.isArray(result?.response?.toolCalls)) return result.response.toolCalls;
  if (Array.isArray(result?.result?.tool_calls)) return result.result.tool_calls;
  if (Array.isArray(result?.result?.response?.tool_calls)) return result.result.response.tool_calls;
  if (Array.isArray(result?.choices?.[0]?.message?.tool_calls)) return result.choices[0].message.tool_calls;
  if (Array.isArray(result?.result?.choices?.[0]?.message?.tool_calls)) return result.result.choices[0].message.tool_calls;
  return [];
}
