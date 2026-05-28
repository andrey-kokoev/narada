import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  auditLaunchIdentities,
  buildIdentityProjection,
  identityProjectionPath,
  inferRole,
  writeMissingIdentityProjections,
} from './launch-identity-projection.mjs';

const workspace = mkdtempSync(join(tmpdir(), 'narada-launch-identity-'));
const siteRoot = join(workspace, 'site');
mkdirSync(siteRoot, { recursive: true });
writeFileSync(join(siteRoot, 'narada-site.ps1'), '# launcher\n', 'utf8');
const registryPath = join(workspace, 'agents.psd1');
writeFileSync(registryPath, `@{
  Agents = @(
    @{
      Agent = "site.architect"
      Title = "Site Architect"
      NaradaRoot = "${siteRoot}"
      Launcher = "narada-site.ps1"
      Runtime = "codex"
      EnableNativeShell = $false
    }
    @{
      Agent = "site.builder"
      Title = "Site Builder"
      NaradaRoot = "${siteRoot}"
      Launcher = "narada-site.ps1"
      Runtime = "codex"
      EnableNativeShell = $false
    }
  )
}
`, 'utf8');

assert.equal(inferRole('site.architect'), 'architect');
assert.equal(inferRole('site.Kevin'), 'architect');
assert.equal(inferRole('site.resident'), 'resident');
assert.equal(inferRole('site.builder2'), 'builder');

const before = auditLaunchIdentities(registryPath);
assert.equal(before.status, 'fail');
assert.equal(before.failures[0].code, 'identity_projection_missing_or_invalid');

const projection = buildIdentityProjection(siteRoot, [
  { agent: 'site.architect', title: 'Site Architect', narada_root: siteRoot, runtime: 'codex' },
]);
assert.equal(projection.identities[0].identity_id, 'site.architect');
assert.equal(projection.identities[0].role, 'architect');

const write = writeMissingIdentityProjections(registryPath, { generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(write.status, 'ok');
assert.equal(write.result_count, 1);
assert.equal(existsSync(identityProjectionPath(siteRoot)), true);

const after = auditLaunchIdentities(registryPath);
assert.equal(after.status, 'ok');
assert.deepEqual(after.failures, []);
assert.equal(after.warnings.some((warning) => warning.code === 'identity_projection_is_launch_index_projection'), true);

const projectionPath = identityProjectionPath(siteRoot);
const projected = JSON.parse(readFileSync(projectionPath, 'utf8'));
projected.identities[0].role = 'builder';
writeFileSync(projectionPath, `${JSON.stringify(projected, null, 2)}\n`, 'utf8');
const drift = auditLaunchIdentities(registryPath);
assert.equal(drift.status, 'fail');
assert.equal(drift.failures.some((failure) => failure.code === 'launch_agent_role_mismatch'), true);

rmSync(workspace, { recursive: true, force: true });
console.log('launch-identity-projection tests PASSED.');
