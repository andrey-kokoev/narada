import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveNaradaSitePaths } from '@narada2/site-paths';
import {
  NARS_ARTIFACT_INDEX_SCHEMA,
  NARS_ARTIFACT_PUBLIC_SCHEMA,
  readNarsArtifactContent,
  readNarsArtifactIndex,
  registerNarsArtifact,
} from './nars-artifacts.mjs';

function makeTempSiteRoot() {
  return mkdtempSync(join(tmpdir(), 'nars-artifacts-test-'));
}

function cleanup(path) {
  try { rmSync(path, { recursive: true, force: true }); } catch {}
}

function sessionPath(siteRoot, sessionId = 'carrier_artifact_test') {
  return resolveNaradaSitePaths({ siteRoot, sessionId }).narsSessionPath;
}

test('registerNarsArtifact stores session-scoped public metadata without exposing source path', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const sourcePath = join(siteRoot, 'reports', 'preview.html');
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, '<!doctype html><h1>Preview</h1>', 'utf8');

    const registered = registerNarsArtifact({
      sessionPath: sessionPath(siteRoot),
      sessionId: 'carrier_artifact_test',
      agentId: 'resident',
      siteRoot,
      sourcePath,
      kind: 'html',
      title: 'Preview report',
      now: new Date('2026-06-30T19:00:00.000Z'),
    });

    assert.equal(registered.record.kind, 'html');
    assert.equal(registered.record.source_path, sourcePath);
    assert.equal(registered.public_record.schema, NARS_ARTIFACT_PUBLIC_SCHEMA);
    assert.equal(registered.public_record.title, 'Preview report');
    assert.equal(registered.public_record.source_path, undefined);
    assert.equal(registered.public_record.render.sandbox.allow_top_navigation, false);

    const index = readNarsArtifactIndex({ sessionPath: sessionPath(siteRoot) });
    assert.equal(index.schema, NARS_ARTIFACT_INDEX_SCHEMA);
    assert.equal(index.artifacts.length, 1);
  } finally {
    cleanup(siteRoot);
  }
});

test('registerNarsArtifact refuses HTML content type for non-HTML artifact kinds', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const sourcePath = join(siteRoot, 'reports', 'not-html.txt');
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, '<!doctype html><p>not really text</p>', 'utf8');

    assert.throws(() => registerNarsArtifact({
      sessionPath: sessionPath(siteRoot),
      sessionId: 'carrier_artifact_test',
      agentId: 'resident',
      siteRoot,
      sourcePath,
      kind: 'text',
      contentType: 'text/html; charset=utf-8',
    }), /does not match kind text/);
  } finally {
    cleanup(siteRoot);
  }
});

test('registerNarsArtifact refuses source paths outside admitted site/session roots', () => {
  const siteRoot = makeTempSiteRoot();
  const otherRoot = makeTempSiteRoot();
  try {
    const sourcePath = join(otherRoot, 'outside.html');
    writeFileSync(sourcePath, '<h1>outside</h1>', 'utf8');
    assert.throws(() => registerNarsArtifact({
      sessionPath: sessionPath(siteRoot),
      sessionId: 'carrier_artifact_test',
      agentId: 'resident',
      siteRoot,
      sourcePath,
      kind: 'html',
    }), /outside admitted NARS roots/);
  } finally {
    cleanup(siteRoot);
    cleanup(otherRoot);
  }
});

test('readNarsArtifactContent serves HTML with sandbox content security policy', () => {
  const siteRoot = makeTempSiteRoot();
  try {
    const sourcePath = join(dirname(sessionPath(siteRoot)), 'generated-report.html');
    mkdirSync(dirname(sourcePath), { recursive: true });
    writeFileSync(sourcePath, '<!doctype html><p>session artifact</p>', 'utf8');
    const registered = registerNarsArtifact({
      sessionPath: sessionPath(siteRoot),
      sessionId: 'carrier_artifact_test',
      agentId: 'resident',
      siteRoot,
      sourcePath,
      kind: 'html',
    });

    const served = readNarsArtifactContent({ sessionPath: sessionPath(siteRoot), artifactId: registered.record.artifact_id });
    assert.equal(served.content_type, 'text/html; charset=utf-8');
    assert.match(String(served.content), /session artifact/);
    assert.match(served.headers['content-security-policy'], /sandbox/);
    assert.equal(served.headers['x-narada-artifact-id'], registered.record.artifact_id);
  } finally {
    cleanup(siteRoot);
  }
});
