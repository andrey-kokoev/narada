import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { ensureUserSiteProvisioned, userSiteRegistryPath, userSiteRoot } from './onboarding.js';

export interface WindowsUserSiteInstallOptions {
  siteRoot?: string;
  registryPath?: string;
  repair?: boolean;
  format?: CliFormat;
}

interface InstalledAsset {
  name: string;
  path: string;
  status: 'created' | 'updated' | 'present';
}

const WINDOWS_ASSETS = [
  { name: 'Start-NaradaWorkspace.ps1', relativePath: join('Start-NaradaWorkspace.ps1') },
  { name: 'Set-NaradaProviderSecret.ps1', relativePath: join('tools', 'operator-secrets', 'Set-NaradaProviderSecret.ps1') },
  { name: 'Test-NaradaProviderSecrets.ps1', relativePath: join('tools', 'operator-secrets', 'Test-NaradaProviderSecrets.ps1') },
] as const;

function assetSourcePath(name: string): string {
  return fileURLToPath(new URL(`../assets/windows/${name}`, import.meta.url));
}

async function installAsset(
  siteRoot: string,
  asset: typeof WINDOWS_ASSETS[number],
  overwrite: boolean,
): Promise<InstalledAsset> {
  const targetPath = join(siteRoot, asset.relativePath);
  const existed = existsSync(targetPath);
  if (existed && !overwrite) {
    return { name: asset.name, path: targetPath, status: 'present' };
  }
  await mkdir(dirname(targetPath), { recursive: true });
  const contents = await readFile(assetSourcePath(asset.name), 'utf8');
  await writeFile(targetPath, contents, 'utf8');
  return { name: asset.name, path: targetPath, status: existed ? 'updated' : 'created' };
}

function renderHuman(result: WindowsUserSiteInstallResult): string {
  const lines = [
    `Narada Windows User Site: ${result.status}`,
    `  Root      ${result.user_site.root}`,
    `  Registry  ${result.user_site.registry_path}`,
    `  Assets    ${result.assets.filter((asset) => asset.status !== 'present').length} written; ${result.assets.filter((asset) => asset.status === 'present').length} already present`,
    '',
    `Next: ${result.next_action}`,
  ];
  return lines.join('\n');
}

interface WindowsUserSiteInstallResult {
  schema: 'narada.install.windows_user_site.v1';
  status: 'installed' | 'repaired' | 'error';
  mutation_performed: boolean;
  user_site: {
    root: string;
    registry_path: string;
  };
  assets: InstalledAsset[];
  installation_manifest_path: string | null;
  next_action: string;
  error?: string;
}

export async function windowsUserSiteInstallCommand(
  options: WindowsUserSiteInstallOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const root = userSiteRoot(options.siteRoot);
  const registryPath = userSiteRegistryPath(root, options.registryPath);
  const overwrite = options.repair === true;
  try {
    await ensureUserSiteProvisioned(root, registryPath, context);
    const assets: InstalledAsset[] = [];
    for (const asset of WINDOWS_ASSETS) {
      assets.push(await installAsset(root, asset, overwrite));
    }
    const manifestPath = join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'installation', 'user-site-install.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    const result: WindowsUserSiteInstallResult = {
      schema: 'narada.install.windows_user_site.v1',
      status: overwrite ? 'repaired' : 'installed',
      mutation_performed: true,
      user_site: { root: resolve(root), registry_path: resolve(registryPath) },
      assets,
      installation_manifest_path: manifestPath,
      next_action: 'Run `narada doctor --bootstrap`, then `narada onboarding start --platform windows --scope user-site`.',
    };
    await writeFile(manifestPath, `${JSON.stringify({ ...result, generated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: WindowsUserSiteInstallResult = {
      schema: 'narada.install.windows_user_site.v1',
      status: 'error',
      mutation_performed: false,
      user_site: { root: resolve(root), registry_path: resolve(registryPath) },
      assets: [],
      installation_manifest_path: null,
      next_action: 'Resolve the reported prerequisite, then rerun `narada install windows-user-site --repair`.',
      error: message,
    };
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  }
}

