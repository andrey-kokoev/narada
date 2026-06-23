import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

type NaradaPackageJson = {
  exports?: string | Record<string, string>;
  bin?: string | Record<string, string>;
};

export type NaradaPackageResolver = {
  packageRoot(packageName: string): string;
  readPackageJson(packageName: string): NaradaPackageJson;
  resolvePackageExport(packageName: string, exportName?: string): string;
  resolvePackageBin(packageName: string, binName: string): string;
};

function naradaPackageDirectoryName(packageName: string): string {
  const parts = String(packageName).split('/');
  return parts[parts.length - 1];
}

export function createNaradaPackageResolver({
  naradaProperRoot,
  importerUrl = import.meta.url,
}: {
  naradaProperRoot: string;
  importerUrl?: string;
}): NaradaPackageResolver {
  const require = createRequire(importerUrl);

  function packageRoot(packageName: string): string {
    try {
      return dirname(require.resolve(`${packageName}/package.json`));
    } catch {
      const siblingRoot = join(dirname(naradaProperRoot), naradaPackageDirectoryName(packageName));
      if (existsSync(join(siblingRoot, 'package.json'))) return siblingRoot;
      return join(naradaProperRoot, 'packages', naradaPackageDirectoryName(packageName));
    }
  }

  function readPackageJson(packageName: string): NaradaPackageJson {
    return JSON.parse(readFileSync(join(packageRoot(packageName), 'package.json'), 'utf8'));
  }

  function resolvePackageExport(packageName: string, exportName = '.'): string {
    const packageJson = readPackageJson(packageName);
    const exportsMap = packageJson.exports ?? {};
    const target = typeof exportsMap === 'string' && exportName === '.'
      ? exportsMap
      : exportsMap[exportName];
    if (!target) {
      throw new Error(`narada_package_export_missing: ${packageName} ${exportName}`);
    }
    return join(packageRoot(packageName), target);
  }

  function resolvePackageBin(packageName: string, binName: string): string {
    const packageJson = readPackageJson(packageName);
    const target = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binName];
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
