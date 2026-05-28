import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

export type DashboardRowState =
  | 'ok'
  | 'info'
  | 'attention'
  | 'warning'
  | 'blocked'
  | 'error'
  | 'unknown';

export interface DashboardFreshness {
  status: 'fresh' | 'stale' | 'missing' | 'unknown';
  observed_at?: string;
  stale_after?: string;
  basis?: string;
}

export interface DashboardEvidenceRef {
  ref?: string;
  path?: string;
  label?: string;
}

export type DashboardDetail =
  | string
  | number
  | boolean
  | null
  | DashboardDetail[]
  | { [key: string]: DashboardDetail };

export interface DashboardRow {
  id: string;
  label: string;
  state: DashboardRowState;
  basis: string;
  evidence_refs?: DashboardEvidenceRef[];
  evidence_paths?: string[];
  observed_at?: string;
  next_action?: string;
  detail?: DashboardDetail;
  freshness?: DashboardFreshness;
  authority_limits?: string[];
}

export interface DashboardSection {
  id: string;
  title: string;
  summary?: string;
  rows: DashboardRow[];
}

export interface DashboardSnapshot {
  schema: 'narada.site_operational_dashboard.snapshot.v0';
  snapshot_id: string;
  generated_at: string;
  title: string;
  subtitle?: string;
  sections: DashboardSection[];
  authority_limits?: string[];
  evidence_refs?: string[];
}

export interface DashboardSectionSummary {
  section_id: string;
  title: string;
  total_rows: number;
  attention_rows: number;
  states: Record<DashboardRowState, number>;
}

export interface DashboardSnapshotValidation {
  status: 'valid' | 'invalid';
  errors: string[];
  raw_secret_markers_found: string[];
  bounded_json_bytes: number;
}

export interface RenderDashboardOptions {
  maxEmbeddedJsonBytes?: number;
  documentTitle?: string;
}

export interface DashboardServerContext {
  siteRoot?: string;
  generatedAt: string;
  refreshMs: number;
}

export interface DashboardServerOptions extends RenderDashboardOptions {
  loadSnapshot: (context: DashboardServerContext) => DashboardSnapshot | Promise<DashboardSnapshot>;
  siteRoot?: string;
  refreshMs?: number;
  now?: () => Date;
  accessToken?: string;
  tokenStorageKey?: string;
}

export interface SiteRegistryProjectionInput {
  source?: unknown;
  evidenceRef?: string;
  observedAt?: string;
  maxFreshAgeSeconds?: number;
  now?: Date | string;
  liveFetch?: {
    enabled: boolean;
    url?: string;
    boundedOutput?: boolean;
  };
}

export const DASHBOARD_SCHEMA = 'narada.site_operational_dashboard.snapshot.v0';
const DEFAULT_MAX_EMBEDDED_JSON_BYTES = 64 * 1024;
const DEFAULT_REFRESH_MS = 5000;
const DEFAULT_REGISTRY_FRESH_SECONDS = 15 * 60;
const ATTENTION_STATES: DashboardRowState[] = ['attention', 'warning', 'blocked', 'error'];
const ROW_STATES: DashboardRowState[] = ['ok', 'info', 'attention', 'warning', 'blocked', 'error', 'unknown'];
const RAW_SECRET_MARKERS = [
  /secret[_-]?token/i,
  /api[_-]?key/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer\s+[a-z0-9._~+/-]+/i,
  /password/i,
  /private[_-]?key/i,
];

export function validateDashboardSnapshot(
  snapshot: unknown,
  options: RenderDashboardOptions = {},
): DashboardSnapshotValidation {
  const errors: string[] = [];
  if (!isRecord(snapshot)) {
    return {
      status: 'invalid',
      errors: ['snapshot_must_be_object'],
      raw_secret_markers_found: [],
      bounded_json_bytes: 0,
    };
  }

  if (snapshot.schema !== DASHBOARD_SCHEMA) errors.push('dashboard_schema_invalid');
  if (!nonEmptyString(snapshot.snapshot_id)) errors.push('dashboard_snapshot_id_required');
  if (!nonEmptyString(snapshot.generated_at)) errors.push('dashboard_generated_at_required');
  if (!nonEmptyString(snapshot.title)) errors.push('dashboard_title_required');
  if (!Array.isArray(snapshot.sections) || snapshot.sections.length === 0) {
    errors.push('dashboard_sections_required');
  } else {
    for (const [sectionIndex, section] of snapshot.sections.entries()) {
      validateSection(section, sectionIndex, errors);
    }
  }

  const rawJson = stableStringify(snapshot);
  const rawSecretMarkersFound = findRawSecretMarkers(rawJson);
  if (rawSecretMarkersFound.length > 0) errors.push('dashboard_raw_secret_marker_found');

  const boundedJsonBytes = byteLength(rawJson);
  const maxEmbeddedJsonBytes = options.maxEmbeddedJsonBytes ?? DEFAULT_MAX_EMBEDDED_JSON_BYTES;
  if (boundedJsonBytes > maxEmbeddedJsonBytes) errors.push('dashboard_embedded_json_too_large');

  return {
    status: errors.length === 0 ? 'valid' : 'invalid',
    errors,
    raw_secret_markers_found: rawSecretMarkersFound,
    bounded_json_bytes: boundedJsonBytes,
  };
}

