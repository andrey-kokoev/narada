export interface NarsSessionProcessOwnership {
  ownership?: string | null;
  cleanup_policy?: string | null;
  pid?: number | string | null;
  launch_session_id?: string | null;
  [key: string]: unknown;
}

export interface NarsSessionAttachCommands {
  agent_web_ui?: string | null;
  agent_cli?: string | null;
}

export interface NarsSessionIndexRecord {
  session_id?: string | null;
  runtime_session_id?: string | null;
  nars_session_id?: string | null;
  carrier_session_id?: string | null;
  agent_id?: string | null;
  agent_identity_ref?: unknown;
  site_id?: string | null;
  site_root?: string | null;
  session_dir?: string | null;
  session_path?: string | null;
  events_path?: string | null;
  record_path?: string | null;
  heartbeat_path?: string | null;
  runtime_kind?: string | null;
  site_id_source?: string | null;
  launch_session_id?: string | null;
  process_ownership?: NarsSessionProcessOwnership | null;
  event_endpoint?: string | null;
  health_endpoint?: string | null;
  started_at?: string | null;
  last_seen_at?: string | null;
  terminal_state?: string | null;
  status_hint?: string | null;
  authority_runtime_host?: 'local' | 'cloudflare-host' | 'unknown_authority_metadata' | null;
  authority_epoch?: number | null;
  runtime_origin?: 'local' | 'cloudflare' | null;
  authority_runtime_id?: string | null;
  runtime_surface_contract?: Record<string, unknown> | null;
  launch_operator_surface_kind?: string | null;
  attach_commands?: NarsSessionAttachCommands | null;
  [key: string]: unknown;
}

export interface NarsSessionObservation extends NarsSessionIndexRecord {
  display_state?: string | null;
  display_state_reason?: string | null;
  heartbeat_fresh?: boolean | null;
  heartbeat_age_ms?: number | null;
  health_status?: string | null;
  record?: NarsSessionIndexRecord | null;
  heartbeat?: Record<string, unknown> | null;
  pid?: number | string | null;
}

export interface DiscoverNarsSessionsOptions {
  siteRoot?: string;
  sessionsRoot?: string | null;
  now?: Date;
  heartbeatFreshMs?: number;
  healthBySessionId?: Map<string, unknown> | Record<string, unknown> | null;
}

export interface NarsSessionDiscovery {
  schema: string;
  site_root: string | null;
  sessions_root: string;
  generated_at: string;
  index: unknown;
  sessions: NarsSessionObservation[];
}

export function discoverNarsSessions(options?: DiscoverNarsSessionsOptions): NarsSessionDiscovery;
