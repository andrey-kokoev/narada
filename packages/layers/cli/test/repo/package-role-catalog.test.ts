import { vi } from 'vitest';

vi.unmock('node:fs');
vi.unmock('node:fs/promises');

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

type PackageRoleCatalog = {
  role_definitions?: Record<string, unknown>;
  descriptor_package_guard?: {
    applies_to_role?: string;
    must_not_add_without_role_change?: string[];
  };
  packages?: Array<{
    package?: string;
    path?: string;
    roles?: string[];
    posture?: string;
  }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function findPackageJsons(root: string): string[] {
  const found: string[] = [];
  const ignored = new Set(['node_modules', 'dist', 'coverage']);
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (ignored.has(entry)) continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry === 'package.json') {
        found.push(fullPath);
      }
    }
  }
  walk(root);
  return found.sort();
}

describe('Narada package role catalog', () => {
  it('covers every workspace package under packages/', () => {
    const catalog = readJson<PackageRoleCatalog>(
      join(repoRoot, '.narada', 'capabilities', 'package-role-catalog.json'),
    );
    const catalogByPackage = new Map((catalog.packages ?? []).map((entry) => [entry.package, entry]));
    const manifests = findPackageJsons(join(repoRoot, 'packages')).map((manifestPath) => {
      const manifest = readJson<{ name?: string }>(manifestPath);
      return {
        name: manifest.name,
        path: relative(repoRoot, dirname(manifestPath)).replaceAll('\\', '/'),
      };
    });

    expect(manifests.map((manifest) => manifest.name).sort()).toEqual(
      [...catalogByPackage.keys()].sort(),
    );
    for (const manifest of manifests) {
      const entry = catalogByPackage.get(manifest.name);
      expect(entry).toBeDefined();
      expect(entry?.path).toBe(manifest.path);
      expect(entry?.roles?.length).toBeGreaterThan(0);
      for (const role of entry?.roles ?? []) {
        expect(catalog.role_definitions?.[role]).toBeDefined();
      }
      expect(entry?.posture).toEqual(expect.any(String));
    }
  });

  it('keeps descriptor package guard explicit', () => {
    const catalog = readJson<PackageRoleCatalog>(
      join(repoRoot, '.narada', 'capabilities', 'package-role-catalog.json'),
    );

    expect(catalog.descriptor_package_guard).toMatchObject({
      applies_to_role: 'descriptor_contract',
      must_not_add_without_role_change: expect.arrayContaining([
        'sqlite_dependency_ownership',
        'native_shell_execution',
        'arbitrary_sql_execution',
        'secret_or_credential_access',
        'source_site_runtime_state_import',
        'operator_surface_runtime_copying',
        'pc_locus_mutation',
        'live_capability_grants',
      ]),
    });
  });
});