export function summarizeDashboardSections(snapshot: DashboardSnapshot): DashboardSectionSummary[] {
  return snapshot.sections.map((section) => {
    const states = emptyStateCounts();
    let attentionRows = 0;
    for (const row of section.rows) {
      states[row.state] += 1;
      if (isAttentionState(row.state)) attentionRows += 1;
    }
    return {
      section_id: section.id,
      title: section.title,
      total_rows: section.rows.length,
      attention_rows: attentionRows,
      states,
    };
  });
}

export function renderDashboardHtml(
  snapshot: DashboardSnapshot,
  options: RenderDashboardOptions = {},
): string {
  const validation = validateDashboardSnapshot(snapshot, options);
  if (validation.status !== 'valid') {
    throw new Error(`Invalid dashboard snapshot: ${validation.errors.join(', ')}`);
  }

  const summaries = summarizeDashboardSections(snapshot);
  const embeddedPayload = {
    snapshot,
    summaries,
    embedded_at: snapshot.generated_at,
    bounds: {
      max_embedded_json_bytes: options.maxEmbeddedJsonBytes ?? DEFAULT_MAX_EMBEDDED_JSON_BYTES,
      embedded_json_bytes: validation.bounded_json_bytes,
      raw_secret_markers_found: false,
    },
  };
  const json = safeJsonForHtml(embeddedPayload);
  const documentTitle = options.documentTitle ?? snapshot.title;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <style>${defaultCss()}</style>
</head>
<body>
  <main class="dashboard-shell">
    <header class="dashboard-header">
      <div>
        <p class="eyebrow">Site Operational Dashboard</p>
        <h1>${escapeHtml(snapshot.title)}</h1>
        ${snapshot.subtitle ? `<p class="subtitle">${escapeHtml(snapshot.subtitle)}</p>` : ''}
      </div>
      <dl class="snapshot-meta">
        <div><dt>Snapshot</dt><dd>${escapeHtml(snapshot.snapshot_id)}</dd></div>
        <div><dt>Generated</dt><dd>${escapeHtml(snapshot.generated_at)}</dd></div>
      </dl>
    </header>

    <section class="toolbar" aria-label="Dashboard filters">
      <label>Section <select id="section-filter"><option value="all">All sections</option>${snapshot.sections.map((section) => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.title)}</option>`).join('')}</select></label>
      <label>State <select id="state-filter"><option value="all">All states</option>${ROW_STATES.map((state) => `<option value="${state}">${state}</option>`).join('')}</select></label>
      <label class="checkbox"><input id="attention-only" type="checkbox"> Attention only</label>
      <button id="inspect-payload" type="button">Inspect payload</button>
    </section>

    <section class="summary-grid" aria-label="Section summaries">
      ${summaries.map(renderSectionSummary).join('')}
    </section>

    <section class="sections">
      ${snapshot.sections.map(renderSection).join('')}
    </section>

    ${snapshot.authority_limits?.length ? `<section class="authority"><h2>Authority Limits</h2><ul>${snapshot.authority_limits.map((limit) => `<li>${escapeHtml(limit)}</li>`).join('')}</ul></section>` : ''}

    <dialog id="payload-dialog">
      <form method="dialog">
        <header><h2>Embedded Payload</h2><button type="submit">Close</button></header>
        <pre id="payload-view"></pre>
      </form>
    </dialog>
  </main>
  <script id="dashboard-data" type="application/json">${json}</script>
  <script>${defaultJavascript()}</script>
</body>
</html>`;
}

