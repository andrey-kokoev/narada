export interface KomorebiYasbWorkspaceTemplate {
  schema: 'narada.windows_komorebi_yasb.workspace_template.v0';
  template_id: string;
  workspace_roles: string[];
  monitor_roles: string[];
  receiving_site_parameters_required: true;
  live_monitor_state_imported: false;
}

export interface KomorebiYasbHealthDescriptor {
  schema: 'narada.windows_komorebi_yasb.health_descriptor.v0';
  checks: Array<'komorebi' | 'yasb' | 'whkd' | 'display_topology' | 'rdp'>;
  fixture_data_only: true;
}

export function buildKomorebiYasbWorkspaceTemplate(template_id: string): KomorebiYasbWorkspaceTemplate {
  return {
    schema: 'narada.windows_komorebi_yasb.workspace_template.v0',
    template_id,
    workspace_roles: ['architect', 'builder', 'observer', 'resident'],
    monitor_roles: ['primary', 'secondary'],
    receiving_site_parameters_required: true,
    live_monitor_state_imported: false,
  };
}

export function buildKomorebiYasbHealthDescriptor(): KomorebiYasbHealthDescriptor {
  return {
    schema: 'narada.windows_komorebi_yasb.health_descriptor.v0',
    checks: ['komorebi', 'yasb', 'whkd', 'display_topology', 'rdp'],
    fixture_data_only: true,
  };
}

export {
  buildKomorebiYasbMaterializationRequest,
  decideKomorebiYasbMaterialization,
  type KomorebiYasbMaterializationDecision,
  type KomorebiYasbMaterializationRequest,
  type KomorebiYasbMaterializationSurface,
} from './materialization-policy.js';
