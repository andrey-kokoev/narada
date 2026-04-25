import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createObservationArtifact } from '../../src/lib/observation-artifact.js';
import {
  observationInspectCommand,
  observationListCommand,
  observationOpenCommand,
} from '../../src/commands/observation.js';
import { ExitCode } from '../../src/lib/exit-codes.js';

describe('observation artifact operators', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'narada-observation-test-'));
    mkdirSync(join(tempDir, '.ai'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists, inspects, and opens observation artifacts through sanctioned commands', async () => {
    const created = await createObservationArtifact({
      cwd: tempDir,
      artifactType: 'mermaid',
      sourceOperator: 'task_graph',
      extension: 'mmd',
      content: 'graph TD\n  A-->B\n',
      admittedView: { count: 2 },
    });

    const list = await observationListCommand({ cwd: tempDir, format: 'json' });
    expect(list.exitCode).toBe(ExitCode.SUCCESS);
    expect((list.result as { count: number }).count).toBe(1);

    const inspect = await observationInspectCommand({
      artifactId: created.row.artifact_id,
      cwd: tempDir,
      content: true,
      format: 'json',
    });
    expect(inspect.exitCode).toBe(ExitCode.SUCCESS);
    const inspected = inspect.result as { artifact: { content: string; admitted_view: { count: number } } };
    expect(inspected.artifact.content).toContain('graph TD');
    expect(inspected.artifact.admitted_view.count).toBe(2);

    const opened = await observationOpenCommand({
      artifactId: created.row.artifact_id,
      cwd: tempDir,
      format: 'json',
    });
    expect(opened.exitCode).toBe(ExitCode.SUCCESS);
    expect((opened.result as { open_command: string }).open_command).toContain('xdg-open');
  });
});
