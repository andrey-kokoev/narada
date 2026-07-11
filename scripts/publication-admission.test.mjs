import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertPublicationAdmission } from './assert-publication-admission.js';

test('requires a live package-scoped publication grant', () => {
  const root = mkdtempSync(join(tmpdir(), 'narada-publication-admission-'));
  const path = join(root, 'admission.json');
  writeFileSync(path, JSON.stringify({
    schema: 'narada.npm_publication_admission.v1',
    token: 'test-token',
    expires_at_ms: 2000,
    packages: ['@narada2/ui'],
  }));

  try {
    const admitted = assertPublicationAdmission({
      NARADA_PUBLICATION_ADMISSION_FILE: path,
      NARADA_PUBLICATION_ADMISSION_TOKEN: 'test-token',
      npm_package_name: '@narada2/ui',
    }, 1000);
    assert.equal(admitted.packageName, '@narada2/ui');

    assert.throws(() => assertPublicationAdmission({}, 1000), /admission_missing/);
    assert.throws(() => assertPublicationAdmission({
      NARADA_PUBLICATION_ADMISSION_FILE: path,
      NARADA_PUBLICATION_ADMISSION_TOKEN: 'wrong-token',
      npm_package_name: '@narada2/ui',
    }, 1000), /token_invalid/);
    assert.throws(() => assertPublicationAdmission({
      NARADA_PUBLICATION_ADMISSION_FILE: path,
      NARADA_PUBLICATION_ADMISSION_TOKEN: 'test-token',
      npm_package_name: '@narada2/cli',
    }, 1000), /package_not_admitted/);
    assert.throws(() => assertPublicationAdmission({
      NARADA_PUBLICATION_ADMISSION_FILE: path,
      NARADA_PUBLICATION_ADMISSION_TOKEN: 'test-token',
      npm_package_name: '@narada2/ui',
    }, 3000), /admission_expired/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
