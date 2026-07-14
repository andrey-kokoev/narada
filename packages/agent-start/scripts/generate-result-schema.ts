import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AgentStartResultV0Schema } from '../src/launch-result-v0-contract.mts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.resolve(__dirname, '..', 'src', 'launch-result-v0-contract.mts');
const sourceDirectory = path.dirname(sourcePath);
const runtimePath = path.resolve(sourceDirectory, 'launch-result-v0-contract.mjs');
const declarationPath = path.resolve(sourceDirectory, 'launch-result-v0-contract.d.mts');
const schemaPath = path.resolve(__dirname, '..', 'contracts', 'agent-start.result.v0.schema.json');
const checkOnly = process.argv.includes('--check');

const generatedHeader = '// GENERATED FILE - DO NOT EDIT. Run pnpm generate:result-schema.\n';

function emitContractArtifacts(): { runtime: string; declaration: string } {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'narada-agent-start-contract-'));
  try {
    const program = ts.createProgram([sourcePath], {
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: false,
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
        diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n'),
        '\n',
      );
      throw new Error(`result_contract_generation_failed: ${detail}`);
    }
    const emittedRuntimePath = path.join(temporaryDirectory, 'launch-result-v0-contract.mjs');
    const emittedDeclarationPath = path.join(temporaryDirectory, 'launch-result-v0-contract.d.mts');
    return {
      runtime: generatedHeader + fs.readFileSync(emittedRuntimePath, 'utf8'),
      declaration: generatedHeader + fs.readFileSync(emittedDeclarationPath, 'utf8'),
    };
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
  description: 'Generated from packages/agent-start/src/launch-result-v0-contract.mts',
  ...generated,
};

const contractArtifacts = emitContractArtifacts();
const artifacts = {
  [runtimePath]: contractArtifacts.runtime,
  [declarationPath]: contractArtifacts.declaration,
  [schemaPath]: `${JSON.stringify(schema, null, 2)}\n`,
};

const mismatches = Object.entries(artifacts)
  .filter(([filePath, content]) => !fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== content)
  .map(([filePath]) => filePath);

if (checkOnly) {
  if (mismatches.length > 0) {
    console.error(`result_contract_artifacts_drifted:\n${mismatches.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('result contract artifacts are up to date');
  }
} else {
  for (const [filePath, content] of Object.entries(artifacts)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  console.log(`generated ${Object.keys(artifacts).length} result contract artifacts`);
}
