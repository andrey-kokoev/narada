/**
 * Normalized configuration boundary for the Cloudflare carrier.
 *
 * This module is deliberately the only place that translates raw Worker env
 * bindings into carrier capability, authority, binding, and secret-reference
 * posture. Secret values are never copied into the returned configuration.
 * Model selection is canonical D1/request-scoped authority and therefore has
 * no model value in this shape.
 */

import { cloudflareIntelligenceDiagnosticsEnabled } from './cloudflare-carrier.mjs';

export const CLOUDFLARE_CARRIER_CONFIG_VERSION = 'narada.cloudflare-carrier.config.v1';

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function enabled(value) {
  return value === true || value === '1';
}

function configured(value) {
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(nonEmpty).filter(Boolean);
  return typeof value === 'string'
    ? value.split(',').map(nonEmpty).filter(Boolean)
    : [];
}

function secretRef(binding, value) {
  return Object.freeze({
    binding,
    configured: configured(value),
  });
}

function bindingPosture(value) {
  return Object.freeze({ configured: configured(value) });
}

export function createCloudflareCarrierConfig(env = {}) {
  const bindings = {
    carrierSessions: env.CLOUDFLARE_CARRIER_SESSIONS ?? null,
    taskDb: env.CLOUDFLARE_CARRIER_TASK_DB ?? null,
    siteRegistryDb: env.CLOUDFLARE_SITE_REGISTRY_DB ?? null,
    intelligenceRegistryDb: env.INTELLIGENCE_REGISTRY_DB ?? null,
    ai: env.AI ?? null,
    kv: env.CLOUDFLARE_CARRIER_KV ?? env.NARADA_CARRIER_KV ?? null,
  };

  return Object.freeze({
    schema: CLOUDFLARE_CARRIER_CONFIG_VERSION,
    bindings: Object.freeze({
      ...bindings,
      posture: Object.freeze({
        carrierSessions: bindingPosture(bindings.carrierSessions),
        taskDb: bindingPosture(bindings.taskDb),
        siteRegistryDb: bindingPosture(bindings.siteRegistryDb),
        intelligenceRegistryDb: bindingPosture(bindings.intelligenceRegistryDb),
        ai: bindingPosture(bindings.ai),
        kv: bindingPosture(bindings.kv),
      }),
    }),
    capabilities: Object.freeze({
      taskTools: enabled(env.CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS),
      runtimeMetadataReads: enabled(env.CLOUDFLARE_CARRIER_ENABLE_RUNTIME_TOOL_READS),
      kvReads: enabled(env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_READS),
      kvWrites: enabled(env.CLOUDFLARE_CARRIER_ENABLE_KV_TOOL_WRITES),
      intelligenceDiagnostics: cloudflareIntelligenceDiagnosticsEnabled(
        env.CLOUDFLARE_CARRIER_ENABLE_INTELLIGENCE_DIAGNOSTICS,
      ),
      scheduledWebhookDelayReads: enabled(env.CLOUDFLARE_WEBHOOK_DELAY_SCHEDULED_READ_ENABLED),
    }),
    authorities: Object.freeze({
      carrierSiteId: nonEmpty(env.CLOUDFLARE_CARRIER_SITE_ID),
      carrierAuthorityLocus: nonEmpty(env.CLOUDFLARE_CARRIER_AUTHORITY_LOCUS),
      taskAuthorityLocus: nonEmpty(env.CLOUDFLARE_CARRIER_TASK_AUTHORITY_LOCUS),
      siteRef: nonEmpty(env.CLOUDFLARE_SITE_REF),
      siteAuthorityMapRef: nonEmpty(env.CLOUDFLARE_SITE_AUTHORITY_MAP_REF),
      modelSelectionAuthority: 'canonical-d1-request-scoped',
    }),
    publication: Object.freeze({
      allowedRepositories: Object.freeze(splitList(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_REPOSITORIES)),
      allowedBranches: Object.freeze(splitList(env.CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_BRANCHES)),
    }),
    secretRefs: Object.freeze({
      carrierServiceToken: secretRef('CLOUDFLARE_CARRIER_SERVICE_TOKEN', env.CLOUDFLARE_CARRIER_SERVICE_TOKEN),
      carrierAdminToken: secretRef('CLOUDFLARE_CARRIER_ADMIN_TOKEN', env.CLOUDFLARE_CARRIER_ADMIN_TOKEN),
      operatorSessionSecret: secretRef('NARADA_OPERATOR_SESSION_SECRET', env.NARADA_OPERATOR_SESSION_SECRET),
      githubAppPrivateKey: secretRef('CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY', env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_APP_PRIVATE_KEY),
      githubToken: secretRef('CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN', env.CLOUDFLARE_REPOSITORY_PUBLICATION_GITHUB_TOKEN),
      graphAccessToken: secretRef('GRAPH_ACCESS_TOKEN', env.GRAPH_ACCESS_TOKEN),
      graphClientSecret: secretRef('GRAPH_CLIENT_SECRET', env.GRAPH_CLIENT_SECRET),
      taskLifecycleShadowReadSourceToken: secretRef('CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_TOKEN', env.CLOUDFLARE_TASK_LIFECYCLE_SHADOW_READ_SOURCE_TOKEN),
      webhookDelayDirectSourceToken: secretRef('CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_TOKEN', env.CLOUDFLARE_WEBHOOK_DELAY_DIRECT_SOURCE_TOKEN),
    }),
  });
}