export function createDashboardServer(options: DashboardServerOptions): Server {
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const now = options.now ?? (() => new Date());
  const tokenRequired = nonEmptyString(options.accessToken);
  return createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        jsonResponse(response, 405, { error: 'dashboard_server_read_only', allowed_methods: ['GET', 'HEAD'] });
        return;
      }
      const path = requestPath(request);
      if (path === '/' || path === '/index.html') {
        if (tokenRequired) {
          textResponse(response, 200, renderTokenGuardedDashboardShell(options), 'text/html; charset=utf-8', request.method === 'HEAD');
          return;
        }
        const snapshot = await loadValidatedSnapshot(options, { siteRoot: options.siteRoot, generatedAt: now().toISOString(), refreshMs });
        const html = renderDashboardHtml(snapshot, options);
        textResponse(response, 200, html, 'text/html; charset=utf-8', request.method === 'HEAD');
        return;
      }
      if (path === '/snapshot.json' || path === '/api/snapshot') {
        if (tokenRequired && !authorizedDashboardRequest(request, options.accessToken ?? '')) {
          tokenRefusalResponse(response, request.method === 'HEAD');
          return;
        }
        const snapshot = await loadValidatedSnapshot(options, { siteRoot: options.siteRoot, generatedAt: now().toISOString(), refreshMs });
        const summaries = summarizeDashboardSections(snapshot);
        jsonResponse(response, 200, {
          schema: 'narada.site_operational_dashboard.live_snapshot_response.v0',
          snapshot,
          summaries,
          attention: attentionRows(snapshot),
          refresh_ms: refreshMs,
          site_root: options.siteRoot,
          authority_limits: [
            'dashboard_server_is_read_only',
            'snapshot_response_is_projection_not_site_authority',
            'raw_secret_values_excluded',
          ],
        }, request.method === 'HEAD');
        return;
      }
      jsonResponse(response, 404, { error: 'dashboard_route_not_found' }, request.method === 'HEAD');
    } catch (error) {
      jsonResponse(response, 500, {
        error: 'dashboard_snapshot_load_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function renderTokenGuardedDashboardShell(options: DashboardServerOptions): string {
  const storageKey = options.tokenStorageKey ?? 'narada.site_operational_dashboard.access_token';
  const title = options.documentTitle ?? 'Site Operational Dashboard';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${defaultCss()}</style>
</head>
<body>
  <main class="dashboard-shell">
    <header class="dashboard-header">
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>Token-guarded local read-only dashboard.</p>
      </div>
      <div class="authority">
        <h2>Access</h2>
        <form id="token-form">
          <label for="dashboard-token">Bearer token</label>
          <input id="dashboard-token" name="token" type="password" autocomplete="off">
          <button type="submit">Load</button>
          <button id="clear-token" type="button">Clear</button>
        </form>
      </div>
    </header>
    <section id="dashboard-status" class="authority" role="status">Dashboard data requires an operator-entered bearer token.</section>
    <section id="dashboard-live"></section>
  </main>
  <script>${tokenGuardedDashboardJavascript(storageKey)}</script>
</body>
</html>`;
}

export function buildSiteRegistryProjectionSection(input: SiteRegistryProjectionInput = {}): DashboardSection {
  return {
    id: 'site-registry-projection',
    title: 'Registry Projection',
    summary: 'Hosted Site Registry read model and adjacent telemetry projection posture.',
    rows: buildSiteRegistryProjectionRows(input),
  };
}

export function buildSiteRegistryProjectionRows(input: SiteRegistryProjectionInput = {}): DashboardRow[] {
  const source = isRecord(input.source) ? input.source : undefined;
  const evidence = input.evidenceRef ?? 'site-registry-projection:caller-supplied';
  const observedAt = firstString(
    input.observedAt,
    valueAt(source, ['site_event', 'observed_at']),
    valueAt(source, ['at']),
    valueAt(source, ['observed_at']),
  );
  const freshness = freshnessFor(observedAt, input.now, input.maxFreshAgeSeconds ?? DEFAULT_REGISTRY_FRESH_SECONDS);
  const activeRelation = isRecord(source?.active_relation) ? source.active_relation : undefined;
  const withdrawal = isRecord(source?.site_withdrawal) ? source.site_withdrawal : undefined;
  const suppression = isRecord(source?.registry_suppression) ? source.registry_suppression : undefined;
  const liveSafety = isRecord(source?.live_safety) ? source.live_safety : undefined;
  const pendingRemoteMessages = numberValue(
    valueAt(source, ['pending_remote_messages']),
    valueAt(source, ['remote_messages', 'pending_count']),
  );

  return [
    {
      id: 'site-registry-freshness',
      label: 'Hosted registry freshness',
      state: freshness.status === 'fresh' ? 'ok' : freshness.status === 'stale' ? 'warning' : 'unknown',
      basis: observedAt ? `Projection observed_at=${observedAt}.` : 'Projection observed time is missing.',
      observed_at: observedAt,
      freshness,
      evidence_refs: [{ ref: evidence, label: 'registry projection input' }],
      detail: {
        projection_source: source ? 'caller_supplied_read_model_or_fixture' : 'missing',
        max_fresh_age_seconds: input.maxFreshAgeSeconds ?? DEFAULT_REGISTRY_FRESH_SECONDS,
      },
      authority_limits: registryProjectionAuthorityLimits(),
    },
    {
      id: 'site-registry-relation-lifecycle',
      label: 'Relation lifecycle projection',
      state: activeRelation || withdrawal || suppression ? 'ok' : 'unknown',
      basis: activeRelation || withdrawal || suppression
        ? 'Relation lifecycle events are present in the projection input.'
        : 'No relation lifecycle projection was supplied.',
      observed_at: firstString(valueAt(activeRelation, ['occurred_at']), valueAt(withdrawal, ['occurred_at']), observedAt),
      evidence_refs: [{ ref: evidence, label: 'relation lifecycle projection' }],
      detail: {
        active_relation: relationSummary(activeRelation),
        withdrawal: relationSummary(withdrawal),
        suppression: relationSummary(suppression),
      },
      authority_limits: registryProjectionAuthorityLimits(),
    },
    {
      id: 'site-registry-publication-edge',
      label: 'Publication edge posture',
      state: publicationEdgeState(activeRelation, withdrawal, suppression),
      basis: publicationEdgeBasis(activeRelation, withdrawal, suppression),
      observed_at: firstString(valueAt(withdrawal, ['occurred_at']), valueAt(activeRelation, ['occurred_at']), observedAt),
      evidence_refs: [{ ref: evidence, label: 'publication edge projection' }],
      detail: {
        active_state: stringOrUnknown(valueAt(activeRelation, ['to_state']), valueAt(activeRelation, ['state'])),
        active_visibility: stringOrUnknown(valueAt(activeRelation, ['to_visibility']), valueAt(activeRelation, ['visibility'])),
        withdrawal_state: stringOrUnknown(valueAt(withdrawal, ['to_state']), valueAt(withdrawal, ['state'])),
        withdrawal_visibility: stringOrUnknown(valueAt(withdrawal, ['to_visibility']), valueAt(withdrawal, ['visibility'])),
      },
      authority_limits: registryProjectionAuthorityLimits(),
    },
    {
      id: 'site-registry-pending-remote-messages',
      label: 'Pending remote messages',
      state: pendingRemoteMessages === undefined ? 'unknown' : pendingRemoteMessages > 0 ? 'attention' : 'ok',
      basis: pendingRemoteMessages === undefined
        ? 'No pending remote message count was supplied.'
        : `Projection reports ${pendingRemoteMessages} pending remote message(s).`,
      observed_at: observedAt,
      evidence_refs: [{ ref: evidence, label: 'remote message projection' }],
      detail: { pending_count: pendingRemoteMessages ?? 'unknown' },
      authority_limits: registryProjectionAuthorityLimits(),
    },
    {
      id: 'site-registry-capability-readiness',
      label: 'Capability readiness projection',
      state: capabilityReadinessState(source, liveSafety),
      basis: capabilityReadinessBasis(source, liveSafety),
      observed_at: observedAt,
      evidence_refs: [{ ref: evidence, label: 'capability posture projection' }],
      detail: {
        event_capability_ref_present: Boolean(valueAt(source, ['site_event', 'auth', 'capability_ref'])),
        live_mutation_gate: stringOrUnknown(valueAt(liveSafety, ['mutation_gate_env']), 'not_supplied'),
        raw_values_recorded: Boolean(liveSafety?.raw_secret_values_recorded),
      },
      authority_limits: [
        ...registryProjectionAuthorityLimits(),
        'capability_posture_row_is_not_capability_grant',
      ],
    },
    {
      id: 'site-registry-live-fetch-posture',
      label: 'Live fetch posture',
      state: input.liveFetch?.enabled ? (input.liveFetch.boundedOutput ? 'attention' : 'blocked') : 'ok',
      basis: input.liveFetch?.enabled
        ? 'Live fetch was explicitly enabled by caller configuration.'
        : 'Live network fetch is disabled; provider consumed caller-supplied projection input only.',
      observed_at: input.liveFetch?.enabled ? nowDate(input.now).toISOString() : observedAt,
      evidence_refs: [{ ref: evidence, label: 'live fetch posture' }],
      detail: {
        live_fetch_enabled: input.liveFetch?.enabled === true,
        bounded_output: input.liveFetch?.boundedOutput === true,
        url_present: Boolean(input.liveFetch?.url),
      },
      authority_limits: [
        ...registryProjectionAuthorityLimits(),
        'live_fetch_requires_explicit_caller_configuration',
        'live_fetch_result_is_observation_not_site_authority',
      ],
    },
  ];
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function safeJsonForHtml(value: unknown): string {
  return stableStringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function validateSection(section: unknown, sectionIndex: number, errors: string[]): void {
  if (!isRecord(section)) {
    errors.push(`dashboard_section_${sectionIndex}_must_be_object`);
    return;
  }
  if (!nonEmptyString(section.id)) errors.push(`dashboard_section_${sectionIndex}_id_required`);
  if (!nonEmptyString(section.title)) errors.push(`dashboard_section_${sectionIndex}_title_required`);
  if (!Array.isArray(section.rows)) {
    errors.push(`dashboard_section_${sectionIndex}_rows_required`);
    return;
  }
  for (const [rowIndex, row] of section.rows.entries()) {
    validateRow(row, sectionIndex, rowIndex, errors);
  }
}

function validateRow(row: unknown, sectionIndex: number, rowIndex: number, errors: string[]): void {
  if (!isRecord(row)) {
    errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_must_be_object`);
    return;
  }
  if (!nonEmptyString(row.id)) errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_id_required`);
  if (!nonEmptyString(row.label)) errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_label_required`);
  if (!isRowState(row.state)) errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_state_invalid`);
  if (!nonEmptyString(row.basis)) errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_basis_required`);
  if ('evidence_refs' in row && !isEvidenceRefs(row.evidence_refs)) {
    errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_evidence_refs_invalid`);
  }
  if ('evidence_paths' in row && !isStringArray(row.evidence_paths)) {
    errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_evidence_paths_invalid`);
  }
  if ('authority_limits' in row && !isStringArray(row.authority_limits)) {
    errors.push(`dashboard_section_${sectionIndex}_row_${rowIndex}_authority_limits_invalid`);
  }
}

