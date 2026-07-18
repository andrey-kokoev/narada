import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteAuthorityRootFromSiteRoot } from '@narada2/site-paths';
import type { CommandContext } from '../lib/command-wrapper.js';
import { formattedResult, type CliFormat } from '../lib/cli-output.js';
import { ExitCode } from '../lib/exit-codes.js';
import { ensureUserSiteProvisioned, userSiteRegistryPath, userSiteRoot } from './onboarding.js';
import {
  WINDOWS_USER_SITE_ASSET_MARKER,
  WINDOWS_USER_SITE_INSTALL_SCHEMA,
  type WindowsUserSiteInstallProfile,
  resolveWindowsUserSiteInstallProfile,
  windowsUserSiteProfileDescriptor,
} from '../lib/windows-user-site-install-contract.js';

const packageRequire = createRequire(import.meta.url);

export interface WindowsUserSiteInstallOptions {
  siteRoot?: string;
  registryPath?: string;
  repair?: boolean;
  profile?: string;
  format?: CliFormat;
}

interface InstalledAsset {
  name: string;
  path: string;
  status: 'created' | 'updated' | 'present';
}

const WINDOWS_ASSETS = [
  { name: 'Start-NaradaWorkspace.ps1', relativePath: join('Start-NaradaWorkspace.ps1') },
  { name: 'Start-NaradaWorkspace.Dev.ps1', relativePath: join('Start-NaradaWorkspace.Dev.ps1') },
  { name: 'Set-NaradaProviderSecret.ps1', relativePath: join('tools', 'operator-secrets', 'Set-NaradaProviderSecret.ps1') },
  { name: 'Test-NaradaProviderSecrets.ps1', relativePath: join('tools', 'operator-secrets', 'Test-NaradaProviderSecrets.ps1') },
] as const;

function assetSourcePath(name: string): string {
  return fileURLToPath(new URL(`../assets/windows/${name}`, import.meta.url));
}

function packageMetadata(): {
  name: string;
  version: string;
  bundled_components: Record<string, { name: string; version: string }>;
} {
  const component = (name: string): { name: string; version: string } => {
    try {
      const parsed = packageRequire(`${name}/package.json`) as { name?: string; version?: string };
      return { name: parsed.name ?? name, version: parsed.version ?? 'unknown' };
    } catch {
      return { name, version: 'unavailable' };
    }
  };
  try {
    const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string; version?: string };
    return {
      name: parsed.name ?? '@narada2/cli',
      version: parsed.version ?? 'unknown',
      bundled_components: {
        runtime_server: component('@narada2/agent-runtime-server'),
        web_ui: component('@narada2/agent-web-ui'),
      },
    };
  } catch {
    return {
      name: '@narada2/cli',
      version: 'unknown',
      bundled_components: {
        runtime_server: component('@narada2/agent-runtime-server'),
        web_ui: component('@narada2/agent-web-ui'),
      },
    };
  }
}

async function installAsset(
  siteRoot: string,
  asset: typeof WINDOWS_ASSETS[number],
): Promise<InstalledAsset> {
  const targetPath = join(siteRoot, asset.relativePath);
  const existed = existsSync(targetPath);
  const contents = await readFile(assetSourcePath(asset.name), 'utf8');
  if (!contents.includes(WINDOWS_USER_SITE_ASSET_MARKER)) {
    throw new Error(`windows_user_site_asset_contract_invalid: ${asset.name}`);
  }
  if (existed) {
    try {
      if ((await readFile(targetPath, 'utf8')) === contents) {
        return { name: asset.name, path: targetPath, status: 'present' };
      }
    } catch {
      // A missing or unreadable package-owned asset is repaired below.
    }
  }
  await mkdir(dirname(targetPath), { recursive: true });
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

async function existingInstallationProfile(siteRoot: string): Promise<string | undefined> {
  const manifestPath = join(siteAuthorityRootFromSiteRoot(siteRoot), 'runtime', 'installation', 'user-site-install.json');
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as { installation_profile?: unknown };
    return typeof parsed.installation_profile === 'string' ? parsed.installation_profile : undefined;
  } catch {
    return undefined;
  }
}

interface WindowsUserSiteInstallResult {
  schema: typeof WINDOWS_USER_SITE_INSTALL_SCHEMA;
  status: 'installed' | 'repaired' | 'error';
  mutation_performed: boolean;
  installation_profile: WindowsUserSiteInstallProfile | null;
  optional_modules: string[];
  package: {
    name: string;
    version: string;
    bundled_components: Record<string, { name: string; version: string }>;
  };
  user_site: {
    root: string;
    registry_path: string;
  };
  assets: InstalledAsset[];
  installation_manifest_path: string | null;
  next_action: string;
  repair_command: string;
  error?: string;
}

export async function windowsUserSiteInstallCommand(
  options: WindowsUserSiteInstallOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const root = userSiteRoot(options.siteRoot);
  const registryPath = userSiteRegistryPath(root, options.registryPath);
  const repairCommand = 'narada install windows-user-site --repair';
  try {
    const profileValue = options.profile ?? (options.repair === true ? await existingInstallationProfile(root) : undefined);
    const profile = resolveWindowsUserSiteInstallProfile(profileValue);
    const profileDescriptor = windowsUserSiteProfileDescriptor(profile);
    const packageInfo = packageMetadata();
    await ensureUserSiteProvisioned(root, registryPath, context);
    const assets: InstalledAsset[] = [];
    for (const asset of WINDOWS_ASSETS) {
      assets.push(await installAsset(root, asset));
    }
    const manifestPath = join(siteAuthorityRootFromSiteRoot(root), 'runtime', 'installation', 'user-site-install.json');
    await mkdir(dirname(manifestPath), { recursive: true });
    const result: WindowsUserSiteInstallResult = {
      schema: WINDOWS_USER_SITE_INSTALL_SCHEMA,
      status: options.repair === true ? 'repaired' : 'installed',
      mutation_performed: true,
      installation_profile: profile,
      optional_modules: [...profileDescriptor.optional_modules],
      package: packageInfo,
      user_site: { root: resolve(root), registry_path: resolve(registryPath) },
      assets,
      installation_manifest_path: manifestPath,
      next_action: 'Run `narada doctor --bootstrap`, then `narada onboarding start --platform windows --scope user-site`.',
      repair_command: repairCommand,
    };
    await writeFile(manifestPath, `${JSON.stringify({ ...result, generated_at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
    return {
      exitCode: ExitCode.SUCCESS,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: WindowsUserSiteInstallResult = {
      schema: WINDOWS_USER_SITE_INSTALL_SCHEMA,
      status: 'error',
      mutation_performed: false,
      installation_profile: null,
      optional_modules: [],
      package: packageMetadata(),
      user_site: { root: resolve(root), registry_path: resolve(registryPath) },
      assets: [],
      installation_manifest_path: null,
      next_action: `Resolve the reported prerequisite, then rerun \`${repairCommand}\`.`,
      repair_command: repairCommand,
      error: message,
    };
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: formattedResult(result, renderHuman(result), options.format ?? 'auto'),
    };
  }
}
