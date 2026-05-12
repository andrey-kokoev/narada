import { describe, expect, it } from 'vitest';
import { buildWindowsPcSiteTemplateDescriptor } from '../src/index.js';

describe('windows PC Site template descriptor', () => {
  it('parameterizes runtime layout without importing live PC state', () => {
    const template = buildWindowsPcSiteTemplateDescriptor({
      site_id: 'pc-fixture',
      runtime_root: 'C:/ProgramData/Narada/sites/pc/fixture',
    });

    expect(template.tool_root).toBe('C:/ProgramData/Narada/sites/pc/fixture/tools');
    expect(template.required_admissions).toContain('pc_locus_authority');
    expect(template.live_pc_state_imported).toBe(false);
  });
});
