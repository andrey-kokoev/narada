import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function recordMcpPreflightArtifactLinkage({ emit, preflightArtifact, appendSessionRecord = null, sessionPath = null } = {}) {
  if (!preflightArtifact) return null;
  const payload = {
    artifact_path: preflightArtifact.artifact_path ?? preflightArtifact.path ?? null,
    generated_at: preflightArtifact.generated_at ?? null,
    recommended_action: preflightArtifact.recommended_action ?? null,
    recommended_action_display: preflightArtifact.recommended_action_display ?? null,
    recommended_command: preflightArtifact.recommended_command ?? null,
    recovery_kind: preflightArtifact.recovery_kind ?? null,
    recovery_kind_display: preflightArtifact.recovery_kind_display ?? null,
    recovery_primary_command: preflightArtifact.recovery_primary_command ?? null,
    recovery_followup_command: preflightArtifact.recovery_followup_command ?? null,
    handoffs: preflightArtifact.handoffs ?? null,
  };
  emit?.('mcp_preflight_artifact_linked', payload);
  const record = { event: 'mcp_preflight_artifact_linked', ...payload, timestamp: new Date().toISOString() };
  appendSessionRecord?.(record);
  appendJsonlRecord(sessionPath, record);
  return payload;
}

export function readMcpPreflightArtifact({ artifactDir, session, identity, siteRoot } = {}) {
  const candidateDir = artifactDir ?? join(siteRoot, '.narada', 'runtime', 'agent-cli', 'mcp-preflight');
  const candidates = [
    session ? join(candidateDir, `${session}.json`) : null,
    identity ? join(candidateDir, `${identity}.json`) : null,
  ].filter(Boolean);
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const artifact = JSON.parse(readFileSync(path, 'utf8'));
      return normalizeMcpPreflightArtifact({ ...artifact, artifact_path: path, path }, { identity, session });
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeMcpPreflightArtifact(artifact, { identity, session } = {}) {
  const operationalState = artifact.mcp_operational_state ?? artifact.operational_state ?? null;
  const startupFailures = Number(artifact.mcp_startup_failure_count ?? 0);
  const runtimeFaults = Number(artifact.mcp_runtime_fault_count ?? 0);
  const healthy = operationalState === 'healthy' && startupFailures === 0 && runtimeFaults === 0;
  const recommendedAction = artifact.recommended_action ?? (healthy ? 'start_session' : 'review_startup_diagnostics');
  const recoveryKind = artifact.recovery_kind ?? (healthy ? 'no_recovery' : 'startup_diagnostic_review');
  return {
    ...artifact,
    recommended_action: recommendedAction,
    recommended_action_display: artifact.recommended_action_display ?? recommendedAction.replaceAll('_', ' '),
    recommended_command: artifact.recommended_command ?? null,
    recovery_kind: recoveryKind,
    recovery_kind_display: artifact.recovery_kind_display ?? recoveryKind.replaceAll('_', ' '),
    recovery_primary_command: artifact.recovery_primary_command ?? null,
    recovery_followup_command: artifact.recovery_followup_command ?? null,
    handoffs: artifact.handoffs ?? preflightHandoffs({ identity, session }),
  };
}

export function preflightHandoffs({ identity, session } = {}) {
  if (!identity || !session) return null;
  const prefix = `narada-agent-cli --identity ${identity} --session ${session}`;
  return {
    mcp_preflight_read: `${prefix} --mcp-preflight-read`,
    mcp_preflight_read_json: `${prefix} --mcp-preflight-read-json`,
    mcp_preflight_diagnostics: `${prefix} --mcp-preflight-diagnostics --mcp-preflight-diagnostics-filter all`,
    mcp_preflight_diagnostics_json: `${prefix} --mcp-preflight-diagnostics-json --mcp-preflight-diagnostics-filter all`,
  };
}

export function createMcpPreflightArtifactSnapshot(preflightArtifact) {
  return {
    mcp_preflight_artifact_path: preflightArtifact?.artifact_path ?? preflightArtifact?.path ?? null,
    mcp_preflight_artifact_generated_at: preflightArtifact?.generated_at ?? null,
    mcp_preflight_operational_state: preflightArtifact?.mcp_operational_state ?? preflightArtifact?.operational_state ?? null,
    mcp_preflight_startup_failure_summary: preflightArtifact?.mcp_startup_failure_summary ?? preflightArtifact?.startup_failure_summary ?? null,
    mcp_preflight_runtime_fault_summary: preflightArtifact?.mcp_runtime_fault_summary ?? preflightArtifact?.runtime_fault_summary ?? null,
    mcp_preflight_recommended_action: preflightArtifact?.recommended_action ?? null,
    mcp_preflight_recommended_action_display: preflightArtifact?.recommended_action_display ?? null,
    mcp_preflight_recommended_command: preflightArtifact?.recommended_command ?? null,
    mcp_preflight_recovery_kind: preflightArtifact?.recovery_kind ?? null,
    mcp_preflight_recovery_kind_display: preflightArtifact?.recovery_kind_display ?? null,
    mcp_preflight_recovery_primary_command: preflightArtifact?.recovery_primary_command ?? null,
    mcp_preflight_recovery_followup_command: preflightArtifact?.recovery_followup_command ?? null,
    mcp_preflight_handoffs: preflightArtifact?.handoffs ?? null,
  };
}

function appendJsonlRecord(path, entry) {
  if (!path) return;
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
}
