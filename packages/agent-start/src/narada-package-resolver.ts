import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

type NaradaPackageExportTarget = string | Record<string, any>;

type NaradaPackageJson = {
  exports?: NaradaPackageExportTarget;
  bin?: string | Record<string, string>;
};

function resolveConditionalExportTarget(value: NaradaPackageExportTarget | undefined): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  for (const condition of ['import', 'node', 'default', 'require']) {
    const resolved: any = resolveConditionalExportTarget(value[condition]);
    if (resolved) return resolved;
  }
  return null;
}

export type NaradaPackageResolver = {
  packageRoot(packageName: string): string;
  readPackageJson(packageName: string): NaradaPackageJson;
  resolvePackageExport(packageName: string, exportName?: string): string;
  resolvePackageBin(packageName: string, binName: string): string;
};

function naradaPackageDirectoryName(packageName: string): string {
  const parts: any = String(packageName).split('/');
  return parts[parts.length - 1];
}

export function createNaradaPackageResolver({
  naradaProperRoot,
  importerUrl = import.meta.url,
}: {
  naradaProperRoot: string;
  importerUrl?: string;
}): NaradaPackageResolver {
  const require: any = createRequire(importerUrl);

  function packageRoot(packageName: string): string {
    try {
      return dirname(require.resolve(`${packageName}/package.json`));
    } catch {
      const siblingRoot: any = join(dirname(naradaProperRoot), naradaPackageDirectoryName(packageName));
      if (existsSync(join(siblingRoot, 'package.json'))) return siblingRoot;
      return join(naradaProperRoot, 'packages', naradaPackageDirectoryName(packageName));
    }
  }

  function readPackageJson(packageName: string): NaradaPackageJson {
    return JSON.parse(readFileSync(join(packageRoot(packageName), 'package.json'), 'utf8'));
  }

  function resolvePackageExport(packageName: string, exportName: any = '.'): string {
    const packageJson: any = readPackageJson(packageName);
    const exportsMap: any = packageJson.exports ?? {};
    const rawTarget: any = typeof exportsMap === 'string' && exportName === '.'
      ? exportsMap
      : typeof exportsMap === 'object' && Object.hasOwn(exportsMap, exportName)
        ? exportsMap[exportName]
        : exportName === '.' ? exportsMap : undefined;
    const target: any = resolveConditionalExportTarget(rawTarget);
    if (!target) {
      throw new Error(`narada_package_export_missing: ${packageName} ${exportName}`);
    }
    return join(packageRoot(packageName), target);
  }

  function resolvePackageBin(packageName: string, binName: string): string {
    const packageJson: any = readPackageJson(packageName);
    const target: any = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
    if (!target) {
      throw new Error(`narada_package_bin_missing: ${packageName} ${binName}`);
    }
    return join(packageRoot(packageName), target);
  }

  return {
    packageRoot,
    readPackageJson,
    resolvePackageExport,
    resolvePackageBin,
  };
}