function renderSectionSummary(summary: DashboardSectionSummary): string {
  return `<article class="summary-card" data-section="${escapeHtml(summary.section_id)}">
    <h2>${escapeHtml(summary.title)}</h2>
    <p><strong>${summary.total_rows}</strong> rows, <strong>${summary.attention_rows}</strong> need attention</p>
  </article>`;
}

function renderSection(section: DashboardSection): string {
  return `<section class="dashboard-section" data-section="${escapeHtml(section.id)}">
    <header><h2>${escapeHtml(section.title)}</h2>${section.summary ? `<p>${escapeHtml(section.summary)}</p>` : ''}</header>
    <div class="row-list">
      ${section.rows.map((row) => renderRow(row, section.id)).join('')}
    </div>
  </section>`;
}

function renderRow(row: DashboardRow, sectionId: string): string {
  const detail = row.detail === undefined ? '' : `<details><summary>Detail</summary><pre>${escapeHtml(stableStringify(row.detail))}</pre></details>`;
  const evidence = [
    ...(row.evidence_refs ?? []).map((ref) => ref.label ?? ref.ref ?? ref.path ?? ''),
    ...(row.evidence_paths ?? []),
  ].filter(nonEmptyString);
  return `<article class="dashboard-row state-${row.state}" data-section="${escapeHtml(sectionId)}" data-state="${row.state}" data-attention="${isAttentionState(row.state) ? 'true' : 'false'}">
    <div class="row-main">
      <span class="state-pill">${escapeHtml(row.state)}</span>
      <h3>${escapeHtml(row.label)}</h3>
      <p>${escapeHtml(row.basis)}</p>
    </div>
    <dl class="row-meta">
      ${row.observed_at ? `<div><dt>Observed</dt><dd>${escapeHtml(row.observed_at)}</dd></div>` : ''}
      ${row.freshness ? `<div><dt>Freshness</dt><dd>${escapeHtml(row.freshness.status)}${row.freshness.basis ? `: ${escapeHtml(row.freshness.basis)}` : ''}</dd></div>` : ''}
      ${row.next_action ? `<div><dt>Next</dt><dd>${escapeHtml(row.next_action)}</dd></div>` : ''}
    </dl>
    ${evidence.length ? `<p class="evidence">Evidence: ${evidence.map(escapeHtml).join(', ')}</p>` : ''}
    ${row.authority_limits?.length ? `<p class="limits">Limits: ${row.authority_limits.map(escapeHtml).join(', ')}</p>` : ''}
    ${detail}
  </article>`;
}

