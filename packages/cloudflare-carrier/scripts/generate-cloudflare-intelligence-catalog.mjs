import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCanonicalCloudflareTestSeed } from '@narada2/invokable-intelligence-contract';

const deploymentRevision = 4;
const createdAt = '2026-07-20T20:25:00.000Z';
const validUntil = '2036-07-20T20:25:00.000Z';
const targetSiteId = 'site:narada-cloudflare';
const targetSiteRegistryId = 'site_narada_cloudflare';
const siteRegistryId = 'narada.cloudflare-site-registry.v1';
const userSiteId = 'site:andrey-user';
const principalId = 'principal:admin';
const servicePrincipalId = 'principal:cloudflare-carrier-service';
const serviceGrantId = 'grant:cloudflare-carrier-service-workers-ai';
const serviceBudgetId = 'budget:cloudflare-carrier-service-workers-ai';
const serviceConsentId = 'authority-statement:cloudflare-carrier-service-consent';
const previousMaterializationEnvelopeIds = new Map([
  [
    'authority-statement:andrey-cloudflare-preferences',
    `materialization:narada-cloudflare:authority-statement:andrey-cloudflare-preferences:r${deploymentRevision - 1}`,
  ],
  [
    'authority-statement:admin-cloudflare-consent',
    `materialization:narada-cloudflare:authority-statement:admin-cloudflare-consent:r${deploymentRevision - 1}`,
  ],
  ...(deploymentRevision > 2 ? [[
    serviceConsentId,
    `materialization:narada-cloudflare:${serviceConsentId}:r${deploymentRevision - 1}`,
  ]] : []),
]);
const offeringId = 'model-offering:kimi-via-workers-ai';
const modelId = 'model:kimi-k2.7-code';
const evidenceRef = `site-config:narada-cloudflare:invokable-intelligence:revision-${deploymentRevision}`;
const targetAuthorityRef = 'authority:site:narada-cloudflare';
const userAuthorityRef = 'authority:site:andrey-user';

function replace(value, replacements) {
  if (typeof value === 'string') {
    return [...replacements.entries()]
      .sort(([left], [right]) => right.length - left.length)
      .reduce((output, [source, destination]) => output.replaceAll(source, destination), value);
  }
  if (Array.isArray(value)) return value.map((item) => replace(item, replacements));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item, replacements)]));
}

function catalogAuthority(document) {
  if (document.schema === 'narada.invokable-intelligence.authority-statement.v1') {
    return {
      kind: document.kind,
      locus: document.origin.locus,
      authority_ref: document.origin.authority_ref,
      ...(document.origin.site_id ? { site_id: document.origin.site_id } : {}),
      ...(document.origin.principal_id ? { principal_id: document.origin.principal_id } : {}),
    };
  }
  if (document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
    document.composition_digest = digest({
      offering: document.offering,
      endpoint: document.endpoint,
      adapter: document.adapter,
      topology: document.topology,
      execution_loci: document.execution_loci,
      access: document.access,
    });
  }
  if (document.schema === 'narada.invokable-intelligence.policy.v1') {
    if (document.locus === 'user-site') {
      return { kind: 'user-preference', locus: 'user-site', authority_ref: userAuthorityRef, site_id: userSiteId };
    }
    if (document.locus === 'host-site') {
      return { kind: 'execution-feasibility', locus: 'execution-site', authority_ref: targetAuthorityRef, site_id: targetSiteId };
    }
    return { kind: 'target-default', locus: 'target-site', authority_ref: targetAuthorityRef, site_id: targetSiteId };
  }
  if (document.schema === 'narada.invokable-intelligence.catalog-temporal-input.v1') {
    return { kind: 'temporal-input', locus: 'runtime-observer', authority_ref: 'authority:runtime:narada-cloudflare' };
  }
  return {
    kind: document.schema.includes('account') || document.schema.includes('grant') || document.schema.includes('entitlement')
      || document.schema.includes('quota') || document.schema.includes('budget') || document.schema.includes('governance')
      || document.schema.includes('principal') || document.schema.includes('credential-binding')
      ? 'account-definition'
      : 'catalog-definition',
    locus: 'target-site',
    site_id: targetSiteId,
    authority_ref: `${targetAuthorityRef}:catalog`,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function productionEvidence(value) {
  if (Array.isArray(value)) return value.map(productionEvidence);
  if (!value || typeof value !== 'object') return value;
  const output = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, productionEvidence(item)]));
  if (typeof output.kind === 'string' && typeof output.ref === 'string' && output.ref.includes('canonical-')) {
    output.kind = 'site-configuration';
    output.ref = evidenceRef;
  }
  return output;
}

