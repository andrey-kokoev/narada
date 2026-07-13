import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NARADA_AGENT_RUNTIME_SERVER_KIND, resolveCarrierRuntimeSelection } from '@narada2/carrier-runtime-contract/carrier-runtime-selection';
import type { ResolvedSiteRoot } from '../lib/site-root-resolver.js';
import { commandResultError } from '../lib/command-wrapper.js';
import type { WorkspaceLaunchSelection as WorkspaceLaunchBrowserSelection, WorkspaceLaunchSelectorModel } from '@narada2/workspace-launch-contract';
import {
  buildWorkspaceLaunchSelectionUiModel,
  initialRoleValuesForInteractiveSelection,
  normalizeInteractiveOperatorSurfaceValues,
  normalizeWorkspaceLaunchBrowserSelection,
  roleChoicesForSelectedSites,
  workspaceLaunchSelectorModel,
  type WorkspaceLaunchProviderRegistry,
  type WorkspaceLaunchSelectionContext,
} from './workspace-launch-selection.js';
import { legacyCarrierCompatibility } from './workspace-launch-support.js';
import type { WorkspaceLaunchRegistryContext } from './workspace-launch-registry.js';
import type { WorkspaceLaunchPlanOptions, WorkspaceLaunchRecord } from './workspace-launch-types.js';

export interface WorkspaceLaunchSelectionServices {
  registryContext: WorkspaceLaunchRegistryContext;
  workspaceLaunchSelectorModel(
    records: WorkspaceLaunchRecord[],
    selection?: Partial<WorkspaceLaunchBrowserSelection>,
    siteCatalog?: ResolvedSiteRoot[],
  ): WorkspaceLaunchSelectorModel;
  normalizeWorkspaceLaunchBrowserSelection(payload: Partial<WorkspaceLaunchBrowserSelection>): WorkspaceLaunchBrowserSelection;
  buildWorkspaceLaunchSelectionUiModel(
    records: WorkspaceLaunchRecord[],
    options: WorkspaceLaunchPlanOptions,
    rememberedSelection?: WorkspaceLaunchBrowserSelection | null,
    siteCatalog?: ResolvedSiteRoot[],
  ): Record<string, unknown>;
  normalizeInteractiveOperatorSurfaceValues(values: string[]): string[];
  roleChoicesForSelectedSites(records: WorkspaceLaunchRecord[], siteSelectors: string[]): string[];
  initialRoleValuesForInteractiveSelection(roleChoices: string[], explicitRoles?: string[]): string[];
}

export interface WorkspaceLaunchContext {
  selectionContext: WorkspaceLaunchSelectionContext;
  registryContext: WorkspaceLaunchRegistryContext;
  selectionServices: WorkspaceLaunchSelectionServices;
}

const ADMITTED_LAUNCH_RUNTIME_SUBSTRATE_KINDS = [
  NARADA_AGENT_RUNTIME_SERVER_KIND,
  'codex',
  'kimi',
  'pi',
  'claude-code',
  'opencode',
] as const;

const requireFromWorkspaceLaunchContext = createRequire(import.meta.url);

interface ProviderAdapters {
  admitted_providers?: string[];
}

function fallbackProviderRegistryForTests(): WorkspaceLaunchProviderRegistry {
  return {
    default_provider: 'kimi-code-api',
    providers: {
      'anthropic-api': { meaning: 'Anthropic API via the Anthropic Messages API.', support_state: 'verified_supported' },
      'codex-subscription': { meaning: 'Local Codex CLI subscription auth via codex mcp-server; no OpenAI API key or API billing path.', support_state: 'verified_supported' },
      'deepseek-api': { meaning: 'DeepSeek API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'glm-api': { meaning: 'GLM API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-api': { meaning: 'Kimi/Moonshot API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
      'kimi-code-api': { meaning: 'Kimi Code API via OpenAI-compatible chat completions; uses KIMI_CODE_API_KEY against api.kimi.com/coding/v1.', support_state: 'verified_supported' },
      'openai-api': { meaning: 'OpenAI API via OpenAI-compatible chat completions.', support_state: 'verified_supported' },
    },
  };
}

function resolveProviderRegistryPath(): string {
  const candidates: string[] = [];
  try {
    candidates.push(requireFromWorkspaceLaunchContext.resolve('@narada2/carrier-provider-contract/provider-registry'));
  } catch {
    // Source checkouts can run before pnpm has materialized this dependency link.
  }
  candidates.push(
    fileURLToPath(new URL('../../../../carrier-provider-contract/contracts/provider-registry.json', import.meta.url)),
    resolve(process.cwd(), '..', '..', 'carrier-provider-contract', 'contracts', 'provider-registry.json'),
    resolve(process.cwd(), 'packages', 'carrier-provider-contract', 'contracts', 'provider-registry.json'),
  );
  const registryPath = candidates.find((candidate) => existsSync(candidate));
  if (registryPath) return registryPath;
  throw new Error(`provider_registry_not_found: ${candidates.join(', ')}`);
}

function loadProviderRegistry(): WorkspaceLaunchProviderRegistry {
  let registryPath: string;
  try {
    registryPath = resolveProviderRegistryPath();
  } catch (error) {
    if (process.env.VITEST) return fallbackProviderRegistryForTests();
    throw error;
  }
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as WorkspaceLaunchProviderRegistry;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`provider_registry_load_failed: ${registryPath}: ${message}`);
  }
}

