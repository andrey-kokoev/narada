import { agentIdentityDisplay } from '@narada2/agent-identity';
import type { OperatorSurfaceRuntimeStartOptions } from './operator-surface-runtime-start.js';
import { getCarrierStatus } from '../lib/launcher-runtime.js';

export function requireSiteRoot(options: OperatorSurfaceRuntimeStartOptions): string {
  const siteRoot = options.siteRoot ?? options.site;
  if (!siteRoot) {
    throw new Error('site_root_required: pass --site-root <path> or --site <path>');
  }
  return siteRoot;
}

export function requireAgent(options: OperatorSurfaceRuntimeStartOptions): string {
  const agent = options.agent?.trim();
  if (!agent) {
    throw new Error('agent_required: pass --agent <id>');
  }
  return agent;
}

export function formatCarrierStatus(status: ReturnType<typeof getCarrierStatus>): string {
  if (!status.latest) {
    return `No runtime launch result found for ${status.site_root}`;
  }
  const displayIdentity = agentIdentityDisplay(status.latest.agent_identity_ref, status.latest.identity) ?? 'unknown';
  return [
    `session: ${status.latest.nars_session_id ?? status.latest.runtime_session_id ?? status.latest.carrier_session_id ?? 'unknown'}`,
    `identity: ${displayIdentity}`,
    `operator_surface: ${status.latest.operator_surface_kind ?? status.latest.carrier_kind ?? 'unknown'}`,
    `runtime_host: ${status.latest.runtime_host_kind ?? status.latest.runtime_substrate_kind ?? status.latest.runtime ?? 'unknown'}`,
    `control: ${status.latest.control_path ?? 'missing'}${status.latest.control_path_exists ? ' (exists)' : ''}`,
    `parent_alive: ${String(status.latest.parent_process_alive)}`,
  ].join('\n');
}
