import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AgentStartResultV0Schema } from '../src/launch-result-v0-contract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, '..', 'src', 'launch-result-v0-contract.ts');
const sourceDirectory = path.dirname(sourcePath);
const declarationPath = path.resolve(sourceDirectory, 'launch-result-v0-contract.d.ts');
const schemaPath = path.resolve(__dirname, '..', 'contracts', 'agent-start.result.v0.schema.json');
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

export function generatedTextMatches(actual: string, expected: string): boolean {
  const normalized = (value: string) => value.replace(/\r\n?/gu, '\n');
  return normalized(actual) === normalized(expected);
}

function resultArtifacts() {
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
  return {
    [declarationPath]: emitDeclarationArtifact(),
    [schemaPath]: JSON.stringify(schema, null, 2) + '\n',
  };
}

export function runGenerator({ checkOnly = process.argv.includes('--check') } = {}): number {
  const artifacts = resultArtifacts();
  const mismatches = Object.entries(artifacts)
    .filter(([filePath, content]) => !fs.existsSync(filePath)
      || !generatedTextMatches(fs.readFileSync(filePath, 'utf8'), content))
    .map(([filePath]) => filePath);

  if (checkOnly) {
    if (mismatches.length > 0) {
      console.error('result_contract_artifacts_drifted:\n' + mismatches.join('\n'));
      return 1;
    }
    console.log('result contract artifacts are up to date');
    return 0;
  }

  for (const [filePath, content] of Object.entries(artifacts)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  console.log('generated ' + Object.keys(artifacts).length + ' result contract artifacts');
  return 0;
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isEntrypoint) {
  try {
    process.exitCode = runGenerator();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