let seed = buildCanonicalCloudflareTestSeed({
  invocationModelKey: '@cf/moonshotai/kimi-k2.7-code',
  now: createdAt,
  validUntil,
  principalId,
  targetSiteId,
});

seed = replace(seed, new Map([
  ['site:user', userSiteId],
  ['model:kimi-k2-thinking', modelId],
  ['policy:andrey-preferences', 'policy:andrey-cloudflare-preferences'],
  ['policy:narada-defaults', 'policy:narada-cloudflare-defaults'],
  ['policy:pc-eligibility', 'policy:cloudflare-execution-eligibility'],
  ['authority-statement:andrey-preferences', 'authority-statement:andrey-cloudflare-preferences'],
  ['authority-statement:narada-defaults', 'authority-statement:narada-cloudflare-defaults'],
  ['authority-statement:pc-eligibility', 'authority-statement:cloudflare-execution-eligibility'],
  ['authority-statement:andrey-cloudflare-consent', 'authority-statement:admin-cloudflare-consent'],
  ['temporal-input:canonical-local', `temporal-input:narada-cloudflare-catalog-revision-${deploymentRevision}`],
  ['site:cloudflare-account', targetSiteId],
  ['authority:site:narada:canonical-fixture', `${targetAuthorityRef}:catalog`],
  ['authority:site:user', userAuthorityRef],
  ['authority:site:narada', targetAuthorityRef],
  ['authority:site:pc', targetAuthorityRef],
  ['authority:principal:andrey', 'authority:principal:admin'],
  ['authority:principal:principal:andrey', 'authority:principal:admin'],
  ['authority:account-owner:site:user', `authority:account-owner:${userSiteId}`],
  ['authority:execution-site:site:pc', `authority:execution-site:${targetSiteId}`],
  ['authority:service-provider:inference-provider:remote-api', 'authority:service-provider:inference-provider:cloudflare-workers-ai'],
  ['authority:target-site:site:narada', `authority:target-site:${targetSiteId}`],
  ['clock-authority:test', 'authority:runtime:narada-cloudflare'],
])) ;

seed.id = `catalog-seed:narada-cloudflare:revision-${deploymentRevision}`;
seed.created_at = createdAt;
seed.records = seed.records.filter(({ document }) => ![
  'assert:canonical-local-thinking-levels',
  'assert:canonical-local-batch',
  'policy:narada-hard',
  'authority-statement:narada-hard',
  'authority-statement:canonical-local-thinking-levels',
  'authority-statement:canonical-local-batch',
].includes(document.id));
seed.records = seed.records.filter((record, index, records) =>
  records.findIndex(({ document }) => document.id === record.document.id) === index
);
const servicePrincipalAuthority = {
  owner_kind: 'principal',
  owner_id: servicePrincipalId,
  authority_ref: `authority:principal:cloudflare-carrier-service`,
};
seed.records.push(
  {
    schema: 'narada.invokable-intelligence.canonical-catalog-record.v1',
    record_kind: 'access',
    document: {
      schema: 'narada.invokable-intelligence.principal.v1',
      id: servicePrincipalId,
      kind: 'workload',
      authority: servicePrincipalAuthority,
      admission_bindings: [{
        id: 'principal-binding:cloudflare-carrier-service',
        kind: 'site-membership',
        registry: siteRegistryId,
        site_id: targetSiteRegistryId,
        roles: ['owner'],
        auth_types: ['service'],
      }],
    },
  },
  {
    schema: 'narada.invokable-intelligence.canonical-catalog-record.v1',
    record_kind: 'access',
    document: {
      schema: 'narada.invokable-intelligence.access-grant.v1',
      id: serviceGrantId,
      principal_id: servicePrincipalId,
      account_id: 'account:cloudflare-workers-ai',
      actions: ['invoke'],
      scope: {
        offering_ids: [offeringId],
        route_ids: ['route:kimi-workers-ai'],
        purposes: ['operator-chat', 'carrier-turn'],
        target_site_ids: [targetSiteId],
        topology_ids: ['topology:cloudflare-workers-ai'],
      },
      validity: { valid_from: createdAt, valid_until: validUntil },
      status: 'active',
      granted_by: {
        owner_kind: 'account-owner',
        owner_id: userSiteId,
        authority_ref: `authority:account-owner:${userSiteId}`,
      },
      principal_consent_ref: serviceConsentId,
      evidence: [{ kind: 'site-configuration', ref: evidenceRef }],
    },
  },
  {
    schema: 'narada.invokable-intelligence.canonical-catalog-record.v1',
    record_kind: 'access',
    document: {
      schema: 'narada.invokable-intelligence.budget-authorization.v1',
      id: serviceBudgetId,
      principal_id: servicePrincipalId,
      account_id: 'account:cloudflare-workers-ai',
      target_site_id: targetSiteId,
      currency: 'USD',
      limit: 100,
      committed: 1,
      reserved: 0,
      validity: { valid_from: createdAt, valid_until: validUntil },
      status: 'authorized',
      owner: {
        owner_kind: 'target-site',
        owner_id: targetSiteId,
        authority_ref: targetAuthorityRef,
      },
      evidence: [{ kind: 'site-configuration', ref: evidenceRef }],
    },
  },
  {
    schema: 'narada.invokable-intelligence.canonical-catalog-record.v1',
    record_kind: 'authority-statement',
    document: {
      schema: 'narada.invokable-intelligence.authority-statement.v1',
      id: serviceConsentId,
      kind: 'principal-consent',
      origin: {
        locus: 'principal',
        site_id: userSiteId,
        principal_id: servicePrincipalId,
        authority_ref: servicePrincipalAuthority.authority_ref,
      },
      effect: 'consent-gate',
      revision: deploymentRevision,
      issued_at: createdAt,
      payload_ref: serviceGrantId,
    },
  },
);

