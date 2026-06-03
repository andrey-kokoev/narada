export const CREATE_SITE_SUPPORTED_PRESETS = ['minimal', 'agent-site-core', 'agent-memory', 'task-lifecycle', 'site-machinery'] as const;

export type CreateSiteSupportedPreset = typeof CREATE_SITE_SUPPORTED_PRESETS[number];

export interface CreateSitePackageDescriptor {
  package_name: string;
  posture: 'descriptor_only' | 'unknown_package_refused';
  template_component: boolean;
  descriptors: string[];
  denied_live_effects: string[];
}

export interface CreateSiteTemplateSelection {
  template_id: string;
  template_components: string[];
}

export function isCreateSiteSupportedPreset(preset: string): preset is CreateSiteSupportedPreset {
  return CREATE_SITE_SUPPORTED_PRESETS.includes(preset as CreateSiteSupportedPreset);
}

export function expandCreateSitePackageDescriptorsFromPackages(
  packages: Array<Record<string, unknown>> = [],
): CreateSitePackageDescriptor[] {
  return packages.map((pkg) => {
    const packageName = String(pkg.name ?? '');
    if (packageName === '@narada2/site-task-lifecycle') {
      return {
        package_name: packageName,
        posture: 'descriptor_only',
        template_component: true,
        descriptors: [
          'receiving_site_setup_plan',
          'task_db_schema_init_plan',
          'task_db_adapter_conformance_contract',
          'task_admission_write_request',
          'mcp_registration_descriptor',
        ],
        denied_live_effects: [
          'package-owned SQLite',
          'SQLite mutation',
          'source task DB/history import',
          'live MCP registration',
        ],
      };
    }
    if (packageName === '@narada2/agent-context-memory') {
      return {
        package_name: packageName,
        posture: 'descriptor_only',
        template_component: true,
        descriptors: [
          'named_agent_registry_fragment',
          'session_start_contract',
          'checkpoint_descriptor',
          'hydration_request_descriptor',
          'agent_context_schema_init_plan',
          'mcp_registration_descriptor',
          'capability_registry_fragment',
        ],
        denied_live_effects: [
          'package-owned SQLite',
          'runtime hydration execution',
          'source checkpoint/agent-context DB import',
          'live MCP registration',
        ],
      };
    }
    if (packageName === '@narada2/site-inbox') {
      return {
        package_name: packageName,
        posture: 'descriptor_only',
        template_component: true,
        descriptors: [
          'envelope_admission_request',
          'admission_decision',
          'portable_artifact_plan',
          'crossing_coordinates',
          'inbox_refusal_guard',
        ],
        denied_live_effects: [
          'inbox DB mutation',
          'portable envelope file write',
          'source inbox DB/history import',
          'task promotion',
          'live MCP registration',
        ],
      };
    }
    if (packageName === '@narada2/site-config') {
      return {
        package_name: packageName,
        posture: 'descriptor_only',
        template_component: true,
        descriptors: [
          'known_site_registry_entry',
          'capability_edge',
          'capability_denial',
          'registered_site_probe_request',
          'registered_site_probe_report',
        ],
        denied_live_effects: [
          'target Site config mutation',
          'target task/inbox DB import',
          'trust record mutation',
          'live probe execution',
          'arbitrary client/project scan',
        ],
      };
    }
    if (packageName === '@narada2/site-lift') {
      return {
        package_name: packageName,
        posture: 'descriptor_only',
        template_component: true,
        descriptors: [
          'artifact_descriptor',
          'adoption_plan',
          'adoption_command_packet',
          'nonportable_state_refusal',
          'receiver_admission_summary',
        ],
        denied_live_effects: [
          'file copy/install/bootstrap',
          'source runtime state import',
          'receiving Site mutation authority',
          'live MCP registration',
          'catalog publication',
        ],
      };
    }
    return {
      package_name: packageName,
      posture: 'unknown_package_refused',
      template_component: false,
      descriptors: [],
      denied_live_effects: ['unknown package cannot grant live capability'],
    };
  });
}

export function selectCreateSiteTemplate(
  preset: string,
  templateCatalog: { template_id?: string; template_components?: string[] } | undefined,
  packageDescriptors: CreateSitePackageDescriptor[],
): CreateSiteTemplateSelection {
  return {
    template_id: templateCatalog?.template_id ?? `narada-proper.templates.site.${preset}.v0`,
    template_components: templateCatalog?.template_components ?? packageDescriptors.map((descriptor) => descriptor.package_name),
  };
}
