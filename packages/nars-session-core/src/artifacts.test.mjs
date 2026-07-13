import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  archiveNarsArtifact,
  expireNarsArtifact,
  readNarsArtifact,
  readNarsArtifactContent,
  readNarsArtifactIndex,
  registerNarsArtifact,
  revokeNarsArtifact,
} from './artifacts.mjs';

test('artifact registry persists revoke, expire, and archive transitions', () => {
  const siteRoot = mkdtempSync(join(tmpdir(), 'nars-artifact-lifecycle-'));
  const sessionPath = join(siteRoot, 'session.jsonl');
  const sourcePath = join(siteRoot, 'report.txt');
  writeFileSync(sourcePath, 'artifact content\n', 'utf8');
  try {
    const revoked = registerNarsArtifact({ sessionPath, sessionId: 'artifact-test', siteRoot, sourcePath, kind: 'text' });
    const revokeResult = revokeNarsArtifact({
      sessionPath,
      artifactId: revoked.record.artifact_id,
      evidence: { reason: 'operator_revoked', requested_by: 'operator' },
      now: new Date('2026-07-13T00:01:00.000Z'),
    });
    assert.equal(revokeResult.changed, true);
    assert.equal(revokeResult.record.lifecycle.state, 'revoked');
    assert.throws(
      () => readNarsArtifactContent({ sessionPath, artifactId: revoked.record.artifact_id }),
      (error) => error.code === 'artifact_not_active' && error.details.lifecycle_state === 'revoked',
    );
    const archived = archiveNarsArtifact({
      sessionPath,
      artifactId: revoked.record.artifact_id,
      evidence: { reason: 'retention_complete' },
      now: new Date('2026-07-13T00:02:00.000Z'),
    });
    assert.equal(archived.record.lifecycle.state, 'archived');
    assert.equal(readNarsArtifact({ sessionPath, artifactId: revoked.record.artifact_id }).lifecycle.state, 'archived');

    const expired = registerNarsArtifact({ sessionPath, sessionId: 'artifact-test', siteRoot, sourcePath, kind: 'text' });
    const expireResult = expireNarsArtifact({
      sessionPath,
      artifactId: expired.record.artifact_id,
      evidence: { reason: 'retention_deadline' },
      now: new Date('2026-07-13T00:03:00.000Z'),
    });
    assert.equal(expireResult.record.lifecycle.state, 'expired');
    assert.equal(readNarsArtifactIndex({ sessionPath }).artifacts.length, 2);
    assert.equal(readNarsArtifactIndex({ sessionPath }).artifacts.find((entry) => entry.artifact_id === expired.record.artifact_id).lifecycle.state, 'expired');
  } finally {
    rmSync(siteRoot, { recursive: true, force: true });
  }
});
