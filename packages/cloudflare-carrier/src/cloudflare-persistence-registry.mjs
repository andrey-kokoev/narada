/**
 * Named persistence ownership for the Cloudflare carrier.
 *
 * The Worker may still use compatibility SQL while bounded-context extraction
 * proceeds, but every carrier table has one declared owner and repositories
 * expose the only persistence port that new adapters should consume.
 */

const PERSISTENCE_DOMAINS = Object.freeze({
  'carrier-events': {
    owner: 'carrier-events-repository',
    schema_owner: 'cloudflare-carrier-session-events-schema',
    tables: ['cloudflare_carrier_session_events'],
  },
  'local-ingress': {
    owner: 'local-ingress-repository',
    schema_owner: 'cloudflare-local-ingress-schema',
    tables: [
      'cloudflare_local_ingress_evidence',
      'cloudflare_local_ingress_provider_heartbeats',
      'cloudflare_local_ingress_requests',
    ],
  },
  'resident-dispatch': {
    owner: 'resident-dispatch-repository',
    schema_owner: 'cloudflare-resident-dispatch-schema',
    tables: [
      'cloudflare_local_resident_carrier_bridge',
      'cloudflare_resident_dispatch_decisions',
      'cloudflare_resident_dispatch_windows_fallback_evidence',
      'cloudflare_resident_dispatch_windows_fallback_requests',
      'cloudflare_resident_loop_shadow_runs',
    ],
  },
  mailbox: {
    owner: 'mailbox-repository',
    schema_owner: 'cloudflare-mailbox-schema',
    tables: [
      'cloudflare_mailbox_draft_reply_proposals',
      'cloudflare_mailbox_outlook_draft_creates',
      'cloudflare_mailbox_send_accepted_records',
      'cloudflare_mailbox_send_confirmation_records',
      'cloudflare_mailbox_send_review_records',
      'cloudflare_mailbox_status_shadow_reads',
      'cloudflare_mailbox_status_source_reads',
    ],
  },
  operation: {
    owner: 'operation-repository',
    schema_owner: 'cloudflare-operation-schema',
    tables: ['cloudflare_operation_focus_review_records'],
  },
  'operator-session': {
    owner: 'operator-session-repository',
    schema_owner: 'cloudflare-operator-session-schema',
    tables: ['cloudflare_operator_sessions'],
  },
  'repository-publication': {
    owner: 'repository-publication-repository',
    schema_owner: 'cloudflare-repository-publication-schema',
    tables: [
      'cloudflare_repository_publication_admissions',
      'cloudflare_repository_publication_evidence',
      'cloudflare_repository_publication_executions',
      'cloudflare_repository_publication_provider_heartbeats',
      'cloudflare_repository_publication_requests',
    ],
  },
  continuity: {
    owner: 'site-continuity-repository',
    schema_owner: 'cloudflare-site-continuity-schema',
    tables: [
      'cloudflare_site_continuity_loop_reports',
      'cloudflare_site_continuity_packets',
      'cloudflare_site_continuity_reconciliation_executions',
    ],
  },
  'site-file': {
    owner: 'site-file-repository',
    schema_owner: 'cloudflare-site-file-schema',
    tables: [
      'cloudflare_site_file_change_proposals',
      'cloudflare_site_file_materializations',
    ],
  },
  'task-lifecycle': {
    owner: 'task-lifecycle-repository',
    schema_owner: 'cloudflare-task-lifecycle-schema',
    tables: [
      'cloudflare_task_lifecycle_shadow_reads',
      'cloudflare_task_lifecycle_tasks',
      'cloudflare_task_lifecycle_write_admissions',
    ],
  },
  'task-store': {
    owner: 'carrier-task-store-repository',
    schema_owner: 'narada-tasks-migration',
    tables: ['narada_tasks'],
  },
  'webhook-delay': {
    owner: 'webhook-delay-repository',
    schema_owner: 'cloudflare-webhook-delay-schema',
    tables: [
      'cloudflare_webhook_delay_directive_deliveries',
      'cloudflare_webhook_delay_directive_dual_records',
      'cloudflare_webhook_delay_observation_primary_reads',
      'cloudflare_webhook_delay_remote_source_samples',
      'cloudflare_webhook_delay_scheduled_source_reads',
      'cloudflare_webhook_delay_shadow_observations',
    ],
  },
});

export const CLOUDFLARE_CARRIER_PERSISTENCE_DOMAINS = PERSISTENCE_DOMAINS;

export const CLOUDFLARE_CARRIER_PERSISTENCE_SCHEMA_MANIFEST = Object.freeze(
  Object.entries(PERSISTENCE_DOMAINS).flatMap(([domain, definition]) => definition.tables.map((table) => ({
    domain,
    owner: definition.owner,
    schema_owner: definition.schema_owner,
    table,
  }))),
);

const TABLE_TO_DOMAIN = new Map(
  CLOUDFLARE_CARRIER_PERSISTENCE_SCHEMA_MANIFEST.map(({ table, domain }) => [table, domain]),
);

export function createCloudflarePersistenceRegistry(db) {
  if (!db || typeof db.prepare !== 'function') return null;
  const repositories = new Map(
    Object.keys(PERSISTENCE_DOMAINS).map((domain) => [
      domain,
      createCloudflarePersistenceRepository(db, domain),
    ]),
  );
  return {
    domains: Object.freeze([...repositories.keys()]),
    schema_manifest: CLOUDFLARE_CARRIER_PERSISTENCE_SCHEMA_MANIFEST,
    repository(domain) {
      return repositories.get(domain) ?? null;
    },
  };
}

export function createCloudflarePersistenceRepository(db, domain) {
  if (!db || typeof db.prepare !== 'function') return null;
  const definition = PERSISTENCE_DOMAINS[domain];
  if (!definition) throw new Error(`cloudflare_persistence_unknown_domain:${domain}`);
  const tables = new Set(definition.tables);
  const prepare = (sql) => {
    assertPersistenceSqlScope(sql, tables, domain);
    return db.prepare(sql);
  };
  return {
    domain,
    owner: definition.owner,
    schema_owner: definition.schema_owner,
    tables: Object.freeze([...definition.tables]),
    prepare,
    async run(sql, ...bindings) {
      return prepare(sql).bind(...bindings).run();
    },
    async first(sql, ...bindings) {
      return prepare(sql).bind(...bindings).first();
    },
    async all(sql, ...bindings) {
      return prepare(sql).bind(...bindings).all();
    },
  };
}

export function persistenceDomainForTable(table) {
  return TABLE_TO_DOMAIN.get(table) ?? null;
}

function assertPersistenceSqlScope(sql, tables, domain) {
  const referencedTables = [...String(sql).matchAll(/\b(?:from|join|into|update|table)\s+([a-z0-9_]+)/giu)]
    .map((match) => match[1].toLowerCase())
    .filter((table) => TABLE_TO_DOMAIN.has(table));
  const foreignTable = referencedTables.find((table) => !tables.has(table));
  if (foreignTable) {
    throw new Error(`cloudflare_persistence_cross_domain_query:${domain}:${foreignTable}`);
  }
}
