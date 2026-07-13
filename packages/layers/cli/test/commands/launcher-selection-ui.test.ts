import { describe, expect, it } from 'vitest';
import { renderWorkspaceLaunchSelectionHtml } from '../../src/commands/launcher-selection-ui.js';

const template = '<script id="narada-workspace-launch-bootstrap">__NARADA_WORKSPACE_LAUNCH_BOOTSTRAP__</script>';

describe('launcher selection UI renderer', () => {
  it('projects the model and UI options into the bootstrap document', () => {
    const html = renderWorkspaceLaunchSelectionHtml(
      template,
      { initialSites: ['sonar'], initialRoles: ['resident'] },
      { persistent: true, basePath: '/launcher' },
    );

    expect(html).toContain('"initialSites":["sonar"]');
    expect(html).toContain('"persistent":true');
    expect(html).toContain('"basePath":"/launcher"');
  });

  it('escapes bootstrap markup before embedding it in a script element', () => {
    const html = renderWorkspaceLaunchSelectionHtml(template, { value: '</script><script>alert(1)</script>' });

    expect(html).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
    expect(html).not.toContain('</script><script>alert(1)</script>');
  });

  it('rejects templates without the bootstrap insertion point', () => {
    expect(() => renderWorkspaceLaunchSelectionHtml('<html></html>', {})).toThrow(
      'workspace_launch_ui_bootstrap_placeholder_missing',
    );
  });
});