for (const record of seed.records) {
  const document = record.document;
  if (document.schema === 'narada.invokable-intelligence.site.v1' && document.id === targetSiteId) {
    document.registry_bindings = [{ registry: siteRegistryId, subject_id: targetSiteRegistryId }];
  }
  if (document.schema === 'narada.invokable-intelligence.principal.v1' && document.id === principalId) {
    document.kind = 'site';
    document.admission_bindings = [{
      id: 'principal-binding:narada-cloudflare-operators',
      kind: 'site-membership',
      registry: siteRegistryId,
      site_id: targetSiteRegistryId,
      roles: ['owner', 'maintainer', 'operator'],
      auth_types: ['microsoft_oidc', 'user'],
    }];
  }
  if (document.id === modelId) document.display_name = 'Kimi K2.7 Code';
  if (document.id === 'policy:narada-cloudflare-defaults') {
    document.rules = [
      {
        type: 'default-option',
        option: 'model_offering',
        value: offeringId,
        reason: 'Narada Cloudflare Site default when the invocation does not request a model.',
      },
      {
        type: 'default-option',
        option: 'timeout_ms',
        value: 15000,
        reason: 'Narada Cloudflare Site provider-attempt deadline.',
      },
    ];
  }
  if (document.id === 'policy:andrey-cloudflare-preferences') {
    document.rules = [{
      type: 'prefer-resource',
      resource: { kind: 'model-offering', id: offeringId },
      weight: 10,
      reason: 'Current User Site preference among already eligible Cloudflare routes.',
    }];
  }
  if (document.id === 'policy:cloudflare-execution-eligibility') {
    document.rules = [{
      type: 'allow-resource',
      resource: { kind: 'adapter', id: 'adapter:workers-ai-binding' },
      reason: 'The Cloudflare execution Site admits only its bound Workers AI adapter.',
    }];
  }
  if (document.schema === 'narada.invokable-intelligence.invocation-route-candidate.v1') {
    document.access.grant_refs = [...new Set([
      ...(document.access.grant_refs ?? []),
      serviceGrantId,
    ])];
    for (const edge of document.topology?.edges ?? []) {
      if (edge.boundary?.admission?.validity) {
        edge.boundary.admission.validity = {
          valid_from: createdAt,
          valid_until: validUntil,
          fresh_as_of: createdAt,
        };
      }
    }
  }
  if (document.schema === 'narada.invokable-intelligence.access-grant.v1') {
    document.actions = ['invoke'];
  }
  if (document.schema === 'narada.invokable-intelligence.service-entitlement.v1') {
    document.features = ['invoke'];
  }
  if (document.schema === 'narada.invokable-intelligence.authority-statement.v1'
      && document.kind === 'principal-consent') {
    document.origin.site_id = userSiteId;
  }
  if (document.schema === 'narada.invokable-intelligence.catalog-temporal-input.v1') {
    document.clock = {
      source: 'site-configuration-clock',
      authority_ref: 'authority:site:narada-cloudflare:configuration',
      instant: createdAt,
      timezone: 'UTC',
      local: { date: '2026-07-20', time: '20:00:00', weekday: 1 },
    };
    document.valid_until = validUntil;
  }
  record.authority = catalogAuthority(document);
}

