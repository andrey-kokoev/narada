import {
  decideSiteEventReceiver,
  deriveSiteProjectionReadModel,
  validateSiteTelemetryEventContract,
  type SiteEventEnvelope,
  type SiteEventFamily,
  type SiteEventReceiverContract,
  type SiteTelemetryEventContract,
} from "@narada2/site-config";
import {
  buildRemoteSiteInboxMessage,
  planRemoteSiteInboxLocalAdmission,
  receiptFromRemoteSiteInboxFinalize,
  type RemoteSiteInboxFinalizePayload,
  type RemoteSiteInboxMessage,
  type SiteInboxEnvelopeKind,
} from "@narada2/site-inbox";

export interface SiteRegistryCloudflareEnv {
  NARADA_SITE_REGISTRY_KV?: KVNamespace;
  NARADA_SITE_REGISTRY_D1?: D1Database;
  NARADA_SITE_REGISTRY_READ_TOKEN?: string;
  NARADA_SITE_REGISTRY_PUBLISH_TOKEN?: string;
  NARADA_SITE_REGISTRY_MESSAGE_TOKEN?: string;
  NARADA_SITE_REGISTRY_POLL_TOKEN?: string;
  NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN?: string;
  NARADA_SITE_REGISTRY_ADMIN_TOKEN?: string;
  NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN?: string;
  NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN?: string;
  NARADA_SITE_REGISTRY_MODE?: string;
  NARADA_SITE_REGISTRY_KNOWN_SITE_IDS?: string;
  NARADA_SITE_REGISTRY_MAX_PAYLOAD_BYTES?: string;
  NARADA_SITE_REGISTRY_EVENT_CAPABILITY_REF?: string;
}

export const HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS = Object.freeze([
  "hosted_registry_is_projection_only",
  "hosted_registry_cannot_mutate_site_config",
  "hosted_registry_cannot_admit_inbox_or_task_state",
  "hosted_registry_cannot_mutate_task_lifecycle",
  "hosted_registry_cannot_certify_identity",
  "hosted_registry_cannot_grant_capability",
] as const);

export const SITE_REGISTRY_CLOUDFLARE_BINDINGS = Object.freeze({
  kv: "NARADA_SITE_REGISTRY_KV",
  d1: "NARADA_SITE_REGISTRY_D1",
  readToken: "NARADA_SITE_REGISTRY_READ_TOKEN",
  publishToken: "NARADA_SITE_REGISTRY_PUBLISH_TOKEN",
  messageToken: "NARADA_SITE_REGISTRY_MESSAGE_TOKEN",
  pollToken: "NARADA_SITE_REGISTRY_POLL_TOKEN",
  localAdmissionToken: "NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN",
  adminToken: "NARADA_SITE_REGISTRY_ADMIN_TOKEN",
  relationWithdrawToken: "NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN",
  relationAdminToken: "NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN",
} as const);

export interface RoutePosture {
  method: string;
  path: string;
  status: "live" | "live_scaffold" | "planned";
  authority: "projection_only";
}

interface ProjectionSummary {
  site_id: string;
  freshness: string;
  latest_health_status: string;
  latest_health_observed_at?: string;
  latest_event_id?: string;
  provenance_count: number;
  relation: {
    relation_id: string;
    relation_kind: string;
    state: SiteRegistryRelationState;
    visibility: SiteRegistryRelationVisibility;
    source: "d1_lifecycle" | "known_site_configuration";
    updated_at?: string;
  };
}

export type SiteRegistryRelationState =
  | "candidate"
  | "active"
  | "withdrawn"
  | "retired"
  | "rejected"
  | "superseded";

export type SiteRegistryRelationVisibility = "public" | "private" | "suppressed";

export type SiteRegistryRelationTransition =
  | "activate"
  | "withdraw"
  | "retire"
  | "suppress"
  | "unsuppress"
  | "reject"
  | "reactivate";

export interface SiteRegistryRelationRecord {
  schema: "narada.site_registry.relation.v0";
  relation_id: string;
  registry_id: string;
  site_id: string;
  subject_site_id: string;
  relation_kind: string;
  state: SiteRegistryRelationState;
  visibility: SiteRegistryRelationVisibility;
  created_at: string;
  updated_at: string;
  retired_at?: string;
  withdrawn_at?: string;
  suppressed_at?: string;
  evidence_event_id?: string;
  projection_only: true;
  mutates_site_authority: false;
}

export interface SiteRegistryRelationTransitionInput {
  event_id: string;
  idempotency_key: string;
  registry_id: string;
  relation_id: string;
  site_id: string;
  subject_site_id?: string;
  relation_kind: string;
  transition: SiteRegistryRelationTransition;
  to_state: SiteRegistryRelationState;
  to_visibility: SiteRegistryRelationVisibility;
  actor: {
    kind: "site" | "registry_owner" | "operator" | "system";
    site_id?: string;
    principal?: string;
  };
  capability_ref: string;
  occurred_at: string;
  reason_codes: string[];
  evidence_refs: string[];
  from_state?: SiteRegistryRelationState;
  from_visibility?: SiteRegistryRelationVisibility;
}

export interface SiteRegistryRelationTransitionRecord {
  schema: "narada.site_registry.relation_transition.v0";
  event_id: string;
  idempotency_key: string;
  registry_id: string;
  relation_id: string;
  site_id: string;
  subject_site_id: string;
  relation_kind: string;
  transition: SiteRegistryRelationTransition;
  from_state?: SiteRegistryRelationState;
  to_state: SiteRegistryRelationState;
  from_visibility?: SiteRegistryRelationVisibility;
  to_visibility: SiteRegistryRelationVisibility;
  actor: SiteRegistryRelationTransitionInput["actor"];
  capability_ref: string;
  occurred_at: string;
  reason_codes: string[];
  evidence_refs: string[];
  raw_secret_values_recorded: false;
  authority_limits: string[];
}

export interface SiteRegistryRelationTransitionResult {
  status: "applied" | "duplicate";
  relation: SiteRegistryRelationRecord;
  event: SiteRegistryRelationTransitionRecord;
  raw_secret_values_recorded: false;
}

