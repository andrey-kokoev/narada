import { silentCommandContext } from "../lib/command-wrapper.js";
import type { CliFormat } from "../lib/cli-output.js";
import {
  sitesRegistryDiscoverCommand,
  sitesRegistryListCommand,
  sitesRegistryShowCommand,
} from "./site-registry-management.js";

export interface RegistryCommandEnvelope {
  exitCode: number;
  result: unknown;
}

export interface RegistryDiscoverPlanOptions {
  source?: "filesystem" | "launch_registry" | "all";
  root?: string;
  actor?: string;
}

export interface SiteRegistryReadModel {
  list(): Promise<RegistryCommandEnvelope>;
  show(reference: string): Promise<RegistryCommandEnvelope>;
  discoverPlan(options: RegistryDiscoverPlanOptions): Promise<RegistryCommandEnvelope>;
}

const JSON_FORMAT: CliFormat = "json";
const CONTEXT = silentCommandContext();

// The browser server depends on command envelopes, never registry storage.
export function createSiteRegistryReadModel(): SiteRegistryReadModel {
  return {
    list: () => sitesRegistryListCommand({ format: JSON_FORMAT }, CONTEXT),
    show: (reference) => sitesRegistryShowCommand({ format: JSON_FORMAT, reference }, CONTEXT),
    discoverPlan: (options) => sitesRegistryDiscoverCommand({
      format: JSON_FORMAT,
      source: options.source,
      root: options.root,
      actor: options.actor,
      dryRun: true,
      apply: false,
    }, CONTEXT),
  };
}