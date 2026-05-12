export type BindingLivenessStatus = 'healthy' | 'guard_drift' | 'dead';

export interface BindingAuthorityRow {
  binding_id: string;
  surface_id: string;
  identity_id: string;
  hwnd?: number | string | null;
  asserted_by?: string;
  asserted_at?: string;
  assertion_method?: string;
  process_name?: string | null;
  window_class?: string | null;
  window_title?: string | null;
}

export interface BindingLivenessEvidence {
  window_live: boolean;
  hard_failures?: string[];
  guard_drift?: string[];
  current?: {
    window_class?: string | null;
    pid?: number | string | null;
    process_name?: string | null;
    window_title?: string | null;
  } | null;
}

export interface BindingLivenessClassification {
  status: BindingLivenessStatus;
  reasons: string[];
  volatile_evidence_drift: string[];
}

export interface BindingDiagnosisEntry {
  binding_id: string;
  surface_id: string;
  identity_id: string;
  hwnd: number | null;
  status: BindingLivenessStatus;
  reasons: string[];
  volatile_evidence_drift: string[];
  projection_role: 'receiving_site_binding_authority';
  recommended_action:
    | 'none'
    | 'operator_surface_prune_stale_bindings_then_bind_if_new_carrier_exists'
    | 'operator_surface_bind_or_unbind_after_identity_check';
}

export interface BindingDiagnosis {
  schema: 'narada.windows_operator_surface.binding_diagnosis.v0';
  authority: 'receiving_site_supplied';
  total_bindings: number;
  healthy: number;
  guard_drift: number;
  dead: number;
  volatile_evidence_drift: number;
  bindings: BindingDiagnosisEntry[];
  package_imported_runtime_state: false;
}

export function classifyBindingLiveness(liveness: BindingLivenessEvidence): BindingLivenessClassification {
  const drift = [...(liveness.guard_drift ?? [])];
  const hardFailures = [...(liveness.hard_failures ?? [])];
  const currentClass = liveness.current?.window_class ?? null;
  const softTerminalDrift = currentClass === 'CASCADIA_HOSTING_WINDOW_CLASS'
    && drift.length > 0
    && drift.every((reason) => reason === 'pid_mismatch' || reason === 'title_mismatch');

  if (hardFailures.length > 0 || !liveness.window_live) {
    return { status: 'dead', reasons: hardFailures, volatile_evidence_drift: [] };
  }
  if (softTerminalDrift) {
    return { status: 'healthy', reasons: [], volatile_evidence_drift: drift };
  }
  if (drift.length > 0) {
    return { status: 'guard_drift', reasons: drift, volatile_evidence_drift: [] };
  }
  return { status: 'healthy', reasons: [], volatile_evidence_drift: [] };
}

export function bindingRecommendedAction(status: BindingLivenessStatus): BindingDiagnosisEntry['recommended_action'] {
  if (status === 'dead') return 'operator_surface_prune_stale_bindings_then_bind_if_new_carrier_exists';
  if (status === 'guard_drift') return 'operator_surface_bind_or_unbind_after_identity_check';
  return 'none';
}

export function assembleBindingDiagnosis(input: {
  rows: BindingAuthorityRow[];
  livenessBySurfaceId: Map<string, BindingLivenessEvidence>;
}): BindingDiagnosis {
  const fallbackLiveness: BindingLivenessEvidence = {
    window_live: false,
    hard_failures: ['surface_without_hwnd'],
    guard_drift: [],
    current: null,
  };
  const bindings = input.rows.map((row): BindingDiagnosisEntry => {
    const liveness = row.hwnd ? (input.livenessBySurfaceId.get(row.surface_id) ?? fallbackLiveness) : fallbackLiveness;
    const classification = classifyBindingLiveness(liveness);
    return {
      binding_id: row.binding_id,
      surface_id: row.surface_id,
      identity_id: row.identity_id,
      hwnd: row.hwnd ? Number(row.hwnd) : null,
      status: classification.status,
      reasons: classification.reasons,
      volatile_evidence_drift: classification.volatile_evidence_drift,
      projection_role: 'receiving_site_binding_authority',
      recommended_action: bindingRecommendedAction(classification.status),
    };
  });

  return {
    schema: 'narada.windows_operator_surface.binding_diagnosis.v0',
    authority: 'receiving_site_supplied',
    total_bindings: bindings.length,
    healthy: bindings.filter((binding) => binding.status === 'healthy').length,
    guard_drift: bindings.filter((binding) => binding.status === 'guard_drift').length,
    dead: bindings.filter((binding) => binding.status === 'dead').length,
    volatile_evidence_drift: bindings.filter((binding) => binding.volatile_evidence_drift.length > 0).length,
    bindings,
    package_imported_runtime_state: false,
  };
}

export interface RuntimeBindingProjection {
  schema: 'narada.windows_operator_surface.runtime_binding_projection.v0';
  projection_authority: 'receiving_site_supplied';
  bindings: Array<{
    hwnd: number;
    identity_id: string;
    asserted_by?: string;
    asserted_at?: string;
    assertion_method: string;
    observed_process?: string | null;
    observed_title?: string | null;
    observed_class?: string | null;
    projection_source_surface_id: string;
  }>;
  package_imported_runtime_state: false;
}

export function assembleRuntimeBindingProjection(input: {
  rows: BindingAuthorityRow[];
  evidenceBySurfaceId: Map<string, BindingLivenessEvidence>;
}): RuntimeBindingProjection {
  return {
    schema: 'narada.windows_operator_surface.runtime_binding_projection.v0',
    projection_authority: 'receiving_site_supplied',
    bindings: input.rows
      .filter((row) => row.hwnd !== undefined && row.hwnd !== null)
      .map((row) => {
        const evidence = input.evidenceBySurfaceId.get(row.surface_id);
        return {
          hwnd: Number(row.hwnd),
          identity_id: row.identity_id,
          asserted_by: row.asserted_by,
          asserted_at: row.asserted_at,
          assertion_method: `receiving_site_projection:${row.assertion_method ?? 'unknown'}`,
          observed_process: evidence?.current?.process_name ?? row.process_name ?? null,
          observed_title: evidence?.current?.window_title ?? row.window_title ?? null,
          observed_class: evidence?.current?.window_class ?? row.window_class ?? null,
          projection_source_surface_id: row.surface_id,
        };
      }),
    package_imported_runtime_state: false,
  };
}
