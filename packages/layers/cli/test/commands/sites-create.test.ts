import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

const promptMock = vi.hoisted(() => ({
  selectResponses: [] as unknown[],
  textResponses: [] as unknown[],
  multiselectResponses: [] as unknown[],
  confirmResponses: [] as unknown[],
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  intro: promptMock.intro,
  outro: promptMock.outro,
  note: promptMock.note,
  cancel: promptMock.cancel,
  isCancel: (value: unknown) => value === Symbol.for('clack:cancel'),
  select: vi.fn(async () => promptMock.selectResponses.shift()),
  text: vi.fn(async () => promptMock.textResponses.shift()),
  multiselect: vi.fn(async () => promptMock.multiselectResponses.shift()),
  confirm: vi.fn(async () => promptMock.confirmResponses.shift()),
}));

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSiteConfigForCapabilitySelection,
  sitesCreateCommand,
  sitesCreatePresetsCommand,
  sitesLiveCarrierCommand,
  sitesSetupCommand,
} from '../../src/commands/sites.js';
import type { CommandContext } from '../../src/lib/command-wrapper.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

function createMockContext(): CommandContext {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  };
  return {
    configPath: '/test/config.json',
    logger: logger as unknown as CommandContext['logger'],
    verbose: false,
  };
}

const tempDirs: string[] = [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const fixturesRoot = join(repoRoot, 'docs', 'product', 'fixtures', 'create-site-options');

function fixturePath(name: string): string {
  return join(fixturesRoot, name);
}

function refusalCodes(result: unknown): string[] {
  return ((result as { refusals: Array<{ code: string }> }).refusals ?? []).map((refusal) => refusal.code);
}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'narada-sites-create-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  promptMock.selectResponses.length = 0;
  promptMock.textResponses.length = 0;
  promptMock.multiselectResponses.length = 0;
  promptMock.confirmResponses.length = 0;
  promptMock.intro.mockClear();
  promptMock.outro.mockClear();
  promptMock.note.mockClear();
  promptMock.cancel.mockClear();
});