function defaultCss(): string {
  return `
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f4f6f8; color: #1f2933; }
body { margin: 0; }
button, select { font: inherit; }
.dashboard-shell { max-width: 1180px; margin: 0 auto; padding: 24px; }
.dashboard-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #d9e2ec; padding-bottom: 18px; }
.eyebrow { margin: 0 0 6px; color: #52606d; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }
h1 { margin: 0; font-size: 2rem; letter-spacing: 0; }
.subtitle { margin: 8px 0 0; color: #3e4c59; }
.snapshot-meta { display: grid; gap: 8px; margin: 0; min-width: 240px; }
dt { color: #627d98; font-size: 0.78rem; }
dd { margin: 0; overflow-wrap: anywhere; }
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 18px 0; padding: 12px; background: #fff; border: 1px solid #d9e2ec; border-radius: 6px; }
.checkbox { display: inline-flex; gap: 6px; align-items: center; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 18px; }
.summary-card, .dashboard-row, .authority { background: #fff; border: 1px solid #d9e2ec; border-radius: 6px; padding: 14px; }
.summary-card h2, .dashboard-section h2, .authority h2 { margin: 0 0 8px; font-size: 1rem; }
.sections { display: grid; gap: 20px; }
.dashboard-section > header { margin-bottom: 10px; }
.dashboard-section > header p { margin: 0; color: #52606d; }
.row-list { display: grid; gap: 10px; }
.dashboard-row { border-left-width: 6px; }
.state-ok { border-left-color: #2f855a; }
.state-info, .state-unknown { border-left-color: #627d98; }
.state-attention, .state-warning { border-left-color: #d69e2e; }
.state-blocked, .state-error { border-left-color: #c53030; }
.row-main { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px; align-items: center; }
.row-main p { grid-column: 2; margin: 0; color: #3e4c59; }
.row-main h3 { margin: 0; font-size: 1rem; }
.state-pill { border: 1px solid #bcccdc; border-radius: 999px; padding: 2px 8px; font-size: 0.78rem; text-transform: uppercase; }
.row-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin: 12px 0 0; }
.evidence, .limits { color: #52606d; font-size: 0.9rem; overflow-wrap: anywhere; }
details pre, #payload-view { white-space: pre-wrap; overflow-wrap: anywhere; background: #102a43; color: #f0f4f8; padding: 12px; border-radius: 6px; }
[hidden] { display: none !important; }
dialog { width: min(900px, calc(100vw - 32px)); border: 1px solid #bcccdc; border-radius: 6px; }
dialog header { display: flex; justify-content: space-between; align-items: center; }
@media (max-width: 720px) { .dashboard-shell { padding: 16px; } .dashboard-header { display: block; } .row-main { grid-template-columns: 1fr; } .row-main p { grid-column: 1; } }
`;
}

