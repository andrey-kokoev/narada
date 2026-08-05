import assert from 'node:assert/strict';
import test from 'node:test';
import {
  guardImplementationFiles,
  scanProcessLaunchEntries,
} from './process-launch-posture-guard.ts';

test('ignores the guard implementation and its regression test', () => {
  const findings = scanProcessLaunchEntries([...guardImplementationFiles].map((file) => ({
    file,
    content: "spawn('scanner-fixture')\nStart-Process scanner-fixture\n",
  })));

  assert.deepEqual(findings, []);
});

test('ignores declaration-shaped matches but retains process launch calls', () => {
  const findings = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: [
      'function spawn(command: string): void {}',
      'spawnSync(command: string): Result { return fakeResult; }',
      'exec(sql: string): void;',
      'const child = spawn(command, args);',
      'const result = execFileSync(command, args);',
    ].join('\n'),
  }]);

  assert.deepEqual(findings.map(({ api }: any) => api).sort(), [
    'child_process.execFileSync',
    'child_process.spawn',
  ]);
});

test('keeps finding identity stable across unrelated surrounding edits', () => {
  const before = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "const before = true;\nconst child = spawn(command, args);\nconst after = true;\n",
  }]);
  const after = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "const inserted = true;\nconst before = false;\nconst child = spawn(command, args);\nconst after = false;\n",
  }]);

  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before[0].id);
  assert.notEqual(after[0].line, before[0].line);
});

test('assigns deterministic unique identities to duplicate launch statements', () => {
  const content = "spawn(command, args);\nconst unrelated = true;\nspawn(command, args);\n";
  const findings = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content,
  }]);
  const rescanned = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content,
  }]);

  assert.equal(findings.length, 2);
  assert.notEqual(findings[0].id, findings[1].id);
  assert.deepEqual(findings.map(({ id }: any) => id), rescanned.map(({ id }: any) => id));
});

test('changes finding identity when the launch statement changes', () => {
  const before = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "spawn(command, ['before']);\n",
  }]);
  const after = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "spawn(command, ['after']);\n",
  }]);

  assert.notEqual(after[0].id, before[0].id);
});

test('preserves semantically meaningful whitespace inside launch strings', () => {
  const before = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "spawn('word  word');\n",
  }]);
  const after = scanProcessLaunchEntries([{
    file: 'packages/example/src/runtime.ts',
    content: "spawn('word word');\n",
  }]);

  assert.notEqual(after[0].id, before[0].id);
});
