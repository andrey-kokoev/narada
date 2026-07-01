import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveNaradaSitePaths, siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';

export function siteNaradaRoot(siteRoot) {
  return siteAuthorityRootFromSiteRoot(siteRoot);
}

export function carrierControlPath(siteRoot, sessionId) {
  return resolveNaradaSitePaths({ siteRoot, sessionId }).narsControlPath;
}

export function carrierSessionPath(siteRoot, sessionId) {
  return resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionPath;
}

export function newCarrierSessionId() {
  return `carrier_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function materializeCarrierLaunchFiles({
  siteRoot,
  sessionId,
  startingCarrierInput,
  agentStartEventId,
  identityToken,
}) {
  const controlPath = carrierControlPath(siteRoot, sessionId);
  const sessionPath = carrierSessionPath(siteRoot, sessionId);
  mkdirSync(dirname(controlPath), { recursive: true });
  if (!existsSync(controlPath)) writeFileSync(controlPath, '', 'utf8');
  if (!existsSync(sessionPath)) writeFileSync(sessionPath, '', 'utf8');
  if (startingCarrierInput?.content) {
    const existingControl = readFileSync(controlPath, 'utf8');
    if (existingControl.trim().length === 0) {
      const now = new Date().toISOString();
      const token = identityToken(`${sessionId}_starting_carrier_input`);
      const controlRecord = {
        schema: 'narada.carrier.control.input_event.v1',
        control_event_id: `control_${token}`,
        input_event_id: `input_${token}`,
        written_at: now,
        input: {
          schema: 'narada.carrier.input_event.v1',
          event_id: `input_${token}`,
          source_kind: 'system',
          source_id: 'agent-start.starting_carrier_input',
          transport: 'startup_injection',
          delivery_mode: 'admit_for_current_turn',
          hold_condition: null,
          content: startingCarrierInput.content,
          created_at: now,
          authority_ref: `agent_start_event:${agentStartEventId}`,
          directive_id: `dir_${token}`,
          metadata: {
            agent_start_event_id: agentStartEventId,
            carrier_session_id: sessionId,
            startup_injection: true,
            directive_provenance: {
              kind: 'operator_authorized_system_starting_carrier_input',
              authorized_by: startingCarrierInput.source,
              emitted_by: 'agent-start',
            },
          },
        },
      };
      writeFileSync(controlPath, `${JSON.stringify(controlRecord)}\n`, 'utf8');
    }
  }
  return { control_path: controlPath, session_path: sessionPath };
}

export function materializeCarrierSessionRecord({
  identity,
  carrier,
  runtime,
  startResult,
  dryRun = false,
  pcSiteRoot,
  userSiteRoot,
  runtimeContractSchema,
  launchSource,
  workspace,
  processId,
  writeJsonFile,
} = {}) {
  const carrierSessionId = newCarrierSessionId();
  const recordPath = join(pcSiteRoot, 'runtime', 'carrier-sessions', `${carrierSessionId}.json`);
  const startedAt = new Date().toISOString();
  const record = {
    schema: 'narada.pc_runtime.carrier_session.v0',
    session_id: carrierSessionId,
    carrier_session_id: carrierSessionId,
    status: dryRun ? 'planned' : 'registered',
    declared_agent_identity: identity,
    verified_agent_identity: startResult.identity,
    verification_source: 'agent_context_session_start',
    verification_state: startResult.identity === identity ? 'verified' : 'mismatch',
    agent_start_event_id: startResult.agent_start_event ?? null,
    runtime_contract_schema: runtimeContractSchema,
    runtime_substrate_kind: runtime,
    substrate: runtime,
    launch_carrier_kind: carrier,
    carrier_runtime_kind: carrier === 'agent-cli' || carrier === 'agent-web-ui' ? 'narada-agent-runtime-server' : runtime,
    launch_operator_surface_kind: carrier === 'agent-cli' || carrier === 'agent-web-ui' ? carrier : null,
    operator_surface_kind: carrier === 'agent-cli' || carrier === 'agent-web-ui' ? carrier : null,
    launcher_process_kind: 'launcher_process',
    workspace,
    launch_source: launchSource,
    user_site_root: userSiteRoot,
    pc_site_root: pcSiteRoot,
    started_at: startedAt,
    parent_process: {
      pid: processId,
      evidence_kind: 'launcher_process',
    },
    operator_surface_window_evidence: null,
    restart_handle: {
      class: 'operator_manual_only_with_handle',
      handle: carrierSessionId,
      authority_owner: 'pc_site_runtime',
      semantics: 'Restart this launcher-bound carrier session through the operator-visible launch surface or explicit operator action.',
    },
    authority_basis: {
      kind: 'agent_launch_path',
      summary: 'Carrier session registration materialized by start-agent before spawning the substrate child.',
    },
  };

  if (!dryRun) {
    writeJsonFile(recordPath, record);
  }

  return {
    schema: 'narada.pc_runtime.carrier_session.registration.v0',
    status: dryRun ? 'planned' : 'registered',
    session_id: carrierSessionId,
    carrier_session_id: carrierSessionId,
    record_path: recordPath,
    environment: {
      NARADA_CARRIER_SESSION_ID: carrierSessionId,
    },
    record,
  };
}

export function writeLaunchResultFile(result, { siteRoot }) {
  const eventId = result.agent_start_event;
  if (!eventId) return null;
  const outDir = join(siteRoot, '.ai', 'runtime', 'agent-start-results');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${eventId}.result.json`);
  result.launch_result_path = path;
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return path;
}