describe('sitesCreateCommand', () => {
  it('lists create-site presets as a read-only catalog surface', async () => {
    const result = await sitesCreatePresetsCommand({ format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      schema: string;
      status: string;
      recommended_preset: string;
      default_interactive_preset: string;
      presets: Array<{
        preset: string;
        label: string;
        recommended: boolean;
        use_when: string;
        includes: string[];
        does_not_include: string[];
        package_components: string[];
        operational_commands: { dry_run: string; skeleton: string; live: string | null };
        admission_boundary: { source_state_imported: boolean; package_selection_grants_live_capability: boolean };
      }>;
      non_claims: string[];
    };
    expect(output.schema).toBe('narada.create_site.presets.v0');
    expect(output.status).toBe('ok');
    expect(output.recommended_preset).toBe('agent-site-core');
    expect(output.default_interactive_preset).toBe('agent-site-core');
    expect(output.presets.map((preset) => preset.preset)).toEqual([
      'minimal',
      'agent-site-core',
      'agent-memory',
      'task-lifecycle',
      'site-machinery',
    ]);
    expect(output.presets.filter((preset) => preset.recommended).map((preset) => preset.preset)).toEqual(['agent-site-core']);
    expect(output.presets).toContainEqual(expect.objectContaining({
      preset: 'agent-site-core',
      label: 'Agent Site core',
      recommended: true,
      use_when: expect.stringContaining('useful agent-facing Site baseline'),
      includes: ['task_lifecycle', 'agent_context_memory', 'canonical_inbox'],
      does_not_include: expect.arrayContaining(['site_config_awareness', 'site_lift_adoption', 'live capability grants']),
      package_components: [
        '@narada2/site-task-lifecycle',
        '@narada2/agent-context-memory',
        '@narada2/site-inbox',
      ],
    }));
    expect(output.presets).toContainEqual(expect.objectContaining({
      preset: 'site-machinery',
      package_components: [
        '@narada2/site-inbox',
        '@narada2/site-config',
        '@narada2/site-lift',
      ],
    }));
    expect(output.presets.find((preset) => preset.preset === 'agent-site-core')?.operational_commands.live)
      .toBe('narada sites create --preset agent-site-core --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json');
    expect(output.presets.find((preset) => preset.preset === 'task-lifecycle')?.operational_commands.live)
      .toContain('--execute-live');
    expect(output.presets.find((preset) => preset.preset === 'agent-memory')?.operational_commands.live)
      .toBe('narada sites create --preset agent-memory --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json');
    expect(output.presets.find((preset) => preset.preset === 'site-machinery')?.operational_commands.live)
      .toBe('narada sites create --preset site-machinery --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json');
    expect(output.presets.every((preset) => preset.admission_boundary.source_state_imported === false)).toBe(true);
    expect(output.presets.every((preset) => preset.admission_boundary.package_selection_grants_live_capability === false)).toBe(true);
    expect(output.non_claims).toContain('source Site import/migration/lift');
  });

  it('renders create-site presets as concise human guidance by default', async () => {
    const result = await sitesCreatePresetsCommand({ format: 'human' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      recommended_preset: string;
      _formatted: string;
    };
    expect(output.recommended_preset).toBe('agent-site-core');
    expect(output._formatted).toContain('Recommended/default: agent-site-core - Agent Site core');
    expect(output._formatted).toContain('Quick start: narada sites create --site-id <id> --root <path>');
    expect(output._formatted).toContain('Boundary: package/template selection does not grant live capability');
  });

  it('emits a descriptor-only minimal Site dry-run plan', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-minimal.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      schema: string;
      status: string;
      selected_preset: string;
      package_descriptors: unknown[];
      evidence: { dry_run_only: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(plan.schema).toBe('narada.create_site.dry_run_plan.v0');
    expect(plan.status).toBe('planned');
    expect(plan.selected_preset).toBe('minimal');
    expect(plan.package_descriptors).toEqual([]);
    expect(plan.evidence.dry_run_only).toBe(true);
    expect(plan.evidence.source_state_imported).toBe(false);
    expect(plan.non_claims).toContain('filesystem Site creation');
    expect(plan.non_claims).toContain('migration/lift/import from existing Sites');
  });

  it('builds a descriptor-only dry-run plan from shorthand preset flags', async () => {
    const result = await sitesCreateCommand({
      preset: 'task-lifecycle',
      siteId: 'shorthand-task-site',
      root: 'D:\\Sites\\shorthand-task-site',
      siteKind: 'project',
      authorityLocus: 'project',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      config_path: string;
      selected_preset: string;
      selected_template: { template_id: string; template_components: string[] };
      package_descriptors: Array<{ package_name: string; posture: string }>;
      site: { site_id: string; site_root: string };
      evidence: { source_state_imported: boolean; package_selection_grants_live_capability: boolean };
    };
    expect(plan.config_path).toBe('<inline:create-site-options>');
    expect(plan.selected_preset).toBe('task-lifecycle');
    expect(plan.selected_template).toEqual({
      template_id: 'narada-proper.templates.site.task-lifecycle.v0',
      template_components: ['@narada2/site-task-lifecycle'],
    });
    expect(plan.site).toMatchObject({
      site_id: 'shorthand-task-site',
      site_root: 'D:\\Sites\\shorthand-task-site',
    });
    expect(plan.package_descriptors).toContainEqual(expect.objectContaining({
      package_name: '@narada2/site-task-lifecycle',
      posture: 'descriptor_only',
    }));
    expect(plan.evidence.source_state_imported).toBe(false);
    expect(plan.evidence.package_selection_grants_live_capability).toBe(false);
  });

  it('builds descriptor-only create-site config from interactive capability choices', async () => {
    const config = createSiteConfigForCapabilitySelection({
      siteId: 'interactive-site',
      root: 'D:\\Sites\\interactive-site',
      siteKind: 'project',
      authorityLocus: 'project',
      capabilities: ['task_lifecycle', 'agent_context_memory', 'canonical_inbox'],
      mode: 'dry_run',
    });

    expect(config).toMatchObject({
      schema: 'narada.create_site.options.v0',
      mode: 'dry_run',
      preset: 'agent-site-core',
      template_catalog: {
        template_id: 'narada-proper.templates.site.agent-site-core.v0',
        template_components: [
          '@narada2/site-task-lifecycle',
          '@narada2/agent-context-memory',
          '@narada2/site-inbox',
        ],
      },
      site: {
        site_id: 'interactive-site',
        site_root: 'D:\\Sites\\interactive-site',
      },
      storage: { intent: 'descriptor_only' },
      mcp: { intent: 'descriptor_only', surfaces: ['site_task_lifecycle', 'agent_context_memory'] },
      capabilities: {
        policy: 'declare_required',
        required: ['task_lifecycle', 'agent_context_memory', 'canonical_inbox'],
        denied: ['source_task_db_import', 'source_checkpoint_import', 'source_inbox_history_import'],
      },
      inbox: { enable: 'canonical_envelope_intake' },
      task_lifecycle: { enable: 'descriptor_only', package: '@narada2/site-task-lifecycle' },
      agent_context: { enable: 'descriptor_only', package: '@narada2/agent-context-memory' },
    });
    expect(config.evidence).toMatchObject({
      selected_interactively: true,
      template_refs: [
        'narada-proper.templates.site.agent-site-core.v0',
        'package:@narada2/site-task-lifecycle',
        'package:@narada2/agent-context-memory',
        'package:@narada2/site-inbox',
      ],
    });
  });

  it('plans interactive capability-selected Sites without granting live capabilities', async () => {
    const dir = tempDir();
    const configPath = join(dir, 'interactive-create-site.json');
    writeFileSync(configPath, JSON.stringify(createSiteConfigForCapabilitySelection({
      siteId: 'interactive-site',
      root: 'D:\\Sites\\interactive-site',
      siteKind: 'project',
      authorityLocus: 'project',
      capabilities: ['task_lifecycle', 'agent_context_memory', 'canonical_inbox'],
      mode: 'dry_run',
    }), null, 2));

    const result = await sitesCreateCommand({
      config: configPath,
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      selected_template: { template_id: string; template_components: string[] };
      package_descriptors: Array<{ package_name: string; posture: string }>;
      required_local_admissions: Array<{ admission: string; status: string }>;
      planned_files: Array<{ path: string; mutation: string }>;
      evidence: { package_selection_grants_live_capability: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(plan.selected_template).toEqual({
      template_id: 'narada-proper.templates.site.agent-site-core.v0',
      template_components: [
        '@narada2/site-task-lifecycle',
        '@narada2/agent-context-memory',
        '@narada2/site-inbox',
      ],
    });
    expect(plan.package_descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ package_name: '@narada2/site-task-lifecycle', posture: 'descriptor_only' }),
      expect.objectContaining({ package_name: '@narada2/agent-context-memory', posture: 'descriptor_only' }),
      expect.objectContaining({ package_name: '@narada2/site-inbox', posture: 'descriptor_only' }),
    ]));
    expect(plan.required_local_admissions).toEqual(expect.arrayContaining([
      { admission: 'task_lifecycle_db_init_and_mutation', status: 'separate_admission_required' },
      { admission: 'agent_context_storage_and_hydration', status: 'separate_admission_required' },
      { admission: 'site_inbox_local_substrate_and_publication', status: 'separate_admission_required' },
      { admission: 'package_descriptor_selection', status: 'included_in_dry_run' },
    ]));
    expect(plan.planned_files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'D:\\Sites\\interactive-site\\.narada\\capabilities\\capability-policy.json' }),
      expect.objectContaining({ path: 'D:\\Sites\\interactive-site\\.narada\\mcp\\descriptors\\site_task_lifecycle.json' }),
      expect.objectContaining({ path: 'D:\\Sites\\interactive-site\\.narada\\mcp\\descriptors\\agent_context_memory.json' }),
    ]));
    expect(plan.evidence).toMatchObject({
      package_selection_grants_live_capability: false,
      source_state_imported: false,
    });
    expect(plan.non_claims).toContain('capability or secret grants');
  });

  it('refuses ambiguous interactive and config inputs', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-minimal.json'),
      interactive: true,
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(result.result).toMatchObject({
      status: 'error',
      error: 'interactive_conflicts_with_config',
    });
    expect(promptMock.intro).not.toHaveBeenCalled();
  });

  it('runs the interactive custom capability flow as preview by default', async () => {
    promptMock.selectResponses.push('preview', 'custom', 'project', 'project');
    promptMock.textResponses.push('ux-site', 'D:\\Sites\\ux-site');
    promptMock.multiselectResponses.push(['task_lifecycle', 'site_config_awareness']);
    promptMock.confirmResponses.push(true);

    const result = await sitesCreateCommand({
      interactive: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      schema: string;
      config_path: string;
      selected_template: { template_id: string; template_components: string[] };
      package_descriptors: Array<{ package_name: string }>;
      evidence: { interactive_preview_default: boolean; dry_run_only: boolean; package_selection_grants_live_capability: boolean };
      non_claims: string[];
    };
    expect(plan.schema).toBe('narada.create_site.dry_run_plan.v0');
    expect(plan.config_path).toBe('<interactive:create-site-options>');
    expect(plan.selected_template).toEqual({
      template_id: 'narada-proper.templates.site.interactive-capability-selection.v0',
      template_components: ['@narada2/site-task-lifecycle', '@narada2/site-config'],
    });
    expect(plan.package_descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({ package_name: '@narada2/site-task-lifecycle' }),
      expect.objectContaining({ package_name: '@narada2/site-config' }),
    ]));
    expect(plan.evidence).toMatchObject({
      interactive_preview_default: true,
      dry_run_only: true,
      package_selection_grants_live_capability: false,
    });
    expect(plan.non_claims).toContain('capability or secret grants');
    expect(promptMock.note).toHaveBeenCalledWith(expect.stringContaining('Capability descriptors: Task lifecycle, Site config awareness'), 'Review');
  });

  it('defaults sites setup to the interactive wizard when no setup coordinates are supplied', async () => {
    promptMock.selectResponses.push('preview', 'custom', 'project', 'project');
    promptMock.textResponses.push('setup-site', 'D:\\Sites\\setup-site');
    promptMock.multiselectResponses.push(['task_lifecycle', 'canonical_inbox']);
    promptMock.confirmResponses.push(true);

    const result = await sitesSetupCommand({
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      schema: string;
      command: string;
      config_path: string;
      selected_template: { template_components: string[] };
      evidence: { interactive_preview_default: boolean; package_selection_grants_live_capability: boolean };
    };
    expect(plan.schema).toBe('narada.create_site.dry_run_plan.v0');
    expect(plan.command).toBe('narada sites setup');
    expect(plan.config_path).toBe('<interactive:create-site-options>');
    expect(plan.selected_template.template_components).toEqual([
      '@narada2/site-task-lifecycle',
      '@narada2/site-inbox',
    ]);
    expect(plan.evidence).toMatchObject({
      interactive_preview_default: true,
      package_selection_grants_live_capability: false,
    });
    expect(promptMock.intro).toHaveBeenCalledWith('Narada Site creation');
  });

  it('runs sites setup non-interactively when explicit setup coordinates are supplied', async () => {
    const result = await sitesSetupCommand({
      siteId: 'setup-shorthand-site',
      root: 'D:\\Sites\\setup-shorthand-site',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      command: string;
      config_path: string;
      selected_preset: string;
      site: { site_id: string; site_root: string };
    };
    expect(plan.command).toBe('narada sites setup');
    expect(plan.config_path).toBe('<inline:create-site-options>');
    expect(plan.selected_preset).toBe('agent-site-core');
    expect(plan.site).toMatchObject({
      site_id: 'setup-shorthand-site',
      site_root: 'D:\\Sites\\setup-shorthand-site',
    });
    expect(promptMock.intro).not.toHaveBeenCalled();
  });

  it('creates a Site skeleton only after interactive confirmation', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'interactive-confirmed-site');
    promptMock.selectResponses.push('create', 'task-lifecycle', 'project', 'project');
    promptMock.textResponses.push('interactive-confirmed-site', siteRoot);
    promptMock.confirmResponses.push(true);

    const result = await sitesCreateCommand({
      interactive: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      schema: string;
      status: string;
      config_path: string;
      evidence: { filesystem_creation_completed: boolean; package_selection_grants_live_capability: boolean };
      created_files: Array<{ path: string }>;
    };
    expect(output.schema).toBe('narada.create_site.execution_result.v0');
    expect(output.status).toBe('created');
    expect(output.config_path).toBe('<interactive:create-site-options>');
    expect(output.evidence).toMatchObject({
      filesystem_creation_completed: true,
      package_selection_grants_live_capability: false,
    });
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, 'config.json'),
      join(siteRoot, '.narada', 'capabilities', 'capability-policy.json'),
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-task-lifecycle.json'),
    ]));
  });

  it('reports missing shorthand coordinates without reading a config file', async () => {
    const result = await sitesCreateCommand({
      preset: 'site-machinery',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toEqual(expect.arrayContaining([
      'missing_site_coordinate',
    ]));
  });

  it('renders shorthand dry-run as a concise human plan', async () => {
    const result = await sitesCreateCommand({
      siteId: 'human-plan-site',
      root: 'D:\\Sites\\human-plan-site',
      siteKind: 'project',
      authorityLocus: 'project',
      dryRun: true,
      format: 'human',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      selected_preset: string;
      _formatted: string;
    };
    expect(plan.selected_preset).toBe('agent-site-core');
    expect(plan._formatted).toContain('Narada Site creation plan');
    expect(plan._formatted).toContain('Preset: agent-site-core');
    expect(plan._formatted).toContain('Create: narada sites create --site-id human-plan-site --root D:\\Sites\\human-plan-site');
    expect(plan._formatted).toContain('Use --format json for the full plan/result.');
  });

  it('defaults shorthand flags to the useful agent Site core baseline', async () => {
    const result = await sitesCreateCommand({
      siteId: 'agent-core-default-site',
      root: 'D:\\Sites\\agent-core-default-site',
      siteKind: 'project',
      authorityLocus: 'project',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      selected_preset: string;
      selected_template: { template_id: string; template_components: string[] };
    };
    expect(plan.selected_preset).toBe('agent-site-core');
    expect(plan.selected_template.template_components).toEqual([
      '@narada2/site-task-lifecycle',
      '@narada2/agent-context-memory',
      '@narada2/site-inbox',
    ]);
  });

  it('plans an agent Site core from explicit shorthand preset flags as the useful baseline', async () => {
    const result = await sitesCreateCommand({
      preset: 'agent-site-core',
      siteId: 'agent-core-site',
      root: 'D:\\Sites\\agent-core-site',
      siteKind: 'project',
      authorityLocus: 'project',
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      selected_preset: string;
      selected_template: { template_id: string; template_components: string[] };
      required_local_admissions: Array<{ admission: string; status: string }>;
      planned_files: Array<{ path: string }>;
    };
    expect(plan.selected_preset).toBe('agent-site-core');
    expect(plan.selected_template).toEqual({
      template_id: 'narada-proper.templates.site.agent-site-core.v0',
      template_components: [
        '@narada2/site-task-lifecycle',
        '@narada2/agent-context-memory',
        '@narada2/site-inbox',
      ],
    });
    expect(plan.required_local_admissions).toEqual(expect.arrayContaining([
      { admission: 'task_lifecycle_db_init_and_mutation', status: 'separate_admission_required' },
      { admission: 'agent_context_storage_and_hydration', status: 'separate_admission_required' },
      { admission: 'site_inbox_local_substrate_and_publication', status: 'separate_admission_required' },
    ]));
    expect(plan.planned_files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'D:\\Sites\\agent-core-site\\.narada\\mcp\\descriptors\\site_task_lifecycle.json' }),
      expect.objectContaining({ path: 'D:\\Sites\\agent-core-site\\.narada\\mcp\\descriptors\\agent_context_memory.json' }),
      expect.objectContaining({ path: 'D:\\Sites\\agent-core-site\\.narada\\capabilities\\capability-policy.json' }),
    ]));
  });

  it('creates a minimal greenfield Site skeleton from shorthand flags', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'shorthand-minimal-site');

    const result = await sitesCreateCommand({
      preset: 'minimal',
      siteId: 'shorthand-minimal-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      schema: string;
      status: string;
      config_path: string;
      created_files: Array<{ path: string }>;
      evidence: { filesystem_creation_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.schema).toBe('narada.create_site.execution_result.v0');
    expect(output.status).toBe('created');
    expect(output.config_path).toBe('<inline:create-site-options>');
    expect(output.evidence.filesystem_creation_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, 'config.json'),
      join(siteRoot, 'AGENTS.md'),
      join(siteRoot, '.narada', 'site.json'),
      expect.stringMatching(/\.narada[\\/]lineage[\\/]events[\\/]site-created-.+\.json$/),
      join(siteRoot, '.narada', 'admission', 'admission-ledger.jsonl'),
      join(siteRoot, '.narada', 'inbox', 'README.md'),
    ]));
    const siteSeed = JSON.parse(readFileSync(join(siteRoot, '.narada', 'site.json'), 'utf8')) as {
      origin: { lineage_event_ref: string; lineage_event_path: string };
    };
    expect(siteSeed).toMatchObject({
      schema: 'narada.site.seed.v0',
      site_id: 'shorthand-minimal-site',
      admission_state: {
        runtime_state_imported: false,
        package_selection_grants_live_capability: false,
      },
    });
    expect(siteSeed.origin.lineage_event_ref).toMatch(/^lineage:site-created-/);
    const lineagePath = join(siteRoot, siteSeed.origin.lineage_event_path);
    const lineageEvent = JSON.parse(readFileSync(lineagePath, 'utf8')) as {
      event_type: string;
      builder_site_ref: string;
      built_site_ref: string;
      authority_effect: string;
      source_state_imported: boolean;
      authority_transferred: boolean;
    };
    expect(lineageEvent).toMatchObject({
      event_type: 'site.created',
      builder_site_ref: 'narada-proper',
      built_site_ref: 'shorthand-minimal-site',
      authority_effect: 'establishes_site_authority',
      source_state_imported: false,
      authority_transferred: false,
    });
    const configProjection = JSON.parse(readFileSync(join(siteRoot, 'config.json'), 'utf8')) as {
      projection_posture: string;
      authority_source: string;
      authority_effect: string;
      origin: { lineage_event_ref: string };
    };
    expect(configProjection.projection_posture).toBe('compatibility_projection');
    expect(configProjection.authority_source).toBe('.narada/site.json');
    expect(configProjection.authority_effect).toBe('derived_from_site_seed_not_authority_seed');
    expect(configProjection.origin.lineage_event_ref).toBe(siteSeed.origin.lineage_event_ref);
    expect(output.non_claims).toContain('DB init execution');
    expect(output.non_claims).toContain('MCP registration execution');
  });

  it('renders shorthand create as a concise human result', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'human-created-agent-core-site');

    const result = await sitesCreateCommand({
      siteId: 'human-created-agent-core-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'human',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      selected_preset: string;
      _formatted: string;
    };
    expect(output.status).toBe('created');
    expect(output.selected_preset).toBe('agent-site-core');
    expect(output._formatted).toContain('Narada Site created');
    expect(output._formatted).toContain('Preset: agent-site-core');
    expect(output._formatted).toContain('Created files:');
    expect(output._formatted).toContain('Boundary: descriptor/package selection does not grant live capability');
  });

  it('creates the useful agent Site core skeleton when shorthand omits preset', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'default-agent-core-site');

    const result = await sitesCreateCommand({
      siteId: 'default-agent-core-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      created_files: Array<{ path: string }>;
      evidence: { source_state_imported: boolean; package_selection_grants_live_capability: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created');
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.evidence.package_selection_grants_live_capability).toBe(false);
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-task-lifecycle.json'),
      join(siteRoot, '.narada', 'admission', 'package-slices', 'agent-context-memory.json'),
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-inbox.json'),
      join(siteRoot, '.narada', 'mcp', 'descriptors', 'site_task_lifecycle.json'),
      join(siteRoot, '.narada', 'mcp', 'descriptors', 'agent_context_memory.json'),
      join(siteRoot, '.narada', 'capabilities', 'capability-policy.json'),
    ]));
    const capabilityPolicy = JSON.parse(readFileSync(join(siteRoot, '.narada', 'capabilities', 'capability-policy.json'), 'utf8')) as {
      required: string[];
      live_grants_admitted: boolean;
    };
    expect(capabilityPolicy.required).toEqual(['task_lifecycle', 'agent_context_memory', 'canonical_inbox']);
    expect(capabilityPolicy.live_grants_admitted).toBe(false);
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
    expect(output.non_claims).toContain('package slice live execution');
  });

  it('materializes site-machinery descriptor slices from shorthand execution', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'shorthand-site-machinery');

    const result = await sitesCreateCommand({
      preset: 'site-machinery',
      siteId: 'shorthand-site-machinery',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      created_files: Array<{ path: string }>;
      evidence: { source_state_imported: boolean; package_selection_grants_live_capability: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created');
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.evidence.package_selection_grants_live_capability).toBe(false);
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-inbox.json'),
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-config.json'),
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-lift.json'),
    ]));
    const siteInboxSlice = JSON.parse(readFileSync(join(siteRoot, '.narada', 'admission', 'package-slices', 'site-inbox.json'), 'utf8')) as {
      package_name: string;
      live_execution_admitted: boolean;
      source_state_imported: boolean;
    };
    expect(siteInboxSlice).toMatchObject({
      package_name: '@narada2/site-inbox',
      live_execution_admitted: false,
      source_state_imported: false,
    });
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
    expect(output.non_claims).toContain('package slice live execution');
  });

  it('expands the agent-memory package descriptor without admitting live storage', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-agent-memory.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      status: string;
      package_descriptors: Array<{ package_name: string; posture: string; descriptors: string[] }>;
      required_local_admissions: Array<{ admission: string; status: string }>;
    };
    expect(plan.status).toBe('planned');
    expect(plan.package_descriptors).toContainEqual(expect.objectContaining({
      package_name: '@narada2/agent-context-memory',
      posture: 'descriptor_only',
    }));
    expect(plan.package_descriptors[0].descriptors).toContain('checkpoint_descriptor');
    expect(plan.required_local_admissions).toContainEqual({
      admission: 'agent_context_storage_and_hydration',
      status: 'separate_admission_required',
    });
  });

  it('expands the task-lifecycle package descriptor without admitting DB mutation', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-task-lifecycle.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      package_descriptors: Array<{ package_name: string; posture: string; descriptors: string[] }>;
      required_local_admissions: Array<{ admission: string; status: string }>;
    };
    expect(plan.package_descriptors).toContainEqual(expect.objectContaining({
      package_name: '@narada2/site-task-lifecycle',
      posture: 'descriptor_only',
    }));
    expect(plan.package_descriptors[0].descriptors).toContain('task_admission_write_request');
    expect(plan.required_local_admissions).toContainEqual({
      admission: 'task_lifecycle_db_init_and_mutation',
      status: 'separate_admission_required',
    });
  });

  it('expands reusable Site machinery packages as greenfield descriptor components', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-site-machinery.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const plan = result.result as {
      selected_preset: string;
      selected_template: { template_id: string; template_components: string[] };
      package_descriptors: Array<{
        package_name: string;
        posture: string;
        template_component: boolean;
        descriptors: string[];
        denied_live_effects: string[];
      }>;
      required_local_admissions: Array<{ admission: string; status: string }>;
      planned_files: Array<{ path: string; mutation: string }>;
      evidence: { source_state_imported: boolean; package_selection_grants_live_capability: boolean };
    };
    expect(plan.selected_preset).toBe('site-machinery');
    expect(plan.selected_template).toEqual({
      template_id: 'narada-proper.templates.site.site-machinery.v0',
      template_components: [
        '@narada2/site-inbox',
        '@narada2/site-config',
        '@narada2/site-lift',
      ],
    });
    expect(plan.package_descriptors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        package_name: '@narada2/site-inbox',
        posture: 'descriptor_only',
        template_component: true,
        descriptors: expect.arrayContaining(['envelope_admission_request']),
        denied_live_effects: expect.arrayContaining(['source inbox DB/history import']),
      }),
      expect.objectContaining({
        package_name: '@narada2/site-config',
        posture: 'descriptor_only',
        template_component: true,
        descriptors: expect.arrayContaining(['known_site_registry_entry']),
        denied_live_effects: expect.arrayContaining(['target Site config mutation']),
      }),
      expect.objectContaining({
        package_name: '@narada2/site-lift',
        posture: 'descriptor_only',
        template_component: true,
        descriptors: expect.arrayContaining(['adoption_plan']),
        denied_live_effects: expect.arrayContaining(['source runtime state import']),
      }),
    ]));
    expect(plan.required_local_admissions).toEqual(expect.arrayContaining([
      { admission: 'site_inbox_local_substrate_and_publication', status: 'separate_admission_required' },
      { admission: 'site_config_registry_probe_execution', status: 'separate_admission_required' },
      { admission: 'site_lift_adoption_materialization', status: 'separate_admission_required' },
    ]));
    expect(plan.planned_files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'D:\\Sites\\site-machinery-alpha\\.narada\\admission\\package-slices\\site-inbox.json', mutation: 'descriptor_materialization_only' }),
      expect.objectContaining({ path: 'D:\\Sites\\site-machinery-alpha\\.narada\\admission\\package-slices\\site-config.json', mutation: 'descriptor_materialization_only' }),
      expect.objectContaining({ path: 'D:\\Sites\\site-machinery-alpha\\.narada\\admission\\package-slices\\site-lift.json', mutation: 'descriptor_materialization_only' }),
    ]));
    expect(plan.evidence.source_state_imported).toBe(false);
    expect(plan.evidence.package_selection_grants_live_capability).toBe(false);
  });

  it('keeps the full operator-surface-aware preset fixture-only until live surfaces are admitted', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-user-surface-aware.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toContain('preset_requires_unadmitted_operator_surface');
  });

  it('refuses source Site state, live admissions, secrets, and PC-locus runtime inputs', async () => {
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-refusal-runtime-state-import.json'),
      dryRun: true,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toEqual(expect.arrayContaining([
      'source_runtime_state_import_refused',
      'raw_secret_in_config_refused',
      'pc_locus_authority_missing',
      'package_selection_does_not_grant_live_capability',
      'live_adapter_admission_missing',
      'live_mcp_registration_admission_missing',
      'runtime_hydration_admission_missing',
      'live_profile_write_admission_missing',
    ]));
  });

  it('preserves named-agent identity and role compatibility as separate admitted concepts', async () => {
    const dir = tempDir();
    const configPath = join(dir, 'identity-refusal.json');
    writeFileSync(configPath, JSON.stringify({
      schema: 'narada.create_site.options.v0',
      mode: 'dry_run',
      preset: 'minimal',
      site: {
        site_id: 'identity-test',
        site_kind: 'project',
        authority_locus: 'project',
        site_root: 'D:\\Sites\\identity-test',
      },
      packages: [],
      identity: {
        named_agents: [{ named_agent_id: 'identity-test.agent.kevin' }],
        role_compatibility_identities: [{ role_name: 'architect', compatibility_identity: 'identity-test.architect' }],
        claimed_identity_evidence: [{ claimed_identity: 'identity-test.agent.kevin', authority: true }],
        mechanical_verification_basis: [],
      },
      storage: { intent: 'none' },
      mcp: { intent: 'none' },
      capabilities: { policy: 'none' },
    }, null, 2));

    const result = await sitesCreateCommand({ config: configPath, dryRun: true, format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toEqual(expect.arrayContaining([
      'mechanical_verification_basis_missing',
      'role_compatibility_admission_missing',
      'claimed_identity_not_authority',
    ]));
  });

  it('writes only an explicit dry-run output plan artifact when requested', async () => {
    const dir = tempDir();
    const outputPlan = join(dir, 'plan.json');
    const result = await sitesCreateCommand({
      config: fixturePath('create-site-minimal.json'),
      dryRun: true,
      outputPlan,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(existsSync(outputPlan)).toBe(true);
    const written = JSON.parse(readFileSync(outputPlan, 'utf8')) as {
      evidence: { output_plan_path: string };
      planned_files: Array<{ path: string; mutation: string }>;
    };
    expect(written.evidence.output_plan_path).toBe(outputPlan);
    expect(written.planned_files).toContainEqual(expect.objectContaining({
      path: outputPlan,
      mutation: 'output_plan_only',
    }));
  });

  it('creates a minimal greenfield Site skeleton when dry-run is omitted', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'site-alpha');
    const configPath = join(dir, 'create-site.json');
    writeFileSync(configPath, JSON.stringify({
      schema: 'narada.create_site.options.v0',
      mode: 'execute',
      preset: 'minimal',
      template_catalog: {
        template_id: 'narada-proper.templates.site.minimal.v0',
        template_components: [],
      },
      site: {
        site_id: 'site-alpha',
        site_kind: 'project',
        authority_locus: 'project',
        site_root: siteRoot,
        workspace_root: siteRoot,
        substrate: 'windows-native',
        execution_surface: 'windows_native',
      },
      packages: [],
      identity: {
        named_agents: [],
        role_assignments: [],
        role_compatibility_identities: [],
        claimed_identity_evidence: [],
        mechanical_verification_basis: [],
      },
      storage: { intent: 'none' },
      mcp: { intent: 'none', surfaces: [] },
      capabilities: { policy: 'none', required: [], denied: [] },
      inbox: { enable: 'drop_only' },
      task_lifecycle: { enable: false },
      agent_context: { enable: false },
      operator_surface: { intent: 'none' },
      windows_pwsh: { profile: 'emit_example', path_style: 'windows' },
      evidence: { template_refs: ['narada-proper.templates.site.minimal.v0'] },
    }, null, 2));

    const result = await sitesCreateCommand({ config: configPath, format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      schema: string;
      status: string;
      created_files: Array<{ path: string }>;
      evidence: { source_state_imported: boolean; filesystem_creation_completed: boolean };
      non_claims: string[];
    };
    expect(output.schema).toBe('narada.create_site.execution_result.v0');
    expect(output.status).toBe('created');
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.evidence.filesystem_creation_completed).toBe(true);
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, 'config.json'),
      join(siteRoot, 'AGENTS.md'),
      join(siteRoot, '.narada', 'site.json'),
      join(siteRoot, '.narada', 'admission', 'admission-ledger.jsonl'),
      join(siteRoot, '.narada', 'inbox', 'README.md'),
    ]));
    expect(JSON.parse(readFileSync(join(siteRoot, '.narada', 'site.json'), 'utf8'))).toMatchObject({
      schema: 'narada.site.seed.v0',
      site_id: 'site-alpha',
      admission_state: {
        runtime_state_imported: false,
        package_selection_grants_live_capability: false,
      },
    });
    expect(readFileSync(join(siteRoot, '.narada', 'admission', 'admission-ledger.jsonl'), 'utf8')).toContain('"event":"seed_created"');
    expect(output.non_claims).toContain('DB init execution');
    expect(output.non_claims).toContain('MCP registration execution');
  });

  it('refuses minimal Site creation when the target root is non-empty', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'site-collision');
    const configPath = join(dir, 'create-site.json');
    writeFileSync(configPath, JSON.stringify({
      schema: 'narada.create_site.options.v0',
      mode: 'execute',
      preset: 'minimal',
      site: {
        site_id: 'site-collision',
        site_kind: 'project',
        authority_locus: 'project',
        site_root: siteRoot,
      },
      packages: [],
      identity: {
        named_agents: [],
        role_assignments: [],
        role_compatibility_identities: [],
        claimed_identity_evidence: [],
        mechanical_verification_basis: [],
      },
      storage: { intent: 'none' },
      mcp: { intent: 'none' },
      capabilities: { policy: 'none' },
      task_lifecycle: { enable: false },
      agent_context: { enable: false },
      operator_surface: { intent: 'none' },
      windows_pwsh: { profile: 'emit_example' },
    }, null, 2));
    mkdirSync(siteRoot);
    writeFileSync(join(siteRoot, 'existing.txt'), 'already here', { flag: 'w' });

    const result = await sitesCreateCommand({ config: configPath, format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toContain('create_site_collision_refused');
  });

  it('materializes package-slice descriptors without live task-lifecycle execution', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'task-site');
    const sourceConfig = JSON.parse(readFileSync(fixturePath('create-site-task-lifecycle.json'), 'utf8')) as Record<string, any>;
    sourceConfig.site.site_root = siteRoot;
    sourceConfig.site.workspace_root = siteRoot;
    const configPath = join(dir, 'create-site-task-lifecycle.json');
    writeFileSync(configPath, JSON.stringify(sourceConfig, null, 2));

    const result = await sitesCreateCommand({
      config: configPath,
      format: 'json',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      created_files: Array<{ path: string }>;
      non_claims: string[];
    };
    expect(output.status).toBe('created');
    expect(output.created_files.map((file) => file.path)).toEqual(expect.arrayContaining([
      join(siteRoot, '.narada', 'admission', 'package-slices', 'site-task-lifecycle.json'),
      join(siteRoot, '.narada', 'mcp', 'descriptors', 'site_task_lifecycle.json'),
      join(siteRoot, '.narada', 'capabilities', 'capability-policy.json'),
    ]));
    const packageSlice = JSON.parse(readFileSync(join(siteRoot, '.narada', 'admission', 'package-slices', 'site-task-lifecycle.json'), 'utf8')) as {
      live_execution_admitted: boolean;
      source_state_imported: boolean;
    };
    expect(packageSlice.live_execution_admitted).toBe(false);
    expect(packageSlice.source_state_imported).toBe(false);
    expect(existsSync(join(siteRoot, '.ai', 'site-task-lifecycle-admission.json'))).toBe(false);
    expect(output.non_claims).toContain('DB init execution');
    expect(output.non_claims).toContain('package slice live execution');
  });

  it('refuses package names outside the Narada proper create-site template catalog', async () => {
    const dir = tempDir();
    const configPath = join(dir, 'unknown-package.json');
    writeFileSync(configPath, JSON.stringify({
      schema: 'narada.create_site.options.v0',
      mode: 'dry_run',
      preset: 'minimal',
      site: {
        site_id: 'unknown-package',
        site_kind: 'project',
        authority_locus: 'project',
        site_root: 'D:\\Sites\\unknown-package',
      },
      packages: [{ name: '@narada2/not-a-template-component' }],
      identity: {
        named_agents: [],
        role_assignments: [],
        role_compatibility_identities: [],
        claimed_identity_evidence: [],
        mechanical_verification_basis: [],
      },
      storage: { intent: 'none' },
      mcp: { intent: 'none' },
      capabilities: { policy: 'none' },
    }, null, 2));

    const result = await sitesCreateCommand({ config: configPath, dryRun: true, format: 'json' }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.INVALID_CONFIG);
    expect(refusalCodes(result.result)).toContain('unknown_package_refused');
  });

  it('runs greenfield live carriers through the Narada sites CLI surface', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'live-site');
    const configPath = join(dir, 'create-site.json');
    writeFileSync(configPath, JSON.stringify({
      schema: 'narada.create_site.options.v0',
      mode: 'execute',
      preset: 'minimal',
      site: {
        site_id: 'live-site',
        site_kind: 'project',
        authority_locus: 'project',
        site_root: siteRoot,
      },
      packages: [],
      identity: {
        named_agents: [],
        role_assignments: [],
        role_compatibility_identities: [],
        claimed_identity_evidence: [],
        mechanical_verification_basis: [],
      },
      storage: { intent: 'none' },
      mcp: { intent: 'none' },
      capabilities: { policy: 'none' },
      task_lifecycle: { enable: false },
      agent_context: { enable: false },
      operator_surface: { intent: 'none' },
      windows_pwsh: { profile: 'emit_example' },
    }, null, 2));

    const seed = await sitesCreateCommand({ config: configPath, format: 'json' }, createMockContext());
    expect(seed.exitCode).toBe(ExitCode.SUCCESS);

    const db = await sitesLiveCarrierCommand({
      carrier: 'site_local_db_init',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId: 'live-site',
      authorityBasis: 'test_receiving_site_authority',
      mutationAuthorized: true,
    }, createMockContext());
    expect(db.exitCode).toBe(ExitCode.SUCCESS);

    const storage = await sitesLiveCarrierCommand({
      carrier: 'site_local_storage_hydration',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId: 'live-site',
      authorityBasis: 'test_receiving_site_authority',
      dbInitVerified: true,
      mutationAuthorized: true,
    }, createMockContext());
    expect(storage.exitCode).toBe(ExitCode.SUCCESS);

    const mcp = await sitesLiveCarrierCommand({
      carrier: 'site_mcp_registration_transport',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId: 'live-site',
      authorityBasis: 'test_runtime_carrier_authority',
      dbVerified: true,
      storageVerified: true,
      runtimeTarget: 'codex',
      mcpServerJson: JSON.stringify([{
        name: 'site-task-lifecycle',
        transport: 'stdio',
        command: 'node',
        args: ['server.mjs'],
        entrypoint: join(siteRoot, 'server.mjs'),
      }]),
      mutationAuthorized: true,
    }, createMockContext());
    expect(mcp.exitCode).toBe(ExitCode.SUCCESS);

    const profile = await sitesLiveCarrierCommand({
      carrier: 'windows_profile_site_binding',
      mode: 'apply',
      targetSiteRoot: siteRoot,
      siteId: 'live-site',
      authorityBasis: 'test_windows_profile_authority',
      mcpRegistrationVerified: true,
      mutationAuthorized: true,
    }, createMockContext());
    expect(profile.exitCode).toBe(ExitCode.SUCCESS);

    expect(existsSync(join(siteRoot, '.narada/state/local-db/site-local-db.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/hydration/hydration-manifest.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/capabilities/mcp-registration.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/profile/windows-profile-binding.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });

  it('can create an agent Site core and run admitted useful baseline live carriers from shorthand flags', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'agent-core-live-site');

    const result = await sitesCreateCommand({
      preset: 'agent-site-core',
      siteId: 'agent-core-live-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
      executeLive: true,
      liveAuthorityBasis: 'test_agent_site_core_live_authority',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      live_carriers: Array<{ carrier_id: string; status: string }>;
      evidence: { live_carrier_execution_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created_live_carriers_applied');
    expect(output.live_carriers.map((carrier) => carrier.carrier_id)).toEqual([
      'site_local_db_init',
      'site_local_storage_hydration',
      'agent_context_memory_local_storage',
      'site_inbox_local_substrate',
      'site_mcp_registration_transport',
      'windows_profile_site_binding',
    ]);
    expect(output.live_carriers.every((carrier) => carrier.status === 'applied')).toBe(true);
    expect(output.evidence.live_carrier_execution_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(existsSync(join(siteRoot, '.narada/agent-context-memory/memory-store.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/inbox/index.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/capabilities/mcp-registration.json'))).toBe(true);
    expect(output.non_claims).toContain('private MCP client config mutation');
    expect(output.non_claims).toContain('real Windows profile mutation outside the target Site');
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });

  it('can create a task-lifecycle Site and run admitted live carriers from create config', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'task-live-site');
    const sourceConfig = JSON.parse(readFileSync(fixturePath('create-site-task-lifecycle.json'), 'utf8')) as Record<string, any>;
    sourceConfig.site.site_id = 'task-live-site';
    sourceConfig.site.site_root = siteRoot;
    sourceConfig.site.workspace_root = siteRoot;
    sourceConfig.mode = 'execute';
    const configPath = join(dir, 'create-site-task-lifecycle-live.json');
    writeFileSync(configPath, JSON.stringify(sourceConfig, null, 2));

    const result = await sitesCreateCommand({
      config: configPath,
      format: 'json',
      executeLive: true,
      liveAuthorityBasis: 'test_receiving_site_live_authority',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      live_carriers: Array<{ carrier_id: string; status: string }>;
      evidence: { live_carrier_execution_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created_live_carriers_applied');
    expect(output.live_carriers.map((carrier) => carrier.carrier_id)).toEqual([
      'site_local_db_init',
      'site_local_storage_hydration',
      'site_mcp_registration_transport',
      'windows_profile_site_binding',
    ]);
    expect(output.live_carriers.every((carrier) => carrier.status === 'applied')).toBe(true);
    expect(output.evidence.live_carrier_execution_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.non_claims).toContain('private MCP client config mutation');
    expect(output.non_claims).toContain('real Windows profile mutation outside the target Site');
    expect(existsSync(join(siteRoot, '.narada/state/local-db/site-local-db.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/hydration/hydration-manifest.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/capabilities/mcp-registration.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/profile/windows-profile-binding.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });

  it('can create a task-lifecycle Site and run admitted live carriers from shorthand flags', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'task-live-shorthand-site');

    const result = await sitesCreateCommand({
      preset: 'task-lifecycle',
      siteId: 'task-live-shorthand-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
      executeLive: true,
      liveAuthorityBasis: 'test_receiving_site_live_authority',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      live_carriers: Array<{ carrier_id: string; status: string }>;
      evidence: { live_carrier_execution_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created_live_carriers_applied');
    expect(output.live_carriers.map((carrier) => carrier.carrier_id)).toEqual([
      'site_local_db_init',
      'site_local_storage_hydration',
      'site_mcp_registration_transport',
      'windows_profile_site_binding',
    ]);
    expect(output.live_carriers.every((carrier) => carrier.status === 'applied')).toBe(true);
    expect(output.evidence.live_carrier_execution_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(output.non_claims).toContain('private MCP client config mutation');
    expect(output.non_claims).toContain('real Windows profile mutation outside the target Site');
    expect(existsSync(join(siteRoot, '.narada/state/local-db/site-local-db.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/hydration/hydration-manifest.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/capabilities/mcp-registration.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/profile/windows-profile-binding.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });

  it('can create an agent-memory Site and run admitted local memory carriers from shorthand flags', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'agent-memory-live-site');

    const result = await sitesCreateCommand({
      preset: 'agent-memory',
      siteId: 'agent-memory-live-site',
      root: siteRoot,
      siteKind: 'user',
      authorityLocus: 'user',
      format: 'json',
      executeLive: true,
      liveAuthorityBasis: 'test_agent_memory_live_authority',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      live_carriers: Array<{ carrier_id: string; status: string }>;
      evidence: { live_carrier_execution_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created_live_carriers_applied');
    expect(output.live_carriers.map((carrier) => carrier.carrier_id)).toEqual([
      'site_local_db_init',
      'site_local_storage_hydration',
      'agent_context_memory_local_storage',
      'site_mcp_registration_transport',
      'windows_profile_site_binding',
    ]);
    expect(output.live_carriers.every((carrier) => carrier.status === 'applied')).toBe(true);
    expect(output.evidence.live_carrier_execution_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(existsSync(join(siteRoot, '.narada/agent-context-memory/memory-store.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/agent-context-memory/hydration-policy.json'))).toBe(true);
    const store = JSON.parse(readFileSync(join(siteRoot, '.narada/agent-context-memory/memory-store.json'), 'utf8')) as {
      package_owns_sqlite_dependency: boolean;
      source_state_imported: boolean;
      checkpoints: unknown[];
    };
    expect(store.package_owns_sqlite_dependency).toBe(false);
    expect(store.source_state_imported).toBe(false);
    expect(store.checkpoints).toEqual([]);
    const policy = JSON.parse(readFileSync(join(siteRoot, '.narada/agent-context-memory/hydration-policy.json'), 'utf8')) as {
      runtime_hydration_executed: boolean;
      checkpoint_history_imported: boolean;
      secrets_imported: boolean;
    };
    expect(policy.runtime_hydration_executed).toBe(false);
    expect(policy.checkpoint_history_imported).toBe(false);
    expect(policy.secrets_imported).toBe(false);
    expect(output.non_claims).toContain('private MCP client config mutation');
    expect(output.non_claims).toContain('real Windows profile mutation outside the target Site');
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });

  it('can create a site-machinery Site and run admitted local inbox carrier from shorthand flags', async () => {
    const dir = tempDir();
    const siteRoot = join(dir, 'site-machinery-live-site');

    const result = await sitesCreateCommand({
      preset: 'site-machinery',
      siteId: 'site-machinery-live-site',
      root: siteRoot,
      siteKind: 'project',
      authorityLocus: 'project',
      format: 'json',
      executeLive: true,
      liveAuthorityBasis: 'test_site_machinery_live_authority',
    }, createMockContext());

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    const output = result.result as {
      status: string;
      live_carriers: Array<{ carrier_id: string; status: string }>;
      evidence: { live_carrier_execution_completed: boolean; source_state_imported: boolean };
      non_claims: string[];
    };
    expect(output.status).toBe('created_live_carriers_applied');
    expect(output.live_carriers.map((carrier) => carrier.carrier_id)).toEqual([
      'site_local_db_init',
      'site_local_storage_hydration',
      'site_inbox_local_substrate',
      'site_config_local_registry',
      'site_lift_local_adoption',
      'windows_profile_site_binding',
    ]);
    expect(output.live_carriers.every((carrier) => carrier.status === 'applied')).toBe(true);
    expect(output.evidence.live_carrier_execution_completed).toBe(true);
    expect(output.evidence.source_state_imported).toBe(false);
    expect(existsSync(join(siteRoot, '.narada/inbox/index.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/inbox/publication-policy.json'))).toBe(true);
    const index = JSON.parse(readFileSync(join(siteRoot, '.narada/inbox/index.json'), 'utf8')) as {
      source_state_imported: boolean;
      envelopes: unknown[];
    };
    expect(index.source_state_imported).toBe(false);
    expect(index.envelopes).toEqual([]);
    const policy = JSON.parse(readFileSync(join(siteRoot, '.narada/inbox/publication-policy.json'), 'utf8')) as {
      publication_executed: boolean;
      source_inbox_history_imported: boolean;
    };
    expect(policy.publication_executed).toBe(false);
    expect(policy.source_inbox_history_imported).toBe(false);
    expect(existsSync(join(siteRoot, '.narada/site-config/known-sites.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/site-config/probe-policy.json'))).toBe(true);
    const registry = JSON.parse(readFileSync(join(siteRoot, '.narada/site-config/known-sites.json'), 'utf8')) as {
      source_state_imported: boolean;
      known_sites: unknown[];
    };
    expect(registry.source_state_imported).toBe(false);
    expect(registry.known_sites).toEqual([]);
    const probePolicy = JSON.parse(readFileSync(join(siteRoot, '.narada/site-config/probe-policy.json'), 'utf8')) as {
      external_probe_executed: boolean;
      arbitrary_scan_admitted: boolean;
      target_site_mutation_admitted: boolean;
    };
    expect(probePolicy.external_probe_executed).toBe(false);
    expect(probePolicy.arbitrary_scan_admitted).toBe(false);
    expect(probePolicy.target_site_mutation_admitted).toBe(false);
    expect(existsSync(join(siteRoot, '.narada/site-lift/adoption-catalog.json'))).toBe(true);
    expect(existsSync(join(siteRoot, '.narada/site-lift/materialization-policy.json'))).toBe(true);
    const catalog = JSON.parse(readFileSync(join(siteRoot, '.narada/site-lift/adoption-catalog.json'), 'utf8')) as {
      source_state_imported: boolean;
      adoption_candidates: unknown[];
    };
    expect(catalog.source_state_imported).toBe(false);
    expect(catalog.adoption_candidates).toEqual([]);
    const liftPolicy = JSON.parse(readFileSync(join(siteRoot, '.narada/site-lift/materialization-policy.json'), 'utf8')) as {
      files_copied: boolean;
      packages_installed: boolean;
      source_runtime_imported: boolean;
    };
    expect(liftPolicy.files_copied).toBe(false);
    expect(liftPolicy.packages_installed).toBe(false);
    expect(liftPolicy.source_runtime_imported).toBe(false);
    expect(output.non_claims).toContain('real Windows profile mutation outside the target Site');
    expect(existsSync(join(siteRoot, '.ai'))).toBe(false);
  });
});