function resolveProviderAdaptersPath(): string {
  const candidates: string[] = [];
  try {
    candidates.push(requireFromWorkspaceLaunchContext.resolve('@narada2/carrier-provider-contract/provider-adapters'));
  } catch {
    // Source checkouts can run before pnpm has materialized this dependency link.
  }
  candidates.push(
    fileURLToPath(new URL('../../../../carrier-provider-contract/contracts/provider-adapters.json', import.meta.url)),
    resolve(process.cwd(), '..', '..', 'carrier-provider-contract', 'contracts', 'provider-adapters.json'),
    resolve(process.cwd(), 'packages', 'carrier-provider-contract', 'contracts', 'provider-adapters.json'),
  );
  const adaptersPath = candidates.find((candidate) => existsSync(candidate));
  if (adaptersPath) return adaptersPath;
  throw new Error(`provider_adapters_not_found: ${candidates.join(', ')}`);
}

function loadProviderAdapters(): ProviderAdapters {
  let adaptersPath: string;
  try {
    adaptersPath = resolveProviderAdaptersPath();
  } catch (error) {
    if (process.env.VITEST) return { admitted_providers: Object.keys(fallbackProviderRegistryForTests().providers ?? {}) };
    throw error;
  }
  try {
    return JSON.parse(readFileSync(adaptersPath, 'utf8')) as ProviderAdapters;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`provider_adapters_load_failed: ${adaptersPath}: ${message}`);
  }
}

function resolveWorkspaceCarrierRuntimeSelection(
  operatorSurface: string | undefined,
  runtime: string,
): ReturnType<WorkspaceLaunchSelectionContext['resolveCarrierRuntimeSelection']> {
  const selection = resolveCarrierRuntimeSelection({
    carrierValue: operatorSurface,
    operatorSurfaceValue: operatorSurface,
    runtimeValue: runtime,
    admittedRuntimeSubstrateKinds: [...ADMITTED_LAUNCH_RUNTIME_SUBSTRATE_KINDS],
    runtimeContractSchema: 'narada.runtime_substrate_kind.v1',
  });
  if (selection.status === 'refused') {
    throw commandResultError({
      status: 'error',
      command: 'launcher workspace-plan',
      error: selection.reason,
      _formatted: `[FAIL] ${selection.reason_code}: ${selection.reason}`,
      reason_code: selection.reason_code,
      reason: selection.reason,
      candidate_carrier_kind: selection.candidate_carrier_kind,
      candidate_operator_surface_kind: selection.candidate_operator_surface_kind,
      candidate_runtime_substrate_kind: selection.candidate_runtime_substrate_kind,
      retryable: false,
    }, selection.reason_code);
  }
  return selection;
}

export function createWorkspaceLaunchSelectionContext(): WorkspaceLaunchSelectionContext {
  const providerRegistry = loadProviderRegistry();
  const providerAdapters = loadProviderAdapters();
  return {
    providerRegistry,
    admittedProviders: providerAdapters.admitted_providers,
    resolveCarrierRuntimeSelection: resolveWorkspaceCarrierRuntimeSelection,
  };
}

export function createWorkspaceLaunchRegistryContext(
  selectionContext: WorkspaceLaunchSelectionContext = createWorkspaceLaunchSelectionContext(),
): WorkspaceLaunchRegistryContext {
  return {
    providerRegistry: selectionContext.providerRegistry,
    resolveCarrierRuntimeSelection: selectionContext.resolveCarrierRuntimeSelection,
    legacyCarrierCompatibility,
  };
}

export function createWorkspaceLaunchSelectionServices(
  selectionContext: WorkspaceLaunchSelectionContext,
  registryContext: WorkspaceLaunchRegistryContext = createWorkspaceLaunchRegistryContext(selectionContext),
): WorkspaceLaunchSelectionServices {
  return {
    registryContext,
    workspaceLaunchSelectorModel: (records, selection = {}, siteCatalog = []) => workspaceLaunchSelectorModel(records, selection, siteCatalog, selectionContext),
    normalizeWorkspaceLaunchBrowserSelection: (payload) => normalizeWorkspaceLaunchBrowserSelection(payload),
    buildWorkspaceLaunchSelectionUiModel: (records, options, rememberedSelection = null, siteCatalog = []) => buildWorkspaceLaunchSelectionUiModel(records, options, rememberedSelection, siteCatalog, selectionContext),
    normalizeInteractiveOperatorSurfaceValues: (values) => normalizeInteractiveOperatorSurfaceValues(values),
    roleChoicesForSelectedSites: (records, siteSelectors) => roleChoicesForSelectedSites(records, siteSelectors),
    initialRoleValuesForInteractiveSelection: (roleChoices, explicitRoles) => initialRoleValuesForInteractiveSelection(roleChoices, explicitRoles),
  };
}

export function createWorkspaceLaunchContext(): WorkspaceLaunchContext {
  const selectionContext = createWorkspaceLaunchSelectionContext();
  const registryContext = createWorkspaceLaunchRegistryContext(selectionContext);
  return {
    selectionContext,
    registryContext,
    selectionServices: createWorkspaceLaunchSelectionServices(selectionContext, registryContext),
  };
}
