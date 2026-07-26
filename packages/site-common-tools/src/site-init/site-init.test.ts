import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inspectProject, SEED_FILES } from './site-init.js';

test('site init exposes preview and authorized initialization lifecycle evidence', () => {
  const root: any = mkdtempSync(join(tmpdir(), 'narada-site-init-'));
  try {
    const preview: any = inspectProject({ projectRoot: root });
    assert.equal(preview.status, 'previewed');
    assert.equal(preview.lifecycle_state, 'previewed');
    assert.deepEqual(preview.lifecycle_history, ['requested', 'inspecting', 'planned', 'previewed']);
    assert.deepEqual(preview.would_create_files, SEED_FILES);
    assert.equal(existsSync(join(root, '.narada')), false);

    const initialized: any = inspectProject({ projectRoot: root, yes: true });
    assert.equal(initialized.status, 'initialized');
    assert.equal(initialized.lifecycle_state, 'initialized');
    assert.deepEqual(initialized.lifecycle_history, ['requested', 'inspecting', 'planned', 'applying', 'seeded', 'initialized']);
    assert.deepEqual(initialized.created_files, SEED_FILES);
    assert.equal(existsSync(join(root, '.narada', 'site.json')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('site init reports existing project memory without reopening initialization', () => {
  const root: any = mkdtempSync(join(tmpdir(), 'narada-site-init-existing-'));
  try {
    inspectProject({ projectRoot: root, yes: true });
    const result: any = inspectProject({ projectRoot: root });
    assert.equal(result.status, 'already_initialized');
    assert.equal(result.lifecycle_state, 'already_initialized');
    assert.deepEqual(result.lifecycle_history, ['requested', 'inspecting', 'already_initialized']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
