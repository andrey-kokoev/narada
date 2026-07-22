export const SESSION_AUTHORITY_SCHEMA: string;
export const SESSION_AUTHORITY_PRINCIPAL_SCHEMA: string;
export const SESSION_AUTHORITY_STATES: Readonly<Record<string, string>>;
export const SESSION_AUTHORITY_REFUSAL_CODES: Readonly<Record<string, string>>;

export class SessionAuthorityError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
  toJSON(): Record<string, unknown>;
}

export interface SessionPrincipal {
  schema: string;
  authority_scope: string;
  site_id: string;
  local_agent_id: string;
  principal_key: string;
  identity_ref: unknown;
}

export interface SessionAuthorityAdmission {
  schema: string;
  status: 'admitted';
  principal: SessionPrincipal;
  session_id: string;
  launch_session_id: string | null;
  authority_epoch: number;
  owner_token: string;
  db_path: string;
  lease_expires_at: string;
  attach: Record<string, unknown>;
}

export function normalizeSessionPrincipal(options: {
  siteId: string;
  localAgentId: string;
  identityRef?: unknown;
  authorityScope?: string;
}): SessionPrincipal;

export function defaultSessionAuthorityDbPath(siteRoot: string): string;

export function openLocalSessionAuthority(options: {
  dbPath: string;
  busyTimeoutMs?: number;
}): {
  db_path: string;
  inspectSession(options: { principal: SessionPrincipal }): Record<string, unknown> | null;
  admitSession(options: {
    principal: SessionPrincipal;
    sessionId: string;
    launchSessionId?: string | null;
    runtimeKind?: string;
    operatorSurfaceKind?: string;
    authorityHost?: string;
    siteRoot?: string | null;
    leaseMs?: number;
    now?: Date | string;
    pid?: number | null;
    evidence?: Record<string, unknown>;
    replaceAbandoned?: boolean;
    processProbe?: (pid: number) => boolean;
    recoveryReason?: string;
  }): SessionAuthorityAdmission;
  activateSession(options: Record<string, unknown>): Record<string, unknown>;
  heartbeatSession(options: Record<string, unknown>): Record<string, unknown>;
  closeSession(options: Record<string, unknown>): Record<string, unknown>;
  failSession(options: Record<string, unknown>): Record<string, unknown>;
  reclaimSession(options: Record<string, unknown>): Record<string, unknown>;
  reconcileSession(options: Record<string, unknown>): Record<string, unknown>;
  close(): void;
};

export function isSessionLive(session: Record<string, unknown>): boolean;
export function findLegacySessionConflicts(options: {
  sessions: Array<Record<string, unknown>>;
  principal: SessionPrincipal;
  includeInactive?: boolean;
}): Array<Record<string, unknown>>;
export function buildSessionAuthorityEnvironment(admission: SessionAuthorityAdmission): Record<string, string>;
export function createSessionAuthorityRuntimeBinding(options?: {
  env?: Record<string, string | undefined>;
  runtimeContext?: Record<string, unknown>;
}): {
  principal: SessionPrincipal;
  session_id: string;
  authority_epoch: number;
  activate(options?: Record<string, unknown>): Record<string, unknown>;
  heartbeat(options?: Record<string, unknown>): Record<string, unknown>;
  close(options?: Record<string, unknown>): Record<string, unknown>;
  fail(options?: Record<string, unknown>): Record<string, unknown>;
  dispose(): void;
} | null;