seed = productionEvidence(seed);
seed.records.forEach((record, index) => {
  if (record.document.schema === 'narada.invokable-intelligence.authority-statement.v1') {
    record.document.revision = deploymentRevision;
  }
  record.id = `catalog-record:narada-cloudflare:r${deploymentRevision}:${String(index + 1).padStart(3, '0')}`;
  record.record_id = record.document.id;
  record.revision = deploymentRevision;
  record.source = {
    schema: 'narada.site.invokable-intelligence.catalog-source.v1',
    reference: evidenceRef,
    revision: String(deploymentRevision),
    digest: digest(record.document),
  };
  record.validation = {
    status: 'accepted',
    validator: 'narada-invokable-intelligence-management/1',
    validated_at: createdAt,
    evidence: [{ kind: 'site-configuration', ref: evidenceRef }],
  };
});

const outputPath = fileURLToPath(new URL('../config/invokable-intelligence.catalog.json', import.meta.url));
await mkdir(dirname(outputPath), { recursive: true });
const catalogText = `${JSON.stringify(seed, null, 2)}\n`;
await writeFile(outputPath, catalogText, 'utf8');

const materializations = seed.records
  .filter(({ document }) => document.schema === 'narada.invokable-intelligence.authority-statement.v1'
    && document.origin.site_id && document.origin.site_id !== targetSiteId)
  .map((statementRecord) => {
    const statement = statementRecord.document;
    const payloadRecord = seed.records.find(({ record_id }) => record_id === statement.payload_ref);
    if (!payloadRecord) throw new Error(`missing materialization payload '${statement.payload_ref}'`);
    const envelopeId = `materialization:narada-cloudflare:${statement.id}:r${statement.revision}`;
    const admissionId = `admission:narada-cloudflare:${statement.id}:r${statement.revision}`;
    const supersedes = previousMaterializationEnvelopeIds.get(statement.id);
    return {
      envelope: {
        schema: 'narada.invokable-intelligence.materialization-envelope.v1',
        id: envelopeId,
        mode: 'durable-projection',
        origin: {
          site_id: statement.origin.site_id,
          locus: statement.origin.locus,
          authority_ref: statement.origin.authority_ref,
        },
        destination: { site_id: targetSiteId, resolver: 'cloudflare', store: 'd1' },
        statement: {
          id: statement.id,
          kind: statement.kind,
          effect: statement.effect,
          source_revision: statement.revision,
          payload_digest: payloadRecord.source.digest,
          payload_ref: payloadRecord.id,
        },
        allowed_scope: {
          purposes: ['operator-chat', 'carrier-turn'],
          target_site_ids: [targetSiteId],
           principal_ids: [principalId, servicePrincipalId],
        },
        issued_at: createdAt,
        expires_at: validUntil,
        provenance_refs: [evidenceRef, statement.origin.authority_ref],
        authorization_ref: `authorization:narada-cloudflare:materialize:${statement.id}`,
        ...(supersedes ? { supersedes } : {}),
      },
      admission: {
        schema: 'narada.invokable-intelligence.materialization-admission.v1',
        id: admissionId,
        envelope_id: envelopeId,
        destination_site_id: targetSiteId,
        decision: 'admitted',
        decided_at: createdAt,
        decided_by: 'site-operator:narada-cloudflare',
        reason_codes: [],
        evidence_refs: [evidenceRef, `admission-policy:narada-cloudflare:${statement.kind}`],
        admitted_digest: payloadRecord.source.digest,
      },
    };
  });
const materializationPath = fileURLToPath(new URL('../config/invokable-intelligence.materializations.json', import.meta.url));
const materializationText = `${JSON.stringify({
  schema: 'narada.site.invokable-intelligence.materialization-seed.v1',
  id: `materialization-seed:narada-cloudflare:revision-${deploymentRevision}`,
  created_at: createdAt,
  materializations,
}, null, 2)}\n`;
await writeFile(materializationPath, materializationText, 'utf8');

const manifestPath = fileURLToPath(new URL('../config/invokable-intelligence.deployment.json', import.meta.url));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.id = `deployment:narada-cloudflare:invokable-intelligence:revision-${deploymentRevision}`;
manifest.consent_ref = `authorization:narada-cloudflare:intelligence-deployment:revision-${deploymentRevision}`;
manifest.decided_at = createdAt;
manifest.evidence_refs = [
  manifest.consent_ref,
  'authority:site:narada-cloudflare:catalog',
  evidenceRef,
];
manifest.catalog.sha256 = createHash('sha256').update(catalogText).digest('hex');
manifest.materializations.sha256 = createHash('sha256').update(materializationText).digest('hex');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
