import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { agentInstructionChain, loadRolePrompt } from './runtime-dependencies.mjs';

function removeTempDir(path) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch (error) {
    if (error?.code === 'EBUSY' || error?.code === 'ENOTEMPTY') return;
    throw error;
  }
}

test('agent instruction chain includes ancestor, site, and site-local narada AGENTS files in authority order', () => {
  const root = mkdtempSync(join(tmpdir(), 'carrier-agents-chain-test-'));
  const workspaceRoot = join(root, 'workspace');
  const siteRoot = join(workspaceRoot, 'sites', 'example');
  try {
    mkdirSync(join(siteRoot, '.narada'), { recursive: true });
    writeFileSync(join(root, 'AGENTS.md'), 'root authority\n', 'utf8');
    writeFileSync(join(workspaceRoot, 'AGENTS.md'), 'workspace authority\n', 'utf8');
    writeFileSync(join(siteRoot, 'AGENTS.md'), 'site authority\n', 'utf8');
    writeFileSync(join(siteRoot, '.narada', 'AGENTS.md'), 'site narada authority\n', 'utf8');

    assert.deepEqual(agentInstructionChain(siteRoot), [
      join(root, 'AGENTS.md'),
      join(workspaceRoot, 'AGENTS.md'),
      join(siteRoot, 'AGENTS.md'),
      join(siteRoot, '.narada', 'AGENTS.md'),
    ]);
    assert.deepEqual(agentInstructionChain(join(siteRoot, '.narada')), [
      join(root, 'AGENTS.md'),
      join(workspaceRoot, 'AGENTS.md'),
      join(siteRoot, 'AGENTS.md'),
      join(siteRoot, '.narada', 'AGENTS.md'),
    ]);
  } finally {
    removeTempDir(root);
  }
});

test('loadRolePrompt concatenates AGENTS authority content in chain order', () => {
  const root = mkdtempSync(join(tmpdir(), 'carrier-agents-prompt-test-'));
  const workspaceRoot = join(root, 'workspace');
  const siteRoot = join(workspaceRoot, 'site');
  try {
    mkdirSync(join(siteRoot, '.narada'), { recursive: true });
    writeFileSync(join(root, 'AGENTS.md'), 'root authority marker\n', 'utf8');
    writeFileSync(join(workspaceRoot, 'AGENTS.md'), 'workspace authority marker\n', 'utf8');
    writeFileSync(join(siteRoot, 'AGENTS.md'), 'site authority marker\n', 'utf8');
    writeFileSync(join(siteRoot, '.narada', 'AGENTS.md'), 'site-local narada authority marker\n', 'utf8');

    const prompt = loadRolePrompt('agent.test', siteRoot);
    assert.match(prompt, /root authority marker/);
    assert.match(prompt, /workspace authority marker/);
    assert.match(prompt, /site authority marker/);
    assert.match(prompt, /site-local narada authority marker/);
    assert.equal(prompt.indexOf('root authority marker') < prompt.indexOf('workspace authority marker'), true);
    assert.equal(prompt.indexOf('workspace authority marker') < prompt.indexOf('site authority marker'), true);
    assert.equal(prompt.indexOf('site authority marker') < prompt.indexOf('site-local narada authority marker'), true);
  } finally {
    removeTempDir(root);
  }
});
