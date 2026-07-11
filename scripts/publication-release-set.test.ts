import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changesetPackageNames,
  validatePublicationReleaseSet,
} from './publication-release-set.js';

test('extracts package names from standard changeset frontmatter', () => {
  assert.deepEqual(
    changesetPackageNames('---\n"@narada2/cli": minor\n@narada2/ui: patch\n---\nBody\n', 'valid.md'),
    ['@narada2/cli', '@narada2/ui'],
  );
});

test('admits only packages in the canonical publication set', () => {
  const requested = validatePublicationReleaseSet(
    [{ name: 'valid.md', source: '---\n"@narada2/ui": patch\n---\n' }],
    new Set(['@narada2/ui']),
  );
  assert.deepEqual(requested, ['@narada2/ui']);
});

test('rejects unlisted and malformed changeset entries', () => {
  assert.throws(
    () => validatePublicationReleaseSet(
      [{ name: 'unlisted.md', source: '---\n"@narada2/internal": patch\n---\n' }],
      new Set(['@narada2/ui']),
    ),
    /publication_release_set_not_canonical: @narada2\/internal/,
  );
  assert.throws(
    () => changesetPackageNames('---\nnot a release entry\n---\n', 'malformed.md'),
    /changeset_frontmatter_entry_invalid/,
  );
});
