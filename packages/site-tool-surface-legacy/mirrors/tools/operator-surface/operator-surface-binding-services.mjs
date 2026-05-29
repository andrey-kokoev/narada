import { join } from 'path';

export function bindingRecommendedAction(status) {
  if (status === 'dead') return 'operator_surface_prune_stale_bindings_then_operator_surface_bind_agent_if_new_carrier_exists';
  if (status === 'guard_drift') return 'operator_surface_bind_agent_or_operator_surface_unbind_agent_after_identity_check';
  if (status === 'evidence_drift') return 'operator_surface_project_osl_bindings_or_reobserve_surface';
  return 'none';
}

export function bindingDiagnosisEvaluation(counts) {
  if ((counts.dead ?? 0) > 0) return `DEAD: ${counts.dead} active binding(s) point at closed or unprobeable HWNDs.`;
  if ((counts.guard_drift ?? 0) > 0) return `GUARD_DRIFT: ${counts.guard_drift} active binding(s) have class/process drift requiring identity review.`;
  if ((counts.evidence_drift ?? 0) > 0) return `EVIDENCE_DRIFT: ${counts.evidence_drift} live binding(s) have non-terminal evidence drift; refresh evidence rather than pruning blindly.`;
  return 'HEALTHY: Active bindings are live against SQLite authority; Windows Terminal PID/title churn is recorded as volatile evidence, not binding degradation.';
}

export function classifyBindingLiveness(liveness) {
  const drift = [...(liveness.guard_drift ?? [])];
  const hardFailures = [...(liveness.hard_failures ?? [])];
  const currentClass = liveness.current?.window_class ?? null;
  const softTerminalDrift = currentClass === 'CASCADIA_HOSTING_WINDOW_CLASS'
    && drift.length > 0
    && drift.every((reason) => reason === 'pid_mismatch' || reason === 'title_mismatch');

  if (hardFailures.length > 0 || !liveness.window_live) {
    return { status: 'dead', reasons: hardFailures };
  }
  if (softTerminalDrift) {
    return { status: 'healthy', reasons: [], volatile_evidence_drift: drift };
  }
  if (drift.length > 0) {
    return { status: 'guard_drift', reasons: drift };
  }
  return { status: 'healthy', reasons: [] };
}

export function assembleBindingDiagnosis({ rows, livenessBySurfaceId, dbPath }) {
  const bindings = rows.map((row) => {
    const fallbackLiveness = {
      live: false,
      window_live: false,
      hard_failures: ['surface_without_hwnd'],
      guard_drift: [],
      current: null,
    };
    const liveness = row.hwnd ? (livenessBySurfaceId.get(row.surface_id) ?? fallbackLiveness) : fallbackLiveness;
    const classification = classifyBindingLiveness(liveness);
    return {
      binding_id: row.binding_id,
      surface_id: row.surface_id,
      identity_name: row.identity_name,
      hwnd: row.hwnd ? Number(row.hwnd) : null,
      status: classification.status,
      reasons: classification.reasons,
      volatile_evidence_drift: classification.volatile_evidence_drift ?? [],
      liveness,
      projection_role: 'sqlite_authority',
      recommended_action: bindingRecommendedAction(classification.status),
    };
  });
  const counts = Object.fromEntries(['healthy', 'evidence_drift', 'guard_drift', 'dead'].map((status) => [
    status,
    bindings.filter((binding) => binding.status === status).length,
  ]));
  const volatileEvidenceDrift = bindings.filter((binding) => (binding.volatile_evidence_drift ?? []).length > 0).length;
  return {
    schema: 'narada.operator_surfaces.binding_diagnosis.v0',
    authority: 'sqlite',
    db_path: dbPath,
    total_bindings: bindings.length,
    ...counts,
    volatile_evidence_drift: volatileEvidenceDrift,
    evidence_labels: {
      volatile_evidence_drift: 'Live HWND binding with non-authoritative PID/title churn; refresh evidence/projection, do not rebind by default.',
      guard_drift: 'Class/process drift that requires identity review before rebinding or unbinding.',
      dead: 'Closed or unprobeable HWND requiring stale-binding prune and replacement binding if a new carrier exists.',
    },
    bindings,
    evaluation: bindingDiagnosisEvaluation(counts),
  };
}

export function assembleRuntimeBindingProjection({
  rows,
  evidenceBySurfaceId,
  pcSiteRoot,
  siteRoot,
  operatorSurfaceRuntimeDbPath,
}) {
  const projected = rows.map((row) => {
    const evidence = evidenceBySurfaceId.get(row.surface_id) ?? {
      hwnd: row.hwnd,
      pid: row.pid,
      process_name: row.process_name,
      window_class: row.window_class,
      window_title: row.window_title,
      live: null,
    };
    return {
      hwnd: Number(row.hwnd),
      identity_name: row.identity_name,
      asserted_by: row.bound_by,
      asserted_at: row.bound_at,
      assertion_method: `sqlite_projection:${row.assertion_method}`,
      observed_pid: evidence.pid ? Number(evidence.pid) : (row.pid ? Number(row.pid) : null),
      observed_process: evidence.process_name ?? row.process_name ?? null,
      observed_title: evidence.window_title ?? row.window_title ?? null,
      observed_class: evidence.window_class ?? row.window_class ?? null,
      projection_source_surface_id: row.surface_id,
    };
  });

  return {
    schema: 'narada.operator_surfaces.runtime_window_bindings.v0',
    owner_pc_site_root: pcSiteRoot.replaceAll('/', '\\'),
    user_identity_registry: join(siteRoot, 'operator-surfaces', 'identities.json'),
    updated_at: new Date().toISOString(),
    projection_authority: 'sqlite',
    projection_source: operatorSurfaceRuntimeDbPath,
    projection_note: 'Compatibility projection for current OSL binary. SQLite remains authoritative; legacy non-SQLite bindings are not preserved.',
    bindings: projected,
  };
}