function defaultJavascript(): string {
  return `
const sectionFilter = document.getElementById('section-filter');
const stateFilter = document.getElementById('state-filter');
const attentionOnly = document.getElementById('attention-only');
const rows = Array.from(document.querySelectorAll('.dashboard-row'));
const sections = Array.from(document.querySelectorAll('.dashboard-section'));
function applyFilters() {
  const section = sectionFilter.value;
  const state = stateFilter.value;
  const onlyAttention = attentionOnly.checked;
  rows.forEach((row) => {
    const visible = (section === 'all' || row.dataset.section === section)
      && (state === 'all' || row.dataset.state === state)
      && (!onlyAttention || row.dataset.attention === 'true');
    row.hidden = !visible;
  });
  sections.forEach((sectionEl) => {
    sectionEl.hidden = !rows.some((row) => row.dataset.section === sectionEl.dataset.section && !row.hidden);
  });
}
sectionFilter.addEventListener('change', applyFilters);
stateFilter.addEventListener('change', applyFilters);
attentionOnly.addEventListener('change', applyFilters);
document.getElementById('inspect-payload').addEventListener('click', () => {
  const data = JSON.parse(document.getElementById('dashboard-data').textContent);
  document.getElementById('payload-view').textContent = JSON.stringify(data, null, 2);
  document.getElementById('payload-dialog').showModal();
});
applyFilters();
`;
}

