import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agentIdentityRefMatchesRequest, buildAgentIdentityRef, renderOperatorObjectSummary, renderOperatorValue } from './index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(__dirname);
const repoRoot = join(packageRoot, '..', '..');

test('derives identity ref from prefixed agent id', () => {
  assert.deepEqual(buildAgentIdentityRef('smart-scheduling.resident', 'resident'), {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'smart-scheduling',
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'smart-scheduling.resident',
    display: 'smart-scheduling.resident',
    source_agent_id: 'smart-scheduling.resident',
    scope: 'site_scoped',
  });
});

test('derives identity ref from site-local agent id and explicit site', () => {
  assert.deepEqual(buildAgentIdentityRef('resident', 'resident', 'sonar'), {
    schema: 'narada.agent_identity_ref.v1',
    site_id: 'sonar',
    local_agent_id: 'resident',
    role: 'resident',
    canonical_agent_id: 'sonar.resident',
    display: 'sonar.resident',
    source_agent_id: 'resident',
    scope: 'site_scoped',
  });
});

test('preserves configured site segment in canonical display identity', () => {
  assert.equal(buildAgentIdentityRef('resident', 'resident', 'narada-sonar').canonical_agent_id, 'narada-sonar.resident');
  assert.equal(buildAgentIdentityRef('narada-andrey.Kevin', 'Kevin').canonical_agent_id, 'narada-andrey.Kevin');
  assert.equal(buildAgentIdentityRef('narada-sonar.resident', 'resident').canonical_agent_id, 'narada-sonar.resident');
  assert.equal(buildAgentIdentityRef('sonar.resident', 'resident', 'narada-sonar').canonical_agent_id, 'sonar.resident');
  assert.equal(buildAgentIdentityRef('narada-sonar.resident', 'resident', 'sonar').canonical_agent_id, 'narada-sonar.resident');
  assert.equal(buildAgentIdentityRef('narada-test.resident', 'resident', 'narada-test').canonical_agent_id, 'narada-test.resident');
});

test('matches exact, canonical, and scoped local requests', () => {
  const ref = buildAgentIdentityRef('resident', 'resident', 'sonar');
  assert.equal(agentIdentityRefMatchesRequest(ref, 'resident'), true);
  assert.equal(agentIdentityRefMatchesRequest(ref, 'sonar.resident'), true);
  assert.equal(agentIdentityRefMatchesRequest(ref, 'smart-scheduling.resident'), false);
});

test('agent identity display has one source implementation', () => {
  const definitionPattern = new RegExp(`(?:function|const|let|var)\\s+${'agentIdentityDisplay'}\\b`);
  const allowedImplementations = new Set([
    normalizePath(join(repoRoot, 'packages', 'agent-identity', 'src', 'index.mjs')),
    normalizePath(join(repoRoot, 'packages', 'agent-identity', 'src', 'index.d.ts')),
  ]);
  const matches = [];
  for (const filePath of sourceFiles(join(repoRoot, 'packages'))) {
    const text = readFileSync(filePath, 'utf8');
    if (!definitionPattern.test(text)) continue;
    const normalized = normalizePath(filePath);
    if (!allowedImplementations.has(normalized)) {
      matches.push(relative(repoRoot, filePath).replaceAll('\\', '/'));
    }
  }

  assert.deepEqual(matches, [], 'agentIdentityDisplay must be implemented only by @narada2/agent-identity');
});

test('operator renderable values avoid object-object leakage', () => {
  assert.match(renderOperatorValue({ status: 'ready', target_ref: 'http://127.0.0.1:4545' }), /status=ready/);
  assert.match(renderOperatorValue({ status: 'ready', target_ref: 'http://127.0.0.1:4545' }), /target_ref=http:\/\/127\.0\.0\.1:4545/);
  assert.match(renderOperatorValue([{ status: 'ready' }, { status: 'queued' }], { mode: 'block' }), /status=ready/);
  assert.match(renderOperatorObjectSummary({ reason_code: 'missing', details: ['a', 'b'] }), /reason_code=missing/);
  assert.doesNotMatch(renderOperatorValue({ foo: { bar: 'baz' } }), /\[object Object\]/);
});

test('operator identity rendering does not hand-roll identity-ref fallback chains', () => {
  const allowedPaths = new Set([
    normalizePath(join(repoRoot, 'packages', 'agent-identity', 'src', 'index.mjs')),
    normalizePath(join(repoRoot, 'packages', 'agent-identity', 'src', 'index.d.ts')),
    normalizePath(join(repoRoot, 'packages', 'agent-identity', 'src', 'index.test.mjs')),
  ]);
  const suspiciousFieldChain = /display[\s\S]{0,240}canonical_agent_id[\s\S]{0,240}source_agent_id[\s\S]{0,240}local_agent_id/u;
  const suspiciousRefRead = /stringField\(ref, ['"]display['"]\)|ref\.(?:display|canonical_agent_id|source_agent_id|local_agent_id)/u;
  const matches = [];

  for (const filePath of sourceFiles(join(repoRoot, 'packages'))) {
    const normalized = normalizePath(filePath);
    if (allowedPaths.has(normalized)) continue;
    const text = readFileSync(filePath, 'utf8');
    if (!suspiciousFieldChain.test(text)) continue;
    if (!suspiciousRefRead.test(text)) continue;
    matches.push(relative(repoRoot, filePath).replaceAll('\\', '/'));
  }

  assert.deepEqual(matches, [], 'identity-ref display fallback chains must use @narada2/agent-identity');
});

function* sourceFiles(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'coverage') continue;
    const filePath = join(root, entry);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      yield* sourceFiles(filePath);
      continue;
    }
    if (/\.(?:mjs|cjs|js|ts|tsx|vue)$/u.test(entry)) yield filePath;
  }
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').toLowerCase();
}
