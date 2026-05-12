import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type RoutingDecisionStatus = 'admitted' | 'refused' | 'requires_escalation_approval';

export interface MessageRouteRequest {
  principal?: string | null;
  targetLocus?: string | null;
  envelopeKind: string;
  authorityLevel?: string | null;
  command: string;
}

export interface MessageRouteDecision {
  configured: boolean;
  status: RoutingDecisionStatus;
  principal: string | null;
  target_locus: string;
  envelope_kind: string;
  authority_level: string | null;
  reason: string;
  authority_posture: 'direct_target_authority' | 'source_site_delegated_authority';
  required_capability_kind: string | null;
  capability_action: string | null;
  capability_status: 'not_required' | 'active' | 'missing' | 'expired' | 'revoked';
  capability_grant_id: string | null;
  matched_rule?: unknown;
}

interface MessageRoutingAuthorityConfig {
  default_policy?: string;
  principals?: Record<string, PrincipalRoutePolicy>;
}

interface PrincipalRoutePolicy {
  may_send?: RouteRule[];
  may_not_send?: RouteRule[];
}

interface RouteRule {
  target_locus?: string;
  target_loci?: string[];
  kinds?: string[];
  authority_levels?: string[];
  capability_kind?: string;
  capability_action?: string;
  condition?: string;
  reason?: string;
}

const LOCAL_TARGET = 'local_site';

export function inspectMessageRoutingAuthority(cwdInput: string): {
  configured: boolean;
  config_path: string;
  default_policy: string;
  principals: string[];
} {
  const loaded = loadMessageRoutingAuthority(cwdInput);
  return {
    configured: Boolean(loaded.config),
    config_path: loaded.configPath,
    default_policy: loaded.config?.default_policy ?? 'allow_when_unconfigured',
    principals: loaded.config?.principals ? Object.keys(loaded.config.principals).sort() : [],
  };
}

export function decideMessageRoute(cwdInput: string, request: MessageRouteRequest): MessageRouteDecision {
  const loaded = loadMessageRoutingAuthority(cwdInput);
  const principal = clean(request.principal);
  const targetLocus = clean(request.targetLocus) ?? LOCAL_TARGET;
  const authorityLevel = clean(request.authorityLevel);
  const envelopeKind = request.envelopeKind;

  if (!loaded.config) {
    return {
      configured: false,
      status: 'admitted',
      principal,
      target_locus: targetLocus,
      envelope_kind: envelopeKind,
      authority_level: authorityLevel,
      authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
      required_capability_kind: null,
      capability_action: null,
      capability_status: 'not_required',
      capability_grant_id: null,
      reason: 'No message_routing_authority policy configured; legacy local submission posture admits the route.',
    };
  }

  const policy = findPrincipalPolicy(loaded.config, principal);
  const denied = policy?.may_not_send?.find((rule) => routeRuleMatches(rule, { targetLocus, envelopeKind, authorityLevel }));
  if (denied) {
    return {
      configured: true,
      status: 'refused',
      principal,
      target_locus: targetLocus,
      envelope_kind: envelopeKind,
      authority_level: authorityLevel,
      authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
      required_capability_kind: null,
      capability_action: null,
      capability_status: 'not_required',
      capability_grant_id: null,
      reason: denied.reason ?? `Principal ${principal ?? '(none)'} is not admitted to send ${envelopeKind} to ${targetLocus}.`,
      matched_rule: denied,
    };
  }

  const allowed = policy?.may_send?.find((rule) => routeRuleMatches(rule, { targetLocus, envelopeKind, authorityLevel }));
  if (allowed) {
    const capability = explainRouteCapability(cwdInput, targetLocus, principal, allowed);
    if (capability.status !== 'not_required' && capability.status !== 'active') {
      return {
        configured: true,
        status: 'refused',
        principal,
        target_locus: targetLocus,
        envelope_kind: envelopeKind,
        authority_level: authorityLevel,
        authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
        required_capability_kind: capability.kind,
        capability_action: capability.action,
        capability_status: capability.status,
        capability_grant_id: capability.grantId,
        reason: `Route requires active capability grant ${capability.kind} for ${principal ?? '(none)'} on ${targetLocus}; current status is ${capability.status}.`,
        matched_rule: allowed,
      };
    }
    const condition = allowed.condition ?? 'always';
    return {
      configured: true,
      status: condition.includes('approval') || condition.includes('escalation') ? 'requires_escalation_approval' : 'admitted',
      principal,
      target_locus: targetLocus,
      envelope_kind: envelopeKind,
      authority_level: authorityLevel,
      authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
      required_capability_kind: capability.kind,
      capability_action: capability.action,
      capability_status: capability.status,
      capability_grant_id: capability.grantId,
      reason: condition === 'always'
        ? `Principal ${principal ?? '(none)'} is admitted to send ${envelopeKind} to ${targetLocus}.`
        : `Route matched condition: ${condition}.`,
      matched_rule: allowed,
    };
  }

  const defaultPolicy = loaded.config.default_policy ?? 'allow_when_unconfigured';
  if (defaultPolicy === 'deny_cross_locus_unless_allowed' && targetLocus !== LOCAL_TARGET) {
    return {
      configured: true,
      status: 'refused',
      principal,
      target_locus: targetLocus,
      envelope_kind: envelopeKind,
      authority_level: authorityLevel,
      authority_posture: 'source_site_delegated_authority',
      required_capability_kind: null,
      capability_action: null,
      capability_status: 'not_required',
      capability_grant_id: null,
      reason: `No message_routing_authority rule admits principal ${principal ?? '(none)'} to send ${envelopeKind} to ${targetLocus}.`,
    };
  }
  if (defaultPolicy === 'deny_unless_allowed') {
    return {
      configured: true,
      status: 'refused',
      principal,
      target_locus: targetLocus,
      envelope_kind: envelopeKind,
      authority_level: authorityLevel,
      authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
      required_capability_kind: null,
      capability_action: null,
      capability_status: 'not_required',
      capability_grant_id: null,
      reason: `No message_routing_authority rule admits this route under deny_unless_allowed.`,
    };
  }

  return {
    configured: true,
    status: 'admitted',
    principal,
    target_locus: targetLocus,
    envelope_kind: envelopeKind,
    authority_level: authorityLevel,
    authority_posture: targetLocus === LOCAL_TARGET ? 'direct_target_authority' : 'source_site_delegated_authority',
    required_capability_kind: null,
    capability_action: null,
    capability_status: 'not_required',
    capability_grant_id: null,
    reason: `No explicit rule matched; default policy ${defaultPolicy} admits the route.`,
  };
}

