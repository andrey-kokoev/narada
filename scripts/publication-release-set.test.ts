import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changesetPackageNames,
  publicationAdmissionCommand,
  validatePublicationReleaseSet,
} from './publication-release-set.ts';

test('extracts package names from standard changeset frontmatter', () => {
  assert.deepEqual(
    changesetPackageNames('---\n"@narada-core/cli": minor\n@narada-core/ui: patch\n---\nBody\n', 'valid.md'),
    ['@narada-core/cli', '@narada-core/ui'],
  );
});

test('derives the admission lifecycle command from package depth', () => {
  assert.equal(
    publicationAdmissionCommand('packages/ui'),
    'node --import tsx ../../scripts/assert-publication-admission.ts',
  );
  assert.equal(
    publicationAdmissionCommand('packages/layers/cli'),
    'node --import tsx ../../../scripts/assert-publication-admission.ts',
  );
});

test('admits only packages in the canonical publication set', () => {
  const requested = validatePublicationReleaseSet(
    [{ name: 'valid.md', source: '---\n"@narada-core/ui": patch\n---\n' }],
    new Set(['@narada-core/ui']),
  );
  assert.deepEqual(requested, ['@narada-core/ui']);
});

test('rejects unlisted and malformed changeset entries', () => {
  assert.throws(
    () => validatePublicationReleaseSet(
      [{ name: 'unlisted.md', source: '---\n"@narada-core/internal": patch\n---\n' }],
      new Set(['@narada-core/ui']),
    ),
    /publication_release_set_not_canonical: @narada-core\/internal/,
  );
  assert.throws(
    () => changesetPackageNames('---\nnot a release entry\n---\n', 'malformed.md'),
    /changeset_frontmatter_entry_invalid/,
  );
});
