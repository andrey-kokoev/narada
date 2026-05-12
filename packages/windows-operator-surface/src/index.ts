export interface OperatorSurfaceBindingDescriptor {
  schema: 'narada.windows_operator_surface.binding_descriptor.v0';
  surface_id: string;
  receiving_site_id: string;
  identity_id: string;
  role_name?: string;
  source_hwnd_ref: 'fixture' | 'receiving_site_observation';
  binding_evidence_refs: string[];
  projection_status: 'planned' | 'bound' | 'stale' | 'refused';
  live_hwnd_imported: false;
  source_identity_authority_imported: false;
}

export interface OperatorSurfaceHealthDescriptor {
  schema: 'narada.windows_operator_surface.health_descriptor.v0';
  surface_id: string;
  status: 'healthy' | 'stale_binding' | 'projection_missing' | 'carrier_missing' | 'refused';
  compact_repair_result: 'none' | 'restart_requested' | 'rebind_required' | 'separate_pc_authority_required';
  pc_runtime_mutated: false;
}

export function buildOperatorSurfaceBindingDescriptor(input: {
  surface_id: string;
  receiving_site_id: string;
  identity_id: string;
  role_name?: string;
  binding_evidence_refs?: string[];
}): OperatorSurfaceBindingDescriptor {
  return {
    schema: 'narada.windows_operator_surface.binding_descriptor.v0',
    surface_id: input.surface_id,
    receiving_site_id: input.receiving_site_id,
    identity_id: input.identity_id,
    role_name: input.role_name,
    source_hwnd_ref: 'fixture',
    binding_evidence_refs: input.binding_evidence_refs ?? [],
    projection_status: 'planned',
    live_hwnd_imported: false,
    source_identity_authority_imported: false,
  };
}

export function buildOperatorSurfaceHealthDescriptor(surface_id: string): OperatorSurfaceHealthDescriptor {
  return {
    schema: 'narada.windows_operator_surface.health_descriptor.v0',
    surface_id,
    status: 'carrier_missing',
    compact_repair_result: 'separate_pc_authority_required',
    pc_runtime_mutated: false,
  };
}

export * from './binding-diagnosis.js';
