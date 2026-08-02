import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'src');
const forbidden = new Set(['site_id', 'sites', 'agent_id', 'agents', 'session_id', 'sessions', 'runtime_session_id']);

function files(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? files(child) : extname(entry.name) === '.ts' ? [child] : [];
  });
}

test('runtime source remains host-only and imports only admitted foundations', () => {
  const admitted = new Set(['@narada-core/host-fleet', '@narada-core/sqlite']);
  for (const path of files(src)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && forbidden.has(node.text)) {
        assert.fail(`${path} contains forbidden internal-host identity ${node.text}`);
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        assert.ok(specifier.startsWith('./') || specifier.startsWith('node:') || admitted.has(specifier), `${path} imports ${specifier}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
});

test('runtime production dependencies are exactly the host contract and SQLite', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  assert.deepEqual(manifest.dependencies, {
    '@narada-core/host-fleet': 'workspace:*',
    '@narada-core/sqlite': 'workspace:*',
  });
});
