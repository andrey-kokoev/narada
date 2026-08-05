import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = resolve(packageRoot, 'src');
const forbiddenInternalIdentity = new Set(['site_id', 'sites', 'agent_id', 'agents', 'session_id', 'sessions', 'runtime_session_id']);

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (extname(entry.name) === '.ts') files.push(path);
  }
  return files;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      values.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      values.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

test('Host Fleet source has no internal-host identity vocabulary', () => {
  for (const path of sourceFiles(srcRoot)) {
    const sourceFile = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    const violations: string[] = [];
    const visit = (node: ts.Node): void => {
      if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && forbiddenInternalIdentity.has(node.text)) violations.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    assert.deepEqual(violations, [], path);
  }
});

test('Host Fleet source imports only its own files and node:crypto', () => {
  for (const path of sourceFiles(srcRoot)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const specifier of moduleSpecifiers(source)) {
      assert.ok(
        specifier.startsWith('./') || specifier === 'node:crypto',
        `${path} imports forbidden boundary dependency ${specifier}`,
      );
    }
  }
});

test('Host Fleet has no production package dependencies', () => {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(manifest[field] ?? {}, {}, `${field} must remain empty`);
  }
  const scripts = manifest.scripts as Record<string, unknown>;
  assert.equal(scripts.build, 'bun scripts/build.ts');
  assert.equal(scripts['build:node'], 'node --import tsx scripts/build.ts');
  const buildScript = readFileSync(resolve(packageRoot, 'scripts', 'build.ts'), 'utf8');
  assert.match(buildScript, /rmSync\(resolve\(root, 'dist'\), \{ recursive: true, force: true \}\)/);
});
