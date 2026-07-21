import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUDFLARE_CARRIER_CONFIG_VERSION,
  createCloudflareCarrierConfig,
} from './cloudflare-carrier-config.mjs';

test('carrier config normalizes bindings, capabilities, authorities, and secret references', () => {
  const ai = { run() {} };
  const config = createCloudflareCarrierConfig({
    AI: ai,
    CLOUDFLARE_CARRIER_SESSIONS: { idFromName() {} },
    INTELLIGENCE_REGISTRY_DB: { prepare() {} },
    CLOUDFLARE_CARRIER_ENABLE_TASK_TOOLS: '1',
    CLOUDFLARE_CARRIER_ENABLE_INTELLIGENCE_DIAGNOSTICS: '1',
    CLOUDFLARE_CARRIER_SITE_ID: 'site_narada_cloudflare',
    CLOUDFLARE_CARRIER_AUTHORITY_LOCUS: 'cloudflare-carrier',
    CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_REPOSITORIES: 'github:a,github:b',
    CLOUDFLARE_REPOSITORY_PUBLICATION_ALLOWED_BRANCHES: 'main,release',
    CLOUDFLARE_CARRIER_SERVICE_TOKEN: 'secret-value',
  });

  assert.equal(config.schema, CLOUDFLARE_CARRIER_CONFIG_VERSION);
  assert.equal(config.bindings.ai, ai);
  assert.equal(config.bindings.posture.ai.configured, true);
  assert.equal(config.capabilities.taskTools, true);
  assert.equal(config.capabilities.intelligenceDiagnostics, true);
  assert.equal(config.authorities.carrierSiteId, 'site_narada_cloudflare');
  assert.equal(config.authorities.modelSelectionAuthority, 'canonical-d1-request-scoped');
  assert.deepEqual(config.publication.allowedRepositories, ['github:a', 'github:b']);
  assert.deepEqual(config.secretRefs.carrierServiceToken, {
    binding: 'CLOUDFLARE_CARRIER_SERVICE_TOKEN',
    configured: true,
  });
  assert.equal(JSON.stringify(config).includes('secret-value'), false);
  assert.equal('model' in config, false);
});

test('carrier config defaults capabilities off and never promotes legacy model env values', () => {
  const config = createCloudflareCarrierConfig({
    CLOUDFLARE_CARRIER_AI_MODEL: '@cf/legacy-model',
    CLOUDFLARE_CARRIER_ENABLE_INTELLIGENCE_DIAGNOSTICS: '0',
  });

  assert.equal(config.capabilities.taskTools, false);
  assert.equal(config.capabilities.intelligenceDiagnostics, false);
  assert.equal(config.authorities.modelSelectionAuthority, 'canonical-d1-request-scoped');
  assert.equal('model' in config, false);
  assert.equal(JSON.stringify(config).includes('legacy-model'), false);
});

