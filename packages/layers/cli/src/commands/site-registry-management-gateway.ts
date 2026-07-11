import { silentCommandContext } from "../lib/command-wrapper.js";
import type { CliFormat } from "../lib/cli-output.js";
import {
  sitesRegistryAddCommand,
  sitesRegistryEditCommand,
  sitesRegistryStateCommand,
} from "./site-registry-management.js";

export type RegistryMutationOperation = "add" | "edit" | "retire" | "restore" | "purge";

export interface RegistryMutationInput {
  operation: RegistryMutationOperation;
  siteId?: string;
  reference?: string;
  root?: string;
  variant?: string;
  substrate?: string;
  aimJson?: string;
  controlEndpoint?: string;
  clearAimJson?: boolean;
  clearControlEndpoint?: boolean;
  clearAliases?: boolean;
  aliases?: string[];
  source?: string;
  sourceRef?: string;
  reason?: string;
  reAdmit?: boolean;
  actor?: string;
  expectedRevision?: number;
  confirmSiteId?: string;
}

export interface RegistryMutationGateway {
  plan(input: RegistryMutationInput): Promise<RegistryMutationCommandEnvelope>;
  apply(input: RegistryMutationInput): Promise<RegistryMutationCommandEnvelope>;
}

export interface RegistryMutationCommandEnvelope {
  exitCode: number;
  result: unknown;
}

const JSON_FORMAT: CliFormat = "json";
const CONTEXT = silentCommandContext();

function requiredString(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`registry_${name}_required`);
  return value.trim();
}

async function invoke(input: RegistryMutationInput, apply: boolean): Promise<RegistryMutationCommandEnvelope> {
  const mode = { apply, dryRun: !apply };
  if (input.operation === "add") {
    return sitesRegistryAddCommand({
      format: JSON_FORMAT,
      siteId: requiredString(input.siteId, "site_id"),
      root: requiredString(input.root, "root"),
      variant: input.variant,
      substrate: input.substrate,
      aimJson: input.aimJson,
      controlEndpoint: input.controlEndpoint,
      alias: input.aliases,
      source: input.source,
      sourceRef: input.sourceRef,
      reason: input.reason,
      reAdmit: input.reAdmit,
      actor: input.actor,
      ...mode,
    }, CONTEXT);
  }
  if (input.operation === "edit") {
    return sitesRegistryEditCommand({
      format: JSON_FORMAT,
      reference: requiredString(input.reference, "reference"),
      root: input.root,
      variant: input.variant,
      substrate: input.substrate,
      aimJson: input.aimJson,
      controlEndpoint: input.controlEndpoint,
      clearAimJson: input.clearAimJson,
      clearControlEndpoint: input.clearControlEndpoint,
      clearAliases: input.clearAliases,
      alias: input.aliases,
      source: input.source,
      sourceRef: input.sourceRef,
      reason: input.reason,
      actor: input.actor,
      expectedRevision: input.expectedRevision,
      ...mode,
    }, CONTEXT);
  }
  return sitesRegistryStateCommand(input.operation, {
    format: JSON_FORMAT,
    reference: requiredString(input.reference, "reference"),
    reason: input.reason,
    actor: input.actor,
    expectedRevision: input.expectedRevision,
    confirmSiteId: input.confirmSiteId,
    ...mode,
  }, CONTEXT);
}

// The gateway only maps structured browser intent to the canonical CLI contract.
export function createRegistryMutationGateway(): RegistryMutationGateway {
  return {
    plan: (input) => invoke(input, false),
    apply: (input) => invoke(input, true),
  };
}