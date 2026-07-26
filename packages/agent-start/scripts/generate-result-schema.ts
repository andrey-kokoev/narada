import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AgentStartResultV0Schema } from '../src/launch-result-v0-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, '..', 'src', 'launch-result-v0-contract.ts');
const sourceDirectory = path.dirname(sourcePath);
const declarationPath = path.resolve(sourceDirectory, 'launch-result-v0-contract.d.ts');
const schemaPath = path.resolve(__dirname, '..', 'contracts', 'agent-start.result.v0.schema.json');
const checkOnly = process.argv.includes('--check');

const generatedHeader = '// GENERATED FILE - DO NOT EDIT. Run pnpm generate:result-schema.\n';

function emitDeclarationArtifact(): string {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'narada-agent-start-contract-'));
  try {
    const program = ts.createProgram([sourcePath], {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      outDir: temporaryDirectory,
      rootDir: sourceDirectory,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    });
    const emitted = program.emit();
    const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitted.diagnostics);
    if (diagnostics.length > 0) {
      const detail = ts.flattenDiagnosticMessageText(
        diagnostics.map((diagnostic: any) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
        '\n',
      );
      throw new Error('result_contract_generation_failed: ' + detail);
    }
    const emittedDeclarationPath = path.join(temporaryDirectory, 'launch-result-v0-contract.d.ts');
    return generatedHeader + fs.readFileSync(emittedDeclarationPath, 'utf8');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const generated = zodToJsonSchema(AgentStartResultV0Schema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
});

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Narada agent-start result v0',
  description: 'Generated from packages/agent-start/src/launch-result-v0-contract.ts',
  ...generated,
};

const artifacts = {
  [declarationPath]: emitDeclarationArtifact(),
  [schemaPath]: JSON.stringify(schema, null, 2) + '\n',
};

const mismatches = Object.entries(artifacts)
  .filter(([filePath, content]: any) => !fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content)
  .map(([filePath]: any) => filePath);

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error('result_contract_artifacts_drifted:\n' + mismatches.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('result contract artifacts are up to date');
  }
} else {
  for (const [filePath, content] of Object.entries(artifacts)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  console.log('generated ' + Object.keys(artifacts).length + ' result contract artifacts');
}
