export interface WindowsPcSiteTemplateDescriptor {
  schema: 'narada.windows_pc_site_template.descriptor.v0';
  site_id: string;
  runtime_root: string;
  tool_root: string;
  log_root: string;
  required_admissions: string[];
  live_pc_state_imported: false;
}

export function buildWindowsPcSiteTemplateDescriptor(input: {
  site_id: string;
  runtime_root: string;
}): WindowsPcSiteTemplateDescriptor {
  return {
    schema: 'narada.windows_pc_site_template.descriptor.v0',
    site_id: input.site_id,
    runtime_root: input.runtime_root,
    tool_root: `${input.runtime_root}/tools`,
    log_root: `${input.runtime_root}/logs`,
    required_admissions: [
      'pc_locus_authority',
      'windows_profile_authority',
      'operator_surface_carrier_authority',
    ],
    live_pc_state_imported: false,
  };
}

export {
  buildWindowsPcSiteTemplatePlan,
  type WindowsPcSiteSlice,
  type WindowsPcSiteTemplatePlan,
  type WindowsPcSiteTemplatePlanInput,
} from './template-plan.js';
