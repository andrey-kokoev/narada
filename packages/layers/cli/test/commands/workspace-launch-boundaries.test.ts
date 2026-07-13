import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

const commandsRoot = resolve(process.cwd(), 'src', 'commands');

describe('workspace launch module boundaries', () => {
  it('has no remaining launcher compatibility module or imports', () => {
    expect(existsSync(resolve(commandsRoot, 'launcher.ts'))).toBe(false);

    const forbiddenImports = readdirSync(commandsRoot)
      .filter((entry) => entry.endsWith('.ts'))
      .flatMap((entry) => {
        const path = resolve(commandsRoot, entry);
        return readFileSync(path, 'utf8')
          .split(/\r?\n/)
          .map((line, index) => line.includes('launcher.js') ? `${entry}:${index + 1}:${line.trim()}` : null)
          .filter((line): line is string => line !== null);
      });

    expect(forbiddenImports).toEqual([]);

    const commandFiles = readdirSync(commandsRoot)
      .filter((entry) => entry.startsWith('workspace-launch-') && entry.endsWith('.ts'))
      .map((entry) => [entry, readFileSync(resolve(commandsRoot, entry), 'utf8')] as const);
    for (const [entry, source] of commandFiles) {
      expect(source, entry).not.toContain('legacy_carrier_compatibility');
      expect(source, entry).not.toContain('legacy_terminal_plan');
    }
  });

  it('keeps the application composition boundary explicit', () => {
    const application = readFileSync(resolve(commandsRoot, 'workspace-launch-application.ts'), 'utf8');
    const command = readFileSync(resolve(commandsRoot, 'workspace-launch-command.ts'), 'utf8');
    const context = readFileSync(resolve(commandsRoot, 'workspace-launch-context.ts'), 'utf8');
    const registry = readFileSync(resolve(commandsRoot, 'workspace-launch-registry.ts'), 'utf8');
    const planBuilder = readFileSync(resolve(commandsRoot, 'workspace-launch-plan-builder.ts'), 'utf8');
    const executor = readFileSync(resolve(commandsRoot, 'workspace-launch-executor.ts'), 'utf8');
    const result = readFileSync(resolve(commandsRoot, 'workspace-launch-result.ts'), 'utf8');
    const selectionAdapters = readFileSync(resolve(commandsRoot, 'workspace-launch-selection-adapters.ts'), 'utf8');

    expect(application).toContain("from './workspace-launch-command.js'");
    expect(application).toContain("from './workspace-launch-context.js'");
    expect(command).toContain('selectionServices: WorkspaceLaunchSelectionServices');
    expect(command).toContain('registryContext: WorkspaceLaunchRegistryContext');
    expect(context).toContain('createWorkspaceLaunchContext');
    expect(registry).toContain('readWorkspaceLaunchRecords');
    expect(registry).not.toContain('buildAgentPlan');
    expect(planBuilder).toContain('buildAgentPlan');
    expect(planBuilder).not.toContain('readWorkspaceLaunchRecords');
    expect(executor).toContain('executeWorkspaceLaunchPlan');
    expect(result).toContain('finalizeWorkspaceLaunchResult');
    expect(selectionAdapters).toContain('resolveInteractiveSelectionOptions');
    expect(command).toContain("from './workspace-launch-executor.js'");
    expect(executor).toContain("from './workspace-launch-result.js'");
    expect(command).not.toContain('startOperatorTerminal');
    expect(command).not.toContain('prompts.');
  });
});
