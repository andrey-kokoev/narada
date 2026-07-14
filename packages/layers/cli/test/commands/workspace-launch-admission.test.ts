import { describe, expect, it } from 'vitest';
import {
  createWorkspaceLaunchAdmissionPolicy,
  type WorkspaceLaunchProviderRegistry,
} from '../../src/commands/workspace-launch-admission.js';
import {
  workspaceLaunchSelectorModel,
  type WorkspaceLaunchSelectionContext,
} from '../../src/commands/workspace-launch-selection.js';
import type { WorkspaceLaunchRecord } from '../../src/commands/workspace-launch-types.js';

const providerRegistry: WorkspaceLaunchProviderRegistry = {
  default_provider: 'kimi-code-api',
  providers: {
    'kimi-code-api': { meaning: 'Kimi Code', support_state: 'verified_supported' },
    'codex-subscription': { meaning: 'Codex subscription', support_state: 'verified_supported' },
    'openrouter-api': { meaning: 'OpenRouter', support_state: 'verified_supported' },
    'retired-provider': { meaning: 'Retired', support_state: 'retired' },
  },
};

const record = {
  agent: 'sonar.resident',
  agent_identity_ref: {} as WorkspaceLaunchRecord['agent_identity_ref'],
  title: 'Sonar Resident',
  role: 'resident',
  site: 'sonar',
  narada_root: 'D:/code/narada.sonar',
  site_root: 'D:/code/narada.sonar',
  workspace_root: 'D:/code/narada.sonar',
  launcher_path: 'D:/code/narada.sonar/narada-sonar.ps1',
  operator_surface: 'agent-cli',
  runtime: 'narada-agent-runtime-server',
  authority: null,
  enable_native_shell: false,
  mcp_scope: 'all',
  config_path: 'D:/config/agents.psd1',
} satisfies WorkspaceLaunchRecord;

describe('workspace launch admission policy', () => {
  it('centralizes runtime, surface, role, and provider admission', () => {
    const admission = createWorkspaceLaunchAdmissionPolicy({
      providerRegistry,
      admittedProviders: ['kimi-code-api', 'openrouter-api'],
    });
    const context: WorkspaceLaunchSelectionContext = { admission };

    expect(admission.narsOperatorSurfaceKinds).toEqual(['agent-cli', 'agent-web-ui']);
    expect(admission.resolveOperatorSurfaceRuntimeSelection('agent-web-ui', 'narada-agent-runtime-server')).toMatchObject({
      operator_surface_kind: 'agent-web-ui',
      runtime_host_kind: 'narada-agent-runtime-server',
    });
    expect(admission.roleChoicesForSelectedSites([record], ['sonar'])).toEqual(['resident']);
    expect(admission.intelligenceProviderChoices().map((choice) => choice.value)).toEqual([
      'registry default',
      'kimi-code-api',
      'openrouter-api',
    ]);

    const model = workspaceLaunchSelectorModel(
      [record],
      {
        site: ['sonar'],
        role: ['resident'],
        operatorSurface: ['agent-web-ui'],
        runtime: 'narada-agent-runtime-server',
        intelligenceProvider: 'kimi-code-api',
      },
      [],
      context,
    );

    expect(model.selected.operatorSurface).toEqual(['agent-web-ui']);
    expect(model.selected.intelligenceProvider).toBe('kimi-code-api');
    expect(model.intelligenceProviderOptions.map((choice) => choice.value)).toEqual([
      'registry default',
      'kimi-code-api',
      'openrouter-api',
    ]);
  });
});