async function loadValidatedSnapshot(
  options: DashboardServerOptions,
  context: DashboardServerContext,
): Promise<DashboardSnapshot> {
  const snapshot = await options.loadSnapshot(context);
  const validation = validateDashboardSnapshot(snapshot, options);
  if (validation.status !== 'valid') {
    throw new Error(`Invalid dashboard snapshot: ${validation.errors.join(', ')}`);
  }
  return snapshot;
}

function requestPath(request: IncomingMessage): string {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  return url.pathname;
}

function authorizedDashboardRequest(request: IncomingMessage, expectedToken: string): boolean {
  const header = request.headers.authorization;
  if (Array.isArray(header)) return false;
  return header === `Bearer ${expectedToken}`;
}

function tokenRefusalResponse(response: ServerResponse, headOnly = false): void {
  response.writeHead(401, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'www-authenticate': 'Bearer realm="site-operational-dashboard"',
  });
  if (headOnly) {
    response.end();
    return;
  }
  response.end(stableStringify({
    error: 'dashboard_bearer_token_required',
    authority_limits: [
      'dashboard_token_is_local_access_guard_not_site_authority',
      'raw_token_values_excluded',
    ],
  }));
}

function textResponse(
  response: ServerResponse,
  status: number,
  body: string,
  contentType: string,
  headOnly = false,
): void {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
  });
  if (headOnly) response.end();
  else response.end(body);
}

function jsonResponse(response: ServerResponse, status: number, body: unknown, headOnly = false): void {
  textResponse(response, status, stableStringify(body), 'application/json; charset=utf-8', headOnly);
}

function tokenGuardedDashboardJavascript(storageKey: string): string {
  const escapedKey = JSON.stringify(storageKey);
  return `
const storageKey = ${escapedKey};
const statusNode = document.getElementById('dashboard-status');
const liveNode = document.getElementById('dashboard-live');
const form = document.getElementById('token-form');
const tokenInput = document.getElementById('dashboard-token');
const clearButton = document.getElementById('clear-token');

async function loadSnapshot() {
  const token = localStorage.getItem(storageKey) || '';
  if (!token) {
    statusNode.textContent = 'Dashboard data requires an operator-entered bearer token.';
    liveNode.innerHTML = '';
    return;
  }
  statusNode.textContent = 'Loading guarded dashboard data.';
  const response = await fetch('/api/snapshot', {
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    cache: 'no-store'
  });
  if (response.status === 401) {
    statusNode.textContent = 'Bearer token was refused.';
    liveNode.innerHTML = '';
    return;
  }
  if (!response.ok) {
    statusNode.textContent = 'Dashboard snapshot unavailable.';
    liveNode.innerHTML = '';
    return;
  }
  const body = await response.json();
  statusNode.textContent = 'Dashboard data loaded from guarded read-only snapshot.';
  liveNode.innerHTML = renderSnapshot(body.snapshot);
}

function renderSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.sections)) return '<section class="authority">Snapshot unavailable.</section>';
  const rows = snapshot.sections.flatMap((section) => (section.rows || []).map((row) =>
    '<article class="dashboard-row state-' + escapeText(row.state) + '">' +
    '<header><strong>' + escapeText(row.label) + '</strong><span>' + escapeText(row.state) + '</span></header>' +
    '<p>' + escapeText(row.basis) + '</p>' +
    '</article>'));
  return '<section class="sections">' + rows.join('') + '</section>';
}

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (token) localStorage.setItem(storageKey, token);
  tokenInput.value = '';
  loadSnapshot();
});

clearButton.addEventListener('click', () => {
  localStorage.removeItem(storageKey);
  tokenInput.value = '';
  statusNode.textContent = 'Dashboard token cleared.';
  liveNode.innerHTML = '';
});

loadSnapshot();`;
}

function attentionRows(snapshot: DashboardSnapshot): DashboardRow[] {
  return snapshot.sections.flatMap((section) => section.rows.filter((row) => isAttentionState(row.state)));
}

function registryProjectionAuthorityLimits(): string[] {
  return [
    'site_registry_rows_are_projection_only',
    'projection_row_does_not_mutate_site_authority',
    'projection_row_does_not_grant_capability',
    'raw_secret_values_excluded',
  ];
}