export function routingRefusalMessage(decision: MessageRouteDecision): string {
  return `Message route refused: ${decision.reason}`;
}

function loadMessageRoutingAuthority(cwdInput: string): { config: MessageRoutingAuthorityConfig | null; configPath: string } {
  const cwd = resolve(cwdInput);
  const configPath = join(cwd, 'config.json');
  if (!existsSync(configPath)) return { config: null, configPath };
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    const candidate = parsed.message_routing_authority
      ?? (isRecord(parsed.governance) ? parsed.governance.message_routing_authority : undefined);
    return { config: isRecord(candidate) ? candidate as MessageRoutingAuthorityConfig : null, configPath };
  } catch {
    return { config: null, configPath };
  }
}

function findPrincipalPolicy(config: MessageRoutingAuthorityConfig, principal: string | null): PrincipalRoutePolicy | null {
  if (!config.principals) return null;
  const candidates = [principal, principal?.split('.').pop(), '*'].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const policy = config.principals[candidate];
    if (policy) return policy;
  }
  return null;
}

function routeRuleMatches(
  rule: RouteRule,
  request: { targetLocus: string; envelopeKind: string; authorityLevel: string | null },
): boolean {
  const targets = rule.target_loci ?? (rule.target_locus ? [rule.target_locus] : ['*']);
  if (!matchesList(targets, request.targetLocus)) return false;
  if (rule.kinds && !matchesList(rule.kinds, request.envelopeKind)) return false;
  if (rule.authority_levels && !matchesList(rule.authority_levels, request.authorityLevel ?? '')) return false;
  return true;
}

function matchesList(values: string[], candidate: string): boolean {
  return values.includes('*') || values.includes(candidate);
}

function explainRouteCapability(
  cwdInput: string,
  targetLocus: string,
  principal: string | null,
  rule: RouteRule,
): {
  kind: string | null;
  action: string | null;
  status: MessageRouteDecision['capability_status'];
  grantId: string | null;
} {
  const kind = clean(rule.capability_kind);
  if (!kind) return { kind: null, action: null, status: 'not_required', grantId: null };
  const action = clean(rule.capability_action) ?? 'inbox.submit';
  if (!principal) return { kind, action, status: 'missing', grantId: null };
  const registryPath = join(resolve(cwdInput), '.ai', 'capability-consent-registry.json');
  if (!existsSync(registryPath)) return { kind, action, status: 'missing', grantId: null };
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      grants?: Array<{
        grant_id?: string;
        site_id?: string;
        principal_id?: string;
        capability_kind?: string;
        allowed_actions?: string[];
        denied_actions?: string[];
        status?: string;
        expires_at?: string | null;
      }>;
    };
    const grant = (parsed.grants ?? []).find((candidate) => (
      candidate.site_id === targetLocus &&
      candidate.principal_id === principal &&
      candidate.capability_kind === kind &&
      (candidate.allowed_actions ?? []).some((allowedAction) => allowedAction === action || allowedAction === '*') &&
      !(candidate.denied_actions ?? []).includes(action)
    ));
    if (!grant) return { kind, action, status: 'missing', grantId: null };
    if (grant.status === 'revoked') return { kind, action, status: 'revoked', grantId: grant.grant_id ?? null };
    if (grant.expires_at && Date.parse(grant.expires_at) <= Date.now()) {
      return { kind, action, status: 'expired', grantId: grant.grant_id ?? null };
    }
    return { kind, action, status: 'active', grantId: grant.grant_id ?? null };
  } catch {
    return { kind, action, status: 'missing', grantId: null };
  }
}

function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
