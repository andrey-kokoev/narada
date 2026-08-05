import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedTextMatches } from '../scripts/generate-result-schema.js';

test('generated artifact comparison is insensitive to platform line endings', () => {
  const expected = 'first\nsecond\n';

  assert.equal(generatedTextMatches('first\r\nsecond\r\n', expected), true);
  assert.equal(generatedTextMatches('first\rsecond\r', expected), true);
  assert.equal(generatedTextMatches('first\nchanged\n', expected), false);
});