function freshnessFor(observedAt: string | undefined, now: Date | string | undefined, maxAgeSeconds: number): DashboardFreshness {
  if (!observedAt) return { status: 'unknown', basis: 'observed_at_missing' };
  const observed = new Date(observedAt);
  const current = nowDate(now);
  if (Number.isNaN(observed.getTime())) return { status: 'unknown', observed_at: observedAt, basis: 'observed_at_invalid' };
  const ageSeconds = Math.max(0, Math.floor((current.getTime() - observed.getTime()) / 1000));
  return {
    status: ageSeconds <= maxAgeSeconds ? 'fresh' : 'stale',
    observed_at: observedAt,
    stale_after: new Date(observed.getTime() + maxAgeSeconds * 1000).toISOString(),
    basis: `age_seconds=${ageSeconds}; max_age_seconds=${maxAgeSeconds}`,
  };
}

function publicationEdgeState(
  activeRelation: Record<string, unknown> | undefined,
  withdrawal: Record<string, unknown> | undefined,
  suppression: Record<string, unknown> | undefined,
): DashboardRowState {
  if (suppression) return 'attention';
  if (withdrawal) return 'info';
  if (activeRelation) return 'ok';
  return 'unknown';
}

function publicationEdgeBasis(
  activeRelation: Record<string, unknown> | undefined,
  withdrawal: Record<string, unknown> | undefined,
  suppression: Record<string, unknown> | undefined,
): string {
  if (suppression) return 'Projection includes registry suppression posture.';
  if (withdrawal) return 'Projection includes withdrawal posture; public relation may be absent by design.';
  if (activeRelation) return 'Projection includes active publication relation posture.';
  return 'No publication edge projection was supplied.';
}

function capabilityReadinessState(
  source: Record<string, unknown> | undefined,
  liveSafety: Record<string, unknown> | undefined,
): DashboardRowState {
  if (liveSafety?.raw_secret_values_recorded === true) return 'blocked';
  if (valueAt(source, ['site_event', 'auth', 'capability_ref']) || liveSafety) return 'ok';
  return 'unknown';
}

function capabilityReadinessBasis(
  source: Record<string, unknown> | undefined,
  liveSafety: Record<string, unknown> | undefined,
): string {
  if (liveSafety?.raw_secret_values_recorded === true) return 'Projection reports raw values were recorded; refuse readiness.';
  if (valueAt(source, ['site_event', 'auth', 'capability_ref']) || liveSafety) return 'Projection carries capability references or live safety posture without raw values.';
  return 'No capability or live safety projection was supplied.';
}

function relationSummary(relation: Record<string, unknown> | undefined): DashboardDetail {
  if (!relation) return 'missing';
  return {
    relation_id: stringOrUnknown(relation.relation_id, 'unknown'),
    site_id: stringOrUnknown(relation.site_id, 'unknown'),
    transition: stringOrUnknown(relation.transition, 'unknown'),
    state: stringOrUnknown(relation.to_state, relation.state, 'unknown'),
    visibility: stringOrUnknown(relation.to_visibility, relation.visibility, 'unknown'),
  };
}

function valueAt(source: unknown, path: string[]): unknown {
  let value = source;
  for (const segment of path) {
    if (!isRecord(value)) return undefined;
    value = value[segment];
  }
  return value;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return '';
}

function stringOrUnknown(...values: unknown[]): string {
  return firstString(...values) ?? 'unknown';
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function nowDate(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.keys(value).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortJson(value[key]);
    return acc;
  }, {});
}

function findRawSecretMarkers(value: string): string[] {
  return RAW_SECRET_MARKERS
    .filter((marker) => marker.test(value))
    .map((marker) => marker.source);
}

function emptyStateCounts(): Record<DashboardRowState, number> {
  return {
    ok: 0,
    info: 0,
    attention: 0,
    warning: 0,
    blocked: 0,
    error: 0,
    unknown: 0,
  };
}

function isAttentionState(state: DashboardRowState): boolean {
  return ATTENTION_STATES.includes(state);
}

function isRowState(value: unknown): value is DashboardRowState {
  return typeof value === 'string' && ROW_STATES.includes(value as DashboardRowState);
}

function isEvidenceRefs(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && (item.ref === undefined || typeof item.ref === 'string')
    && (item.path === undefined || typeof item.path === 'string')
    && (item.label === undefined || typeof item.label === 'string'));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function byteLength(value: string): number {
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
  return new TextEncoder().encode(value).byteLength;
}