export function routePosture(): RoutePosture[] {
  return [
    { method: "GET", path: "/", status: "live_scaffold", authority: "projection_only" },
    { method: "GET", path: "/health", status: "live_scaffold", authority: "projection_only" },
    { method: "POST", path: "/webhook", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/sites", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/freshness", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/projections/:site_id", status: "live", authority: "projection_only" },
    { method: "POST", path: "/api/messages", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/messages/pending", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/messages/:message_id", status: "live", authority: "projection_only" },
    { method: "GET", path: "/api/messages/:message_id/receipt", status: "live", authority: "projection_only" },
    { method: "POST", path: "/api/messages/:message_id/finalize", status: "live", authority: "projection_only" },
    { method: "POST", path: "/api/relations/transition", status: "live", authority: "projection_only" },
  ];
}

const ACCEPTED_EVENT_FAMILIES: SiteEventFamily[] = [
  "site_health",
  "site_inbox",
  "agent_session",
  "task_work",
  "attention",
  "report",
  "site_registry",
];

const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024;
const DEFAULT_STALE_AFTER_MS = 15 * 60 * 1000;
const EVENT_CAPABILITY_REF = "capability:site_registry.event_publish";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function healthPayload(env: SiteRegistryCloudflareEnv = {}) {
  return {
    schema: "narada.site_registry_cloudflare.health.v0",
    status: "scaffold",
    mode: env.NARADA_SITE_REGISTRY_MODE ?? "projection_only",
    bindings: {
      kv_configured: Boolean(env.NARADA_SITE_REGISTRY_KV),
      d1_configured: Boolean(env.NARADA_SITE_REGISTRY_D1),
      read_token_configured: Boolean(env.NARADA_SITE_REGISTRY_READ_TOKEN),
      publish_token_configured: Boolean(env.NARADA_SITE_REGISTRY_PUBLISH_TOKEN),
      message_token_configured: Boolean(env.NARADA_SITE_REGISTRY_MESSAGE_TOKEN),
      poll_token_configured: Boolean(env.NARADA_SITE_REGISTRY_POLL_TOKEN),
      local_admission_token_configured: Boolean(env.NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN),
      admin_token_configured: Boolean(env.NARADA_SITE_REGISTRY_ADMIN_TOKEN),
      relation_withdraw_token_configured: Boolean(env.NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN),
      relation_admin_token_configured: Boolean(env.NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN),
    },
    known_site_count: knownSiteIds(env).length,
    routes: routePosture(),
    authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
    projection_only: true,
    mutates_site: false,
    admits_inbox: false,
    mutates_task_lifecycle: false,
    certifies_identity: false,
    grants_capability: false,
  };
}

export function receiverContract(env: SiteRegistryCloudflareEnv = {}): SiteEventReceiverContract {
  return {
    schema: "narada.site_event.receiver_contract.v0",
    receiver_id: "cloudflare-hosted-site-registry",
    accepted_event_families: ACCEPTED_EVENT_FAMILIES,
    known_site_ids: knownSiteIds(env),
    max_payload_bytes: maxPayloadBytes(env),
    requires_authenticated_capability: true,
    authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
  };
}

function knownSiteIds(env: SiteRegistryCloudflareEnv): string[] {
  const raw = env.NARADA_SITE_REGISTRY_KNOWN_SITE_IDS?.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
      }
    } catch {
      return [];
    }
  }
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function maxPayloadBytes(env: SiteRegistryCloudflareEnv): number {
  const parsed = Number(env.NARADA_SITE_REGISTRY_MAX_PAYLOAD_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAYLOAD_BYTES;
}

export function humanShell(): string {
  const readableRoutes = routePosture()
    .filter((route) => route.method === "GET")
    .map((route) => `${route.method} ${route.path}`);
  const routeItems = readableRoutes
    .map((route: string) => {
      const [, path = "/"] = route.split(" ");
      return `<a href="${escapeHtml(path)}">${escapeHtml(route)}</a>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Narada Site Registry</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #172026;
      --muted: #5d6975;
      --line: #d9dee6;
      --fresh: #16803f;
      --missing: #8a6a00;
      --failing: #b42318;
      --unknown: #687282;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }

    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }

    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 22px;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.1;
      font-weight: 680;
      letter-spacing: 0;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 650;
      letter-spacing: 0;
    }

    p {
      margin: 7px 0 0;
      color: var(--muted);
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(5, minmax(86px, 1fr));
      gap: 8px;
      min-width: min(520px, 100%);
    }

    .metric {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
      padding: 10px 12px;
      min-height: 66px;
    }

    .metric strong {
      display: block;
      font-size: 22px;
      line-height: 1;
      margin-bottom: 7px;
    }

    .metric span {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }

    .site-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 14px;
      align-items: stretch;
      margin-top: 14px;
    }

    .site-tile {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-height: 360px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 14px;
    }

    .tile-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .site-id {
      font-size: 18px;
      font-weight: 680;
      overflow-wrap: anywhere;
    }

    .badge {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 12px;
      font-weight: 650;
      white-space: nowrap;
      color: var(--unknown);
      background: #f8fafc;
    }

    .badge.fresh {
      color: var(--fresh);
      background: #effaf3;
      border-color: #b9e4c8;
    }

    .badge.missing,
    .badge.stale {
      color: var(--missing);
      background: #fff8e1;
      border-color: #ead58b;
    }

    .badge.failing {
      color: var(--failing);
      background: #fff1f0;
      border-color: #f2b8b5;
    }

    .lifecycle-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .relation-badge {
      border: 1px solid #d5e0ea;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 650;
      color: #23527c;
      background: #eef3f8;
      white-space: nowrap;
    }

    .relation-badge.public {
      color: var(--fresh);
      background: #effaf3;
      border-color: #b9e4c8;
    }

    .tile-section {
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }

    .row-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .signal {
      min-height: 66px;
      border: 1px solid #e4e8ef;
      border-radius: 8px;
      padding: 10px;
      background: #fbfcfe;
    }

    .signal label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 5px;
    }

    .signal span {
      display: block;
      font-weight: 640;
      overflow-wrap: anywhere;
    }

    .tile-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 12px;
    }

    .routes {
      margin-top: 24px;
      border-top: 1px solid var(--line);
      padding-top: 18px;
    }

    .route-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .route-list a {
      color: #23527c;
      background: #eef3f8;
      border: 1px solid #d5e0ea;
      border-radius: 8px;
      padding: 7px 9px;
      text-decoration: none;
      font-size: 12px;
    }

    .empty-state,
    .error-state {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 18px;
      color: var(--muted);
      background: var(--panel);
    }

    @media (max-width: 760px) {
      header {
        display: block;
      }

      .summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-top: 18px;
      }

      .row-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Narada Site Registry</h1>
        <p>Projection-only hosted registry.</p>
      </div>
      <section class="summary" aria-label="Registry summary">
        <div class="metric"><strong id="metric-sites">-</strong><span>Sites</span></div>
        <div class="metric"><strong id="metric-fresh">-</strong><span>Fresh</span></div>
        <div class="metric"><strong id="metric-stale">-</strong><span>Stale</span></div>
        <div class="metric"><strong id="metric-missing">-</strong><span>Missing</span></div>
        <div class="metric"><strong id="metric-failing">-</strong><span>Failing</span></div>
      </section>
    </header>
    <section aria-live="polite">
      <h2>Sites</h2>
      <div id="site-grid" class="site-grid">
        <div class="empty-state">Loading Site projections...</div>
      </div>
    </section>
    <section class="routes">
      <h2>Read API</h2>
      <nav class="route-list" aria-label="Read API routes">${routeItems}</nav>
    </section>
  </main>
  <script>
    const notProjected = "not projected";
    const text = (value) => value === undefined || value === null || value === "" ? notProjected : String(value);
    const escapeText = (value) => text(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const metric = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value ?? 0);
    };
    const compactEvent = (eventId) => {
      const value = text(eventId);
      return value.length > 22 ? value.slice(0, 19) + "..." : value;
    };
    const signal = (label, value) => \`
      <div class="signal">
        <label>\${escapeText(label)}</label>
        <span>\${escapeText(value)}</span>
      </div>\`;
    const siteTile = (site) => {
      const freshness = text(site.freshness);
      const relation = site.relation || {};
      const relationState = text(relation.state);
      const relationVisibility = text(relation.visibility);
      return \`
        <article class="site-tile">
          <div class="tile-head">
            <div>
              <div class="site-id">\${escapeText(site.site_id)}</div>
              <p>Projected Site awareness.</p>
            </div>
            <span class="badge \${escapeText(freshness)}">\${escapeText(freshness)}</span>
          </div>
          <div class="lifecycle-strip" aria-label="Relation lifecycle posture">
            <span class="relation-badge">state: \${escapeText(relationState)}</span>
            <span class="relation-badge \${escapeText(relationVisibility)}">visibility: \${escapeText(relationVisibility)}</span>
          </div>
          <div class="row-grid">
            \${signal("Health", site.latest_health_status)}
            \${signal("Observed", site.latest_health_observed_at)}
            \${signal("Latest event", compactEvent(site.latest_event_id))}
            \${signal("Provenance", site.provenance_count)}
            \${signal("Relation source", relation.source)}
            \${signal("Relation updated", relation.updated_at)}
          </div>
          <div class="tile-section">
            <div class="row-grid">
              \${signal("Active agents", site.active_agent_count)}
              \${signal("Open tasks", site.open_task_count)}
              \${signal("Operator attention", site.operator_attention)}
              \${signal("Critical action", site.critical_action)}
              \${signal("Inbox posture", site.inbox_posture)}
              \${signal("Publication edge", site.publication_edge)}
            </div>
          </div>
          <div class="tile-foot">
            <span>\${escapeText(relation.source || "projection only")}</span>
            <span>no local admission</span>
          </div>
        </article>\`;
    };

    fetch("/api/sites", { headers: { "accept": "application/json" } })
      .then((response) => response.json())
      .then((body) => {
        metric("metric-sites", body.summary?.site_count);
        metric("metric-fresh", body.summary?.fresh_count);
        metric("metric-stale", body.summary?.stale_count);
        metric("metric-missing", body.summary?.missing_count);
        metric("metric-failing", body.summary?.failing_count);
        const sites = Array.isArray(body.sites) ? body.sites : [];
        document.getElementById("site-grid").innerHTML = sites.length
          ? sites.map(siteTile).join("")
          : '<div class="empty-state"><strong>No active public Site relations.</strong><p>Withdrawn, retired, suppressed, or private relations are withheld from this projection-only grid.</p></div>';
      })
      .catch(() => {
        document.getElementById("site-grid").innerHTML = '<div class="error-state">Site projections unavailable.</div>';
      });
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function handleRequest(request: Request, env: SiteRegistryCloudflareEnv = {}): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/") {
    return html(humanShell());
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json(healthPayload(env));
  }
  if (request.method === "POST" && url.pathname === "/webhook") {
    return receiveSiteEvent(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/messages") {
    return submitRemoteMessage(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/relations/transition") {
    return transitionSiteRegistryRelation(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/messages/pending") {
    return listPendingRemoteMessages(request, env);
  }
  const messageReceiptMatch = /^\/api\/messages\/([^/]+)\/receipt$/.exec(url.pathname);
  if (request.method === "GET" && messageReceiptMatch) {
    return remoteMessageReceipt(request, env, decodeURIComponent(messageReceiptMatch[1] ?? ""));
  }
  const messageFinalizeMatch = /^\/api\/messages\/([^/]+)\/finalize$/.exec(url.pathname);
  if (request.method === "POST" && messageFinalizeMatch) {
    return finalizeRemoteMessage(request, env, decodeURIComponent(messageFinalizeMatch[1] ?? ""));
  }
  const messageDetailMatch = /^\/api\/messages\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && messageDetailMatch) {
    return remoteMessageDetail(request, env, decodeURIComponent(messageDetailMatch[1] ?? ""));
  }
  if (request.method === "GET" && url.pathname === "/api/sites") {
    return sitesSummary(env);
  }
  if (request.method === "GET" && url.pathname === "/api/freshness") {
    return freshnessSummary(env);
  }
  const projectionMatch = /^\/api\/projections\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && projectionMatch) {
    return siteProjection(request, env, decodeURIComponent(projectionMatch[1] ?? ""));
  }
  return json({ error: "not_found" }, 404);
}

export interface RemoteMessageSubmitPayload {
  schema?: "narada.remote_candidate.message.v0" | "narada.site_inbox.remote_message.v0";
  candidate_id?: string;
  surface_id?: string;
  target_authority?: "canonical_inbox" | string;
  target_site_id: string;
  source: { kind: string; ref: string; principal?: string; site?: string };
  idempotency_key?: string;
  replay_key?: string;
  kind: SiteInboxEnvelopeKind;
  subject?: string;
  body: string;
  payload?: Record<string, unknown>;
  payload_bounds?: { max_bytes?: number; raw_values_excluded?: boolean };
  evidence_refs?: string[];
  crossing?: Record<string, unknown>;
  admission_posture?: Record<string, unknown>;
  authority_limits?: string[];
  submitted_at?: string;
}

interface RemoteCandidateMetadata {
  surface_id: string;
  target_authority: string;
  submitted_at?: string;
  payload_bounds: { max_bytes: number; raw_values_excluded: true };
  evidence_refs: string[];
  crossing?: Record<string, unknown>;
  admission_posture: {
    remote_surface_authority: "candidate_only";
    local_site_admission_required: true;
    cloud_receipt_is_local_admission: false;
    descriptor_only_until_local_admission: true;
  };
  authority_limits: string[];
}

type StoredRemoteMessage = RemoteSiteInboxMessage & {
  remote_candidate?: RemoteCandidateMetadata;
};

async function submitRemoteMessage(request: Request, env: SiteRegistryCloudflareEnv): Promise<Response> {
  const auth = requireCapability(request, env.NARADA_SITE_REGISTRY_MESSAGE_TOKEN, "site_registry_message_submit_token");
  if (!auth.ok) return refusal([auth.reason], auth.status);
  if (!env.NARADA_SITE_REGISTRY_D1) return refusal(["site_registry_message_d1_not_configured"], 503);

  const parsed = await parseJsonBody<RemoteMessageSubmitPayload>(request);
  if (!parsed.ok) return refusal([parsed.reason], 400);
  const payload = parsed.value;
  const validation = validateSubmitPayload(payload);
  if (validation.length) return refusal(validation, 400);
  const replayKey = remoteCandidateReplayKey(payload);

  const existing = await getMessageBySourceIdempotency(env.NARADA_SITE_REGISTRY_D1, payload.source.ref, replayKey);
  if (existing) {
    await bumpMessageRetry(env.NARADA_SITE_REGISTRY_D1, existing.message_id);
    await insertMessageEvent(env.NARADA_SITE_REGISTRY_D1, existing.message_id, "duplicate_submit", []);
    return json({
      schema: "narada.remote_candidate.submit_response.v0",
      legacy_schema: "narada.site_registry_cloudflare.message_submit_response.v0",
      status: "duplicate",
      candidate: boundedCandidate(existing),
      cloud_receipt: remoteCandidateReceipt(existing),
      message: boundedMessage(existing),
      receipt: existing.receipt,
      cloud_receipt_only: true,
      ...noAuthorityFields(),
    });
  }

  const receivedAt = new Date().toISOString();
  const message: StoredRemoteMessage = {
    ...buildRemoteSiteInboxMessage({
    message_id: payload.candidate_id ?? `remote_msg_${crypto.randomUUID()}`,
    target_site_id: payload.target_site_id,
    source: payload.source,
    idempotency_key: replayKey,
    kind: payload.kind,
    ...(payload.subject ? { subject: payload.subject } : {}),
    body: payload.body,
    payload: payload.payload ?? {},
    received_at: receivedAt,
    }),
    remote_candidate: remoteCandidateMetadata(payload, receivedAt),
  };

  await insertRemoteMessage(env.NARADA_SITE_REGISTRY_D1, message);
  await insertMessageEvent(env.NARADA_SITE_REGISTRY_D1, message.message_id, "submitted", []);
  return json({
    schema: "narada.remote_candidate.submit_response.v0",
    legacy_schema: "narada.site_registry_cloudflare.message_submit_response.v0",
    status: "submitted",
    candidate: boundedCandidate(message),
    cloud_receipt: remoteCandidateReceipt(message),
    message: boundedMessage(message),
    receipt: message.receipt,
    cloud_receipt_only: true,
    remote_surface_authority: "candidate_only",
    local_site_admission_required: true,
    ...noAuthorityFields(),
  }, 202);
}

async function listPendingRemoteMessages(request: Request, env: SiteRegistryCloudflareEnv): Promise<Response> {
  const auth = requireCapability(request, env.NARADA_SITE_REGISTRY_POLL_TOKEN, "site_registry_message_poll_token");
  if (!auth.ok) return refusal([auth.reason], auth.status);
  if (!env.NARADA_SITE_REGISTRY_D1) return refusal(["site_registry_message_d1_not_configured"], 503);
  const messages = await listMessagesByStatus(env.NARADA_SITE_REGISTRY_D1, "pending");
  return json({
    schema: "narada.remote_candidate.pending_response.v0",
    legacy_schema: "narada.site_registry_cloudflare.pending_messages_response.v0",
    status: "ok",
    messages: messages.map((message) => ({
      candidate: boundedCandidate(message),
      message: boundedMessage(message),
      admission_plan: planRemoteSiteInboxLocalAdmission(message, {
        envelope_id: `remote-${message.message_id}`,
        received_at: new Date().toISOString(),
      }),
    })),
    remote_surface_authority: "candidate_only",
    local_site_admission_required: true,
    ...noAuthorityFields(),
  });
}

async function remoteMessageDetail(request: Request, env: SiteRegistryCloudflareEnv, messageId: string): Promise<Response> {
  const auth = requireCapability(request, env.NARADA_SITE_REGISTRY_POLL_TOKEN, "site_registry_message_poll_token");
  if (!auth.ok) return refusal([auth.reason], auth.status);
  const message = await requireRemoteMessage(env, messageId);
  if (!message.ok) return refusal([message.reason], message.status);
  return json({
    schema: "narada.remote_candidate.detail_response.v0",
    legacy_schema: "narada.site_registry_cloudflare.message_detail_response.v0",
    status: "ok",
    candidate: boundedCandidate(message.message),
    message: boundedMessage(message.message),
    admission_plan: message.message.status === "pending"
      ? planRemoteSiteInboxLocalAdmission(message.message, { envelope_id: `remote-${messageId}`, received_at: new Date().toISOString() })
      : null,
    ...noAuthorityFields(),
  });
}

async function remoteMessageReceipt(request: Request, env: SiteRegistryCloudflareEnv, messageId: string): Promise<Response> {
  const auth = requireCapability(request, env.NARADA_SITE_REGISTRY_POLL_TOKEN, "site_registry_message_poll_token");
  if (!auth.ok) return refusal([auth.reason], auth.status);
  const message = await requireRemoteMessage(env, messageId);
  if (!message.ok) return refusal([message.reason], message.status);
  return json({
    schema: "narada.remote_candidate.receipt_response.v0",
    legacy_schema: "narada.site_registry_cloudflare.message_receipt_response.v0",
    status: "ok",
    cloud_receipt: remoteCandidateReceipt(message.message),
    receipt: message.message.receipt,
    cloud_receipt_only: message.message.status === "pending",
    local_admission_is_reference_only: message.message.status === "admitted",
    ...noAuthorityFields(),
  });
}

async function finalizeRemoteMessage(request: Request, env: SiteRegistryCloudflareEnv, messageId: string): Promise<Response> {
  const auth = requireCapability(request, env.NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN, "site_registry_message_finalize_token");
  if (!auth.ok) return refusal([auth.reason], auth.status);
  const d1 = env.NARADA_SITE_REGISTRY_D1;
  if (!d1) return refusal(["site_registry_message_d1_not_configured"], 503);
  const message = await requireRemoteMessage(env, messageId);
  if (!message.ok) return refusal([message.reason], message.status);

  const parsed = await parseJsonBody<RemoteSiteInboxFinalizePayload>(request);
  if (!parsed.ok) return refusal([parsed.reason], 400);
  const finalize = normalizeRemoteCandidateFinalize(parsed.value);
  if (!finalize.ok) {
    return refusal([finalize.reason], 400);
  }

  const receipt = receiptFromRemoteSiteInboxFinalize(message.message, finalize.value);
  const finalized: RemoteSiteInboxMessage = { ...message.message, status: receipt.status, receipt };
  await updateRemoteMessage(d1, finalized);
  await insertMessageEvent(d1, messageId, `finalized_${receipt.status}`, []);
  return json({
    schema: "narada.remote_candidate.finalize_response.v0",
    legacy_schema: "narada.site_registry_cloudflare.message_finalize_response.v0",
    status: receipt.status,
    cloud_receipt: remoteCandidateReceipt(finalized),
    receipt,
    local_admission_is_reference_only: receipt.status === "admitted",
    local_inbox_mutated: false,
    ...noAuthorityFields(),
  });
}

async function transitionSiteRegistryRelation(request: Request, env: SiteRegistryCloudflareEnv): Promise<Response> {
  if (!env.NARADA_SITE_REGISTRY_D1) return refusal(["site_registry_relation_d1_not_configured"], 503);
  const parsed = await parseJsonBody<Partial<SiteRegistryRelationTransitionInput> & { transition?: string; to_state?: string; to_visibility?: string }>(request);
  if (!parsed.ok) return refusal([parsed.reason], 400);
  const validation = validateRelationTransitionPayload(parsed.value);
  if (!validation.ok) return refusal(validation.refusals, 400);

  const capability = capabilityForRelationTransition(request, validation.value, env);
  if (!capability.ok) return refusal([capability.reason], capability.status);

  const result = await recordSiteRegistryRelationTransition(env.NARADA_SITE_REGISTRY_D1, validation.value);
  return json({
    schema: "narada.site_registry.relation_transition_response.v0",
    status: result.status,
    cloud_receipt_only: true,
    remote_surface_authority: "registry_projection_lifecycle",
    local_site_admission_required: false,
    local_inbox_mutated: false,
    mutates_site_authority: false,
    relation: {
      relation_id: result.relation.relation_id,
      registry_id: result.relation.registry_id,
      site_id: result.relation.site_id,
      relation_kind: result.relation.relation_kind,
      state: result.relation.state,
      visibility: result.relation.visibility,
      updated_at: result.relation.updated_at,
      evidence_event_id: result.relation.evidence_event_id,
    },
    event: {
      event_id: result.event.event_id,
      idempotency_key: result.event.idempotency_key,
      transition: result.event.transition,
      from_state: result.event.from_state,
      to_state: result.event.to_state,
      from_visibility: result.event.from_visibility,
      to_visibility: result.event.to_visibility,
      occurred_at: result.event.occurred_at,
    },
    raw_secret_values_recorded: false,
    ...noAuthorityFields(),
  }, result.status === "duplicate" ? 200 : 202);
}

async function sitesSummary(env: SiteRegistryCloudflareEnv): Promise<Response> {
  const sites = await readKnownProjectionSummaries(env);
  return json({
    schema: "narada.site_registry_cloudflare.sites_response.v0",
    summary: {
      site_count: sites.length,
      fresh_count: sites.filter((site) => site.freshness === "fresh").length,
      stale_count: sites.filter((site) => site.freshness === "stale").length,
      missing_count: sites.filter((site) => site.freshness === "missing").length,
      failing_count: sites.filter((site) => site.freshness === "failing").length,
    },
    sites,
    ...noAuthorityFields(),
  });
}

async function freshnessSummary(env: SiteRegistryCloudflareEnv): Promise<Response> {
  const sites = await readKnownProjectionSummaries(env);
  return json({
    schema: "narada.site_registry_cloudflare.freshness_response.v0",
    generated_at: new Date().toISOString(),
    sites: sites.map((site) => ({
      site_id: site.site_id,
      freshness: site.freshness,
      latest_health_status: site.latest_health_status,
      latest_health_observed_at: site.latest_health_observed_at,
    })),
    ...noAuthorityFields(),
  });
}

async function siteProjection(request: Request, env: SiteRegistryCloudflareEnv, siteId: string): Promise<Response> {
  const auth = requireReadCapability(request, env);
  if (!auth.ok) return refusal([auth.reason], auth.status);
  if (!knownSiteIds(env).includes(siteId)) return refusal(["site_projection_subject_unknown"], 404);

  const raw = await env.NARADA_SITE_REGISTRY_KV?.get(siteProjectionKey(siteId));
  if (!raw) {
    return json({
      schema: "narada.site_registry_cloudflare.projection_response.v0",
      status: "missing",
      site_id: siteId,
      projection: null,
      ...noAuthorityFields(),
    }, 404);
  }

  return json({
    schema: "narada.site_registry_cloudflare.projection_response.v0",
    status: "ok",
    site_id: siteId,
    projection: JSON.parse(raw),
    ...noAuthorityFields(),
  });
}

export async function receiveSiteEvent(request: Request, env: SiteRegistryCloudflareEnv = {}): Promise<Response> {
  const contract = receiverContract(env);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > contract.max_payload_bytes) {
    return refusal(["site_event_http_body_too_large"], 413);
  }

  const parsed = parseSiteEvent(body);
  if (!parsed.ok) return refusal([parsed.reason], 400);

  const expectedToken = env.NARADA_SITE_REGISTRY_PUBLISH_TOKEN;
  const bearer = bearerToken(request.headers.get("authorization"));
  const tokenAuthenticated = Boolean(expectedToken) && bearer === expectedToken;
  const capabilityRef = env.NARADA_SITE_REGISTRY_EVENT_CAPABILITY_REF ?? EVENT_CAPABILITY_REF;
  const event = siteEventEnvelopeFromTelemetryEvent(parsed.event, capabilityRef, tokenAuthenticated);

  const extraRefusals: string[] = [];
  if (!expectedToken || !tokenAuthenticated) extraRefusals.push("site_event_bearer_token_invalid");
  if (containsRawSecretMarker(event.payload_summary)) {
    extraRefusals.push("site_event_payload_summary_contains_raw_secret_marker");
  }

  const decision = decideSiteEventReceiver(contract, event);
  const refusalReasons = [...decision.refusal_reasons, ...extraRefusals];
  if (refusalReasons.length) {
    await audit(env, "refused", event, refusalReasons);
    return json({
      schema: "narada.site_registry_cloudflare.webhook_response.v0",
      status: "refused",
      refusal_reasons: refusalReasons,
      decision: { ...decision, status: "refused", refusal_reasons: refusalReasons, projection_event_recorded: false },
      projection_only: true,
      authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
    }, extraRefusals.includes("site_event_bearer_token_invalid") ? 401 : 400);
  }

  const kv = env.NARADA_SITE_REGISTRY_KV;
  if (!kv) return refusal(["site_event_projection_kv_not_configured"], 503);

  const duplicate = await kv.get(idempotencyKey(event.idempotency_key));
  if (duplicate) {
    await audit(env, "duplicate", event, []);
    return json({
      schema: "narada.site_registry_cloudflare.webhook_response.v0",
      status: "duplicate",
      event_id: event.event_id,
      projection_event_recorded: false,
      projection_only: true,
      authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
    });
  }

  const subjectSiteId = event.subject_site_id ?? event.target_site_id ?? event.source_site_id;
  const previousEvents = await readSiteEvents(kv, subjectSiteId);
  const events = [...previousEvents, event];
  const projection = deriveSiteProjectionReadModel({
    site_id: subjectSiteId,
    events,
    now: new Date().toISOString(),
    stale_after_ms: DEFAULT_STALE_AFTER_MS,
  });

  await kv.put(eventKey(event.event_id), JSON.stringify(redactedEventRecord(event)));
  await kv.put(siteEventsKey(subjectSiteId), JSON.stringify(events.map(redactedEventRecord)));
  await kv.put(siteProjectionKey(subjectSiteId), JSON.stringify(projection));
  await kv.put(idempotencyKey(event.idempotency_key), JSON.stringify({
    event_id: event.event_id,
    source_site_id: event.source_site_id,
    subject_site_id: subjectSiteId,
    observed_at: event.observed_at,
  }));
  await audit(env, "accepted", event, []);

  return json({
    schema: "narada.site_registry_cloudflare.webhook_response.v0",
    status: "accepted",
    event_id: event.event_id,
    subject_site_id: subjectSiteId,
    projection_event_recorded: true,
    projection,
    projection_only: true,
    mutates_site_authority: false,
    admits_inbox_or_task_state: false,
    grants_capability: false,
    authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
  }, 202);
}

function parseSiteEvent(body: string): { ok: true; event: SiteTelemetryEventContract } | { ok: false; reason: string } {
  try {
    const parsed = JSON.parse(body);
    const validation = validateSiteTelemetryEventContract(parsed);
    if (validation.status === "invalid") {
      return { ok: false, reason: `site_event_contract_invalid:${validation.errors.join(",")}` };
    }
    return { ok: true, event: validation.event as SiteTelemetryEventContract };
  } catch {
    return { ok: false, reason: "site_event_json_invalid" };
  }
}

function siteEventEnvelopeFromTelemetryEvent(
  event: SiteTelemetryEventContract,
  capabilityRef: string,
  authenticated: boolean,
): SiteEventEnvelope {
  return {
    schema: "narada.site_event.envelope.v0",
    event_id: event.event_id,
    idempotency_key: event.idempotency_key,
    source_site_id: event.source_site_id,
    ...(event.subject_site_id ? { subject_site_id: event.subject_site_id } : {}),
    ...(event.target_site_id ? { target_site_id: event.target_site_id } : {}),
    family: event.family,
    type: event.type,
    observed_at: event.observed_at,
    sent_at: event.sent_at,
    auth: {
      kind: "bearer_capability_ref",
      capability_ref: event.auth.capability_ref ?? capabilityRef,
      authenticated,
    },
    payload_bounds: event.payload_bounds,
    payload_summary: event.payload_summary,
    authority_limits: event.authority_limits,
  };
}

function bearerToken(header: string | null): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1];
}

function requireReadCapability(
  request: Request,
  env: SiteRegistryCloudflareEnv,
): { ok: true } | { ok: false; reason: string; status: number } {
  if (!env.NARADA_SITE_REGISTRY_READ_TOKEN) {
    return { ok: false, reason: "site_registry_read_token_not_configured", status: 503 };
  }
  if (bearerToken(request.headers.get("authorization")) !== env.NARADA_SITE_REGISTRY_READ_TOKEN) {
    return { ok: false, reason: "site_registry_read_token_invalid", status: 401 };
  }
  return { ok: true };
}

function requireCapability(
  request: Request,
  expectedToken: string | undefined,
  reasonPrefix: string,
): { ok: true } | { ok: false; reason: string; status: number } {
  if (!expectedToken) return { ok: false, reason: `${reasonPrefix}_not_configured`, status: 503 };
  if (bearerToken(request.headers.get("authorization")) !== expectedToken) {
    return { ok: false, reason: `${reasonPrefix}_invalid`, status: 401 };
  }
  return { ok: true };
}

async function parseJsonBody<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  try {
    return { ok: true, value: await request.json() as T };
  } catch {
    return { ok: false, reason: "json_body_invalid" };
  }
}

function validateSubmitPayload(payload: RemoteMessageSubmitPayload): string[] {
  const refusals: string[] = [];
  if (!payload.target_site_id) refusals.push("remote_message_target_site_id_required");
  if (!payload.source?.ref) refusals.push("remote_message_source_ref_required");
  if (!remoteCandidateReplayKey(payload)) refusals.push("remote_message_idempotency_key_required");
  if (!payload.kind) refusals.push("remote_message_kind_required");
  if (!payload.body) refusals.push("remote_message_body_required");
  if (containsRawSecretMarker(payload.payload ?? {})) refusals.push("remote_message_payload_contains_raw_secret_marker");
  const body = typeof payload.body === "string" ? payload.body : "";
  if (body.toLowerCase().includes("secret=") || body.toLowerCase().includes("password=")) {
    refusals.push("remote_message_body_contains_raw_secret_marker");
  }
  if (payload.schema === "narada.remote_candidate.message.v0") {
    if (!payload.candidate_id) refusals.push("remote_candidate_candidate_id_required");
    if (!payload.surface_id) refusals.push("remote_candidate_surface_id_required");
    if (!payload.target_authority) refusals.push("remote_candidate_target_authority_required");
    if (payload.target_authority && payload.target_authority !== "canonical_inbox") {
      refusals.push("remote_candidate_target_authority_unsupported");
    }
    if (!payload.payload_bounds) refusals.push("remote_candidate_payload_bounds_required");
    if (payload.payload_bounds && payload.payload_bounds.raw_values_excluded !== true) {
      refusals.push("remote_candidate_raw_values_excluded_required");
    }
    if (!payload.crossing) refusals.push("remote_candidate_crossing_required");
    if (!payload.admission_posture) refusals.push("remote_candidate_admission_posture_required");
    if (!Array.isArray(payload.authority_limits) || payload.authority_limits.length === 0) {
      refusals.push("remote_candidate_authority_limits_required");
    }
  }
  return refusals;
}

function validateRelationTransitionPayload(
  payload: Partial<SiteRegistryRelationTransitionInput> & { transition?: string; to_state?: string; to_visibility?: string },
): { ok: true; value: SiteRegistryRelationTransitionInput } | { ok: false; refusals: string[] } {
  const refusals: string[] = [];
  const transition = payload.transition;
  const transitionValue = String(transition ?? "missing");
  const toState = payload.to_state;
  const toVisibility = payload.to_visibility;
  const actor = payload.actor;
  const transitionAllowed = ["activate", "withdraw", "retire", "suppress", "unsuppress", "reject", "reactivate"].includes(transitionValue);
  const stateAllowed = ["candidate", "active", "withdrawn", "retired", "rejected", "superseded"].includes(String(toState));
  const visibilityAllowed = ["public", "private", "suppressed"].includes(String(toVisibility));

  if (!payload.event_id) refusals.push("site_registry_relation_event_id_required");
  if (!payload.idempotency_key) refusals.push("site_registry_relation_idempotency_key_required");
  if (!payload.registry_id) refusals.push("site_registry_relation_registry_id_required");
  if (!payload.relation_id) refusals.push("site_registry_relation_id_required");
  if (!payload.site_id) refusals.push("site_registry_relation_site_id_required");
  if (!payload.relation_kind) refusals.push("site_registry_relation_kind_required");
  if (!transitionAllowed) refusals.push(`site_registry_relation_transition_unsupported:${transitionValue}`);
  if (transitionValue === "purge" || transitionValue === "delete") refusals.push("site_registry_relation_purge_not_supported");
  if (!stateAllowed) refusals.push(`site_registry_relation_to_state_invalid:${String(toState ?? "missing")}`);
  if (!visibilityAllowed) refusals.push(`site_registry_relation_to_visibility_invalid:${String(toVisibility ?? "missing")}`);
  if (!actor || typeof actor !== "object") refusals.push("site_registry_relation_actor_required");
  if (actor && !["site", "registry_owner", "operator", "system"].includes(String(actor.kind))) {
    refusals.push(`site_registry_relation_actor_kind_invalid:${String(actor.kind ?? "missing")}`);
  }
  if (!payload.capability_ref) refusals.push("site_registry_relation_capability_ref_required");
  if (!payload.occurred_at) refusals.push("site_registry_relation_occurred_at_required");
  if (!Array.isArray(payload.reason_codes) || payload.reason_codes.length === 0) {
    refusals.push("site_registry_relation_reason_codes_required");
  }
  if (!Array.isArray(payload.evidence_refs) || payload.evidence_refs.length === 0) {
    refusals.push("site_registry_relation_evidence_refs_required");
  }
  if (containsRawSecretMarker(payload.reason_codes) || containsRawSecretMarker(payload.evidence_refs)) {
    refusals.push("site_registry_relation_payload_contains_raw_secret_marker");
  }
  if (transition === "withdraw" && (actor?.kind !== "site" || actor.site_id !== payload.site_id)) {
    refusals.push("site_registry_relation_withdraw_requires_matching_site_actor");
  }
  if (["activate", "retire", "suppress", "unsuppress", "reject", "reactivate"].includes(String(transition))
    && !["registry_owner", "operator"].includes(String(actor?.kind))) {
    refusals.push("site_registry_relation_admin_transition_requires_registry_owner_actor");
  }

  if (refusals.length > 0) return { ok: false, refusals };
  return { ok: true, value: payload as SiteRegistryRelationTransitionInput };
}

function capabilityForRelationTransition(
  request: Request,
  payload: SiteRegistryRelationTransitionInput,
  env: SiteRegistryCloudflareEnv,
): { ok: true } | { ok: false; reason: string; status: number } {
  if (payload.transition === "withdraw") {
    return capabilityTokenMatches(
      request,
      env.NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN,
      payload.capability_ref,
      "site_registry_relation_withdraw_token",
      "capability:site_registry.relation.withdraw",
    );
  }
  return capabilityTokenMatches(
    request,
    env.NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN,
    payload.capability_ref,
    "site_registry_relation_admin_token",
    "capability:site_registry.relation.admin",
  );
}

function capabilityTokenMatches(
  request: Request,
  expectedToken: string | undefined,
  capabilityRef: string,
  reasonPrefix: string,
  expectedCapabilityPrefix: string,
): { ok: true } | { ok: false; reason: string; status: number } {
  if (!expectedToken) return { ok: false, reason: `${reasonPrefix}_not_configured`, status: 503 };
  const bearer = bearerToken(request.headers.get("authorization"));
  if (bearer !== expectedToken) return { ok: false, reason: `${reasonPrefix}_invalid`, status: 401 };
  if (capabilityRef !== expectedCapabilityPrefix && !capabilityRef.startsWith(`${expectedCapabilityPrefix}.`)) {
    return { ok: false, reason: `${reasonPrefix}_capability_ref_invalid`, status: 403 };
  }
  return { ok: true };
}

function remoteCandidateReplayKey(payload: RemoteMessageSubmitPayload): string {
  return payload.replay_key ?? payload.idempotency_key ?? "";
}

function boundedMessage(message: RemoteSiteInboxMessage) {
  return {
    schema: message.schema,
    message_id: message.message_id,
    target_site_id: message.target_site_id,
    status: message.status,
    source: message.source,
    idempotency_key: message.idempotency_key,
    kind: message.kind,
    subject: message.subject,
    body: message.body,
    payload: message.payload,
    received_at: message.received_at,
    receipt: message.receipt,
    remote_surface_authority: "candidate_only",
    local_inbox_mutated: false,
  };
}

function boundedCandidate(message: RemoteSiteInboxMessage) {
  const stored = message as StoredRemoteMessage;
  const meta = stored.remote_candidate ?? remoteCandidateMetadata({
    target_site_id: message.target_site_id,
    payload: message.payload,
  }, message.received_at);
  return {
    schema: "narada.remote_candidate.message.v0",
    candidate_id: message.message_id,
    surface_id: meta.surface_id,
    target_authority: meta.target_authority,
    target_site_id: message.target_site_id,
    status: message.status,
    source: message.source,
    replay_key: message.idempotency_key,
    idempotency_key: message.idempotency_key,
    kind: message.kind,
    subject: message.subject,
    body: message.body,
    payload: message.payload,
    payload_bounds: meta.payload_bounds,
    submitted_at: meta.submitted_at,
    received_at: message.received_at,
    evidence_refs: meta.evidence_refs,
    crossing: meta.crossing,
    admission_posture: meta.admission_posture,
    cloud_receipt: remoteCandidateReceipt(message),
    remote_surface_authority: "candidate_only",
    local_site_admission_required: true,
    local_inbox_mutated: false,
    authority_limits: meta.authority_limits,
  };
}

function remoteCandidateReceipt(message: RemoteSiteInboxMessage) {
  const stored = message as StoredRemoteMessage;
  const meta = stored.remote_candidate;
  return {
    schema: "narada.remote_candidate.receipt.v0",
    receipt_id: message.receipt.receipt_id,
    candidate_id: message.message_id,
    surface_id: meta?.surface_id ?? "cloudflare-hosted-site-registry",
    status: message.receipt.status,
    remote_received: {
      ...message.receipt.remote_received,
      replay_key: message.idempotency_key,
    },
    cloud_received: message.receipt.remote_received,
    cloud_receipt_only: message.status === "pending",
    remote_surface_authority: "candidate_only",
    local_decision_ref: message.receipt.local_admission?.admission_id,
    local_admission_is_reference_only: message.status === "admitted",
    ...(message.receipt.local_admission ? { local_admission: message.receipt.local_admission } : {}),
    ...(message.receipt.rejection ? { rejection: message.receipt.rejection } : {}),
    ...(message.receipt.error ? { error: message.receipt.error } : {}),
    evidence_refs: meta?.evidence_refs ?? [],
  };
}

function normalizeRemoteCandidateFinalize(
  payload: RemoteSiteInboxFinalizePayload | {
    schema?: string;
    status?: string;
    local_site_id?: string;
    local_admission_id?: string;
    local_kind?: SiteInboxEnvelopeKind;
    local_admitted_at?: string;
    rejected_reason?: string;
    error?: { code: string; message: string; retryable: boolean };
  },
): { ok: true; value: RemoteSiteInboxFinalizePayload } | { ok: false; reason: string } {
  if (payload.schema === "narada.site_inbox.remote_finalize_payload.v0") {
    return { ok: true, value: payload as RemoteSiteInboxFinalizePayload };
  }
  if (payload.schema !== "narada.remote_candidate.finalize.v0") return { ok: false, reason: "remote_finalize_payload_schema_required" };
  if (payload.status === "admitted" && payload.local_site_id && payload.local_admission_id && payload.local_kind && payload.local_admitted_at) {
    return {
      ok: true,
      value: {
        schema: "narada.site_inbox.remote_finalize_payload.v0",
        status: "admitted",
        local_site_id: payload.local_site_id,
        local_admission_id: payload.local_admission_id,
        local_kind: payload.local_kind,
        local_admitted_at: payload.local_admitted_at,
      },
    };
  }
  if (payload.status === "deferred" || payload.status === "expired" || payload.status === "superseded") {
    return { ok: false, reason: `remote_candidate_finalize_status_unsupported:${payload.status}` };
  }
  if (payload.status === "rejected" && payload.rejected_reason) {
    return {
      ok: true,
      value: {
        schema: "narada.site_inbox.remote_finalize_payload.v0",
        status: "rejected",
        rejected_reason: payload.rejected_reason,
      },
    };
  }
  if (payload.status === "error" && payload.error) {
    return {
      ok: true,
      value: {
        schema: "narada.site_inbox.remote_finalize_payload.v0",
        status: "error",
        error: payload.error,
      },
    };
  }
  return { ok: false, reason: "remote_finalize_payload_schema_required" };
}

function remoteCandidateMetadata(payload: {
  surface_id?: string;
  target_site_id: string;
  target_authority?: string;
  submitted_at?: string;
  received_at?: string;
  payload?: Record<string, unknown>;
  payload_bounds?: { max_bytes?: number; raw_values_excluded?: boolean };
  evidence_refs?: string[];
  crossing?: Record<string, unknown>;
  admission_posture?: Record<string, unknown>;
  authority_limits?: string[];
}, receivedAt: string): RemoteCandidateMetadata {
  return {
    surface_id: payload.surface_id ?? "cloudflare-hosted-site-registry",
    target_authority: payload.target_authority ?? "canonical_inbox",
    submitted_at: payload.submitted_at ?? receivedAt,
    payload_bounds: {
      max_bytes: payload.payload_bounds?.max_bytes ?? serializedByteLength(payload.payload ?? {}),
      raw_values_excluded: true,
    },
    evidence_refs: payload.evidence_refs ?? [],
    crossing: payload.crossing ?? {
      scale: "site",
      authority_scope: payload.target_site_id,
      from_locus: "remote_candidate_surface",
      to_locus: payload.target_site_id,
      owning_site: payload.target_site_id,
      target_authority: "canonical_inbox",
      requested_crossing: "admission_request",
      admission_state: "received",
    },
    admission_posture: {
      remote_surface_authority: "candidate_only",
      local_site_admission_required: true,
      cloud_receipt_is_local_admission: false,
      descriptor_only_until_local_admission: true,
    },
    authority_limits: payload.authority_limits ?? [
      "remote_candidate_is_not_local_inbox_admission",
      "remote_candidate_does_not_mutate_task_lifecycle",
      "remote_candidate_does_not_grant_capability",
      "remote_candidate_excludes_raw_logs_db_rows_runtime_state_and_secrets",
    ],
  };
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function containsRawSecretMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRawSecretMarker);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    const normalized = key.toLowerCase();
    return normalized.includes("secret")
      || normalized.includes("password")
      || normalized.includes("token")
      || normalized.includes("api_key")
      || containsRawSecretMarker(child);
  });
}

function redactedEventRecord(event: SiteEventEnvelope): SiteEventEnvelope {
  return {
    ...event,
    auth: {
      kind: event.auth.kind,
      capability_ref: event.auth.capability_ref,
      authenticated: event.auth.authenticated,
    },
  };
}

function refusal(refusalReasons: string[], status: number): Response {
  return json({
    schema: "narada.site_registry_cloudflare.webhook_response.v0",
    status: "refused",
    refusal_reasons: refusalReasons,
    projection_event_recorded: false,
    ...noAuthorityFields(),
  }, status);
}

async function readSiteEvents(kv: KVNamespace, siteId: string): Promise<SiteEventEnvelope[]> {
  const raw = await kv.get(siteEventsKey(siteId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as SiteEventEnvelope[] : [];
  } catch {
    return [];
  }
}

async function readKnownProjectionSummaries(env: SiteRegistryCloudflareEnv): Promise<ProjectionSummary[]> {
  const kv = env.NARADA_SITE_REGISTRY_KV;
  const publicRelations = await readPublicSiteRegistryRelations(env);
  if (!kv) {
    return publicRelations.map((relation) => missingProjectionSummary(relation.site_id, relation));
  }

  return Promise.all(publicRelations.map(async (relation) => {
    const siteId = relation.site_id;
    const raw = await kv.get(siteProjectionKey(siteId));
    if (!raw) return missingProjectionSummary(siteId, relation);
    try {
      const projection = JSON.parse(raw) as {
        site_id: string;
        latest_health?: { status?: string; freshness?: string; observed_at?: string; event_id?: string };
        event_provenance?: Array<{ event_id: string; family: string; observed_at: string }>;
      };
      return {
        site_id: projection.site_id,
        freshness: projection.latest_health?.freshness ?? "unknown",
        latest_health_status: projection.latest_health?.status ?? "unknown",
        latest_health_observed_at: projection.latest_health?.observed_at,
        latest_event_id: projection.latest_health?.event_id,
        provenance_count: projection.event_provenance?.length ?? 0,
        relation: publicRelationSummary(relation),
      };
    } catch {
      return {
        site_id: siteId,
        freshness: "unknown",
        latest_health_status: "projection_unreadable",
        provenance_count: 0,
        relation: publicRelationSummary(relation),
      };
    }
  }));
}

async function readPublicSiteRegistryRelations(env: SiteRegistryCloudflareEnv): Promise<SiteRegistryRelationRecord[]> {
  const knownRelations = knownSiteIds(env).map(implicitActivePublicRelation);
  const d1 = env.NARADA_SITE_REGISTRY_D1;
  if (!d1) return knownRelations;

  const explicitRelations = await listSiteRegistryRelations(d1);
  const bySiteId = new Map<string, SiteRegistryRelationRecord>();
  for (const relation of knownRelations) bySiteId.set(relation.site_id, relation);
  for (const relation of explicitRelations) {
    if (relation.relation_kind !== "publishes_to") continue;
    if (relation.state === "active" && relation.visibility === "public") {
      bySiteId.set(relation.site_id, relation);
    } else {
      bySiteId.delete(relation.site_id);
    }
  }

  return [...bySiteId.values()]
    .filter((relation) => relation.state === "active" && relation.visibility === "public")
    .sort((left, right) => left.site_id.localeCompare(right.site_id));
}

async function listSiteRegistryRelations(d1: D1Database): Promise<SiteRegistryRelationRecord[]> {
  const result = await d1.prepare("select relation_json from site_registry_relations where relation_kind = ? order by site_id asc")
    .bind("publishes_to")
    .all<{ relation_json: string }>();
  return (result.results ?? []).flatMap((row) => {
    try {
      return [JSON.parse(row.relation_json) as SiteRegistryRelationRecord];
    } catch {
      return [];
    }
  });
}

function implicitActivePublicRelation(siteId: string): SiteRegistryRelationRecord {
  return {
    schema: "narada.site_registry.relation.v0",
    relation_id: `implicit-known-site:${siteId}:publishes_to`,
    registry_id: "cloudflare-hosted-site-registry",
    site_id: siteId,
    subject_site_id: siteId,
    relation_kind: "publishes_to",
    state: "active",
    visibility: "public",
    created_at: "implicit",
    updated_at: "implicit",
    projection_only: true,
    mutates_site_authority: false,
  };
}

function publicRelationSummary(relation: SiteRegistryRelationRecord): ProjectionSummary["relation"] {
  return {
    relation_id: relation.relation_id,
    relation_kind: relation.relation_kind,
    state: relation.state,
    visibility: relation.visibility,
    source: relation.updated_at === "implicit" ? "known_site_configuration" : "d1_lifecycle",
    ...(relation.updated_at !== "implicit" ? { updated_at: relation.updated_at } : {}),
  };
}

async function requireRemoteMessage(
  env: SiteRegistryCloudflareEnv,
  messageId: string,
): Promise<{ ok: true; message: RemoteSiteInboxMessage } | { ok: false; reason: string; status: number }> {
  if (!env.NARADA_SITE_REGISTRY_D1) return { ok: false, reason: "site_registry_message_d1_not_configured", status: 503 };
  const message = await getMessageById(env.NARADA_SITE_REGISTRY_D1, messageId);
  if (!message) return { ok: false, reason: "remote_message_not_found", status: 404 };
  return { ok: true, message };
}

async function getMessageById(d1: D1Database, messageId: string): Promise<RemoteSiteInboxMessage | null> {
  const row = await d1.prepare("select message_json from site_registry_remote_messages where message_id = ?")
    .bind(messageId)
    .first<{ message_json: string }>();
  return row ? JSON.parse(row.message_json) as RemoteSiteInboxMessage : null;
}

async function getMessageBySourceIdempotency(
  d1: D1Database,
  sourceRef: string,
  idempotencyKeyValue: string,
): Promise<RemoteSiteInboxMessage | null> {
  const row = await d1.prepare("select message_json from site_registry_remote_messages where source_ref = ? and idempotency_key = ?")
    .bind(sourceRef, idempotencyKeyValue)
    .first<{ message_json: string }>();
  return row ? JSON.parse(row.message_json) as RemoteSiteInboxMessage : null;
}

async function listMessagesByStatus(d1: D1Database, status: string): Promise<RemoteSiteInboxMessage[]> {
  const result = await d1.prepare("select message_json from site_registry_remote_messages where status = ? order by received_at asc")
    .bind(status)
    .all<{ message_json: string }>();
  return (result.results ?? []).map((row) => JSON.parse(row.message_json) as RemoteSiteInboxMessage);
}

async function insertRemoteMessage(d1: D1Database, message: RemoteSiteInboxMessage): Promise<void> {
  await d1.prepare(
    `insert into site_registry_remote_messages
      (message_id, source_ref, idempotency_key, target_site_id, status, retry_count, received_at, message_json, receipt_json)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    message.message_id,
    message.source.ref,
    message.idempotency_key,
    message.target_site_id,
    message.status,
    0,
    message.received_at,
    JSON.stringify(message),
    JSON.stringify(message.receipt),
  ).run();
}

async function updateRemoteMessage(d1: D1Database | undefined, message: RemoteSiteInboxMessage): Promise<void> {
  if (!d1) return;
  await d1.prepare(
    "update site_registry_remote_messages set status = ?, message_json = ?, receipt_json = ? where message_id = ?",
  ).bind(
    message.status,
    JSON.stringify(message),
    JSON.stringify(message.receipt),
    message.message_id,
  ).run();
}

async function bumpMessageRetry(d1: D1Database, messageId: string): Promise<void> {
  await d1.prepare("update site_registry_remote_messages set retry_count = retry_count + 1 where message_id = ?")
    .bind(messageId)
    .run();
}

async function insertMessageEvent(
  d1: D1Database,
  messageId: string,
  eventType: string,
  refusalReasons: string[],
): Promise<void> {
  await d1.prepare(
    "insert into site_registry_remote_message_events (message_id, event_type, refusal_reasons) values (?, ?, ?)",
  ).bind(messageId, eventType, JSON.stringify(refusalReasons)).run();
}

export async function recordSiteRegistryRelationTransition(
  d1: D1Database,
  input: SiteRegistryRelationTransitionInput,
): Promise<SiteRegistryRelationTransitionResult> {
  if (containsRawSecretMarker(input.reason_codes) || containsRawSecretMarker(input.evidence_refs)) {
    throw new Error("site_registry_relation_transition_contains_raw_secret_marker");
  }
  const existingEvent = await getRelationEventByIdempotency(d1, input.relation_id, input.idempotency_key);
  if (existingEvent) {
    const relation = await getRelationById(d1, input.relation_id);
    if (!relation) throw new Error("site_registry_relation_event_without_relation_state");
    return {
      status: "duplicate",
      relation,
      event: existingEvent,
      raw_secret_values_recorded: false,
    };
  }

  const previous = await getRelationById(d1, input.relation_id);
  const now = input.occurred_at;
  const event: SiteRegistryRelationTransitionRecord = {
    schema: "narada.site_registry.relation_transition.v0",
    event_id: input.event_id,
    idempotency_key: input.idempotency_key,
    registry_id: input.registry_id,
    relation_id: input.relation_id,
    site_id: input.site_id,
    subject_site_id: input.subject_site_id ?? input.site_id,
    relation_kind: input.relation_kind,
    transition: input.transition,
    ...(input.from_state ?? previous?.state ? { from_state: input.from_state ?? previous?.state } : {}),
    to_state: input.to_state,
    ...(input.from_visibility ?? previous?.visibility ? { from_visibility: input.from_visibility ?? previous?.visibility } : {}),
    to_visibility: input.to_visibility,
    actor: input.actor,
    capability_ref: input.capability_ref,
    occurred_at: input.occurred_at,
    reason_codes: input.reason_codes,
    evidence_refs: input.evidence_refs,
    raw_secret_values_recorded: false,
    authority_limits: [
      "relation_transition_is_registry_projection_state",
      "transition_does_not_mutate_site_authority",
      "transition_does_not_delete_provenance",
      "cloud_receipt_is_not_local_site_admission",
    ],
  };
  const relation: SiteRegistryRelationRecord = {
    schema: "narada.site_registry.relation.v0",
    relation_id: input.relation_id,
    registry_id: input.registry_id,
    site_id: input.site_id,
    subject_site_id: input.subject_site_id ?? input.site_id,
    relation_kind: input.relation_kind,
    state: input.to_state,
    visibility: input.to_visibility,
    created_at: previous?.created_at ?? now,
    updated_at: now,
    ...(input.to_state === "retired" ? { retired_at: now } : previous?.retired_at ? { retired_at: previous.retired_at } : {}),
    ...(input.to_state === "withdrawn" ? { withdrawn_at: now } : previous?.withdrawn_at ? { withdrawn_at: previous.withdrawn_at } : {}),
    ...(input.to_visibility === "suppressed" ? { suppressed_at: now } : previous?.suppressed_at ? { suppressed_at: previous.suppressed_at } : {}),
    evidence_event_id: input.event_id,
    projection_only: true,
    mutates_site_authority: false,
  };

  await upsertRelation(d1, relation);
  await insertRelationEvent(d1, event);

  return {
    status: "applied",
    relation,
    event,
    raw_secret_values_recorded: false,
  };
}

export async function getSiteRegistryRelation(
  d1: D1Database,
  relationId: string,
): Promise<SiteRegistryRelationRecord | null> {
  return getRelationById(d1, relationId);
}

export async function listSiteRegistryRelationEvents(
  d1: D1Database,
  relationId: string,
): Promise<SiteRegistryRelationTransitionRecord[]> {
  const result = await d1.prepare(
    "select event_json from site_registry_relation_events where relation_id = ? order by occurred_at asc",
  ).bind(relationId).all<{ event_json: string }>();
  return (result.results ?? []).map((row) => JSON.parse(row.event_json) as SiteRegistryRelationTransitionRecord);
}

async function getRelationById(
  d1: D1Database,
  relationId: string,
): Promise<SiteRegistryRelationRecord | null> {
  const row = await d1.prepare("select relation_json from site_registry_relations where relation_id = ?")
    .bind(relationId)
    .first<{ relation_json: string }>();
  return row ? JSON.parse(row.relation_json) as SiteRegistryRelationRecord : null;
}

async function getRelationEventByIdempotency(
  d1: D1Database,
  relationId: string,
  idempotencyKeyValue: string,
): Promise<SiteRegistryRelationTransitionRecord | null> {
  const row = await d1.prepare("select event_json from site_registry_relation_events where relation_id = ? and idempotency_key = ?")
    .bind(relationId, idempotencyKeyValue)
    .first<{ event_json: string }>();
  return row ? JSON.parse(row.event_json) as SiteRegistryRelationTransitionRecord : null;
}

async function upsertRelation(d1: D1Database, relation: SiteRegistryRelationRecord): Promise<void> {
  await d1.prepare(
    `insert into site_registry_relations
      (relation_id, registry_id, site_id, subject_site_id, relation_kind, state, visibility, created_at, updated_at, retired_at, withdrawn_at, suppressed_at, evidence_event_id, relation_json)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(relation_id) do update set
        state = excluded.state,
        visibility = excluded.visibility,
        updated_at = excluded.updated_at,
        retired_at = excluded.retired_at,
        withdrawn_at = excluded.withdrawn_at,
        suppressed_at = excluded.suppressed_at,
        evidence_event_id = excluded.evidence_event_id,
        relation_json = excluded.relation_json`,
  ).bind(
    relation.relation_id,
    relation.registry_id,
    relation.site_id,
    relation.subject_site_id,
    relation.relation_kind,
    relation.state,
    relation.visibility,
    relation.created_at,
    relation.updated_at,
    relation.retired_at ?? null,
    relation.withdrawn_at ?? null,
    relation.suppressed_at ?? null,
    relation.evidence_event_id ?? null,
    JSON.stringify(relation),
  ).run();
}

async function insertRelationEvent(d1: D1Database, event: SiteRegistryRelationTransitionRecord): Promise<void> {
  await d1.prepare(
    `insert into site_registry_relation_events
      (event_id, relation_id, registry_id, site_id, relation_kind, transition, from_state, to_state, from_visibility, to_visibility, actor_site_id, actor_kind, capability_ref, idempotency_key, occurred_at, event_json)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.event_id,
    event.relation_id,
    event.registry_id,
    event.site_id,
    event.relation_kind,
    event.transition,
    event.from_state ?? null,
    event.to_state,
    event.from_visibility ?? null,
    event.to_visibility,
    event.actor.site_id ?? null,
    event.actor.kind,
    event.capability_ref,
    event.idempotency_key,
    event.occurred_at,
    JSON.stringify(event),
  ).run();
}

function missingProjectionSummary(siteId: string, relation: SiteRegistryRelationRecord): ProjectionSummary {
  return {
    site_id: siteId,
    freshness: "missing",
    latest_health_status: "missing",
    provenance_count: 0,
    relation: publicRelationSummary(relation),
  };
}

function noAuthorityFields() {
  return {
    projection_only: true,
    mutates_site: false,
    admits_inbox: false,
    mutates_task_lifecycle: false,
    certifies_identity: false,
    grants_capability: false,
    authority_limits: [...HOSTED_SITE_REGISTRY_AUTHORITY_LIMITS],
  };
}

async function audit(
  env: SiteRegistryCloudflareEnv,
  status: "accepted" | "refused" | "duplicate",
  event: SiteEventEnvelope,
  refusalReasons: string[],
): Promise<void> {
  const d1 = env.NARADA_SITE_REGISTRY_D1;
  if (!d1) return;
  await d1.prepare(
    `insert into site_registry_event_audit
      (event_id, idempotency_key, source_site_id, subject_site_id, family, status, refusal_reasons, observed_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    event.event_id,
    event.idempotency_key,
    event.source_site_id,
    event.subject_site_id ?? event.target_site_id ?? event.source_site_id,
    event.family,
    status,
    JSON.stringify(refusalReasons),
    event.observed_at,
  ).run();
}

const eventKey = (eventId: string) => `site-registry:event:${eventId}`;
const idempotencyKey = (idempotency: string) => `site-registry:idempotency:${idempotency}`;
const siteEventsKey = (siteId: string) => `site-registry:site-events:${siteId}`;
const siteProjectionKey = (siteId: string) => `site-registry:projection:${siteId}`;

const worker = {
  async fetch(request: Request, env: SiteRegistryCloudflareEnv): Promise<Response> {
    return handleRequest(request, env);
  },
};

export default worker;
