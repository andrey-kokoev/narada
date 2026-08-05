import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require: any = createRequire(import.meta.url);
const tsxLoader: any = pathToFileURL(require.resolve('tsx')).href;

export const isBunTestRuntime: any = Boolean((process.versions as any).bun);

export function agentStartScriptArgs(scriptPath: any, ...args: any[]): any[] {
  return isBunTestRuntime
    ? [scriptPath, ...args]
    : ['--import', tsxLoader, scriptPath, ...args];
}

export function agentStartTestArgs(testPath: any, testNamePattern: any = null): any[] {
  if (isBunTestRuntime) {
    return [
      'test',
      ...(testNamePattern ? ['--test-name-pattern', testNamePattern] : []),
      testPath,
    ];
  }
  return [
    '--import',
    tsxLoader,
    '--test',
    ...(testNamePattern ? ['--test-name-pattern', testNamePattern] : []),
    testPath,
  ];
}
