import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { LinuxSiteMode } from "./types.js";

export const LINUX_INSTALLATION_LIFECYCLE_SCHEMA =
  "narada.linux.installation.lifecycle_plan.v1" as const;
export const LINUX_INSTALLATION_STATE_SCHEMA =
  "narada.linux.installation.state.v1" as const;

export type LinuxInstallationLifecycleOperation =
  | "upgrade"
  | "uninstall"
  | "rollback"
  | "migrate";

export type LinuxInstallationLifecycleStatus =
  | "planned"
  | "applied"
  | "refused"
  | "partial";

export interface LinuxInstallationState {
  schema: typeof LINUX_INSTALLATION_STATE_SCHEMA;
  site_id: string;
  mode: LinuxSiteMode;
  site_root: string;
  installation_status: "installed" | "uninstalled" | "migrated" | "rolled_back";
  installed_version: string;
  schema_version: string;
  last_operation: LinuxInstallationLifecycleOperation | null;
  updated_at: string;
  site_data_preserved: true;
}

export interface LinuxInstallationLifecycleRequest {
  operation: LinuxInstallationLifecycleOperation;
  site_id: string;
  mode: LinuxSiteMode;
  site_root: string;
  current_version?: string;
  target_version?: string;
  current_schema_version?: string;
  target_schema_version?: string;
  rollback_to_version?: string;
  migration_artifact_ref?: string;
  supervisor_registered?: boolean;
  remove_data?: boolean;
  confirm_data_removal?: string;
  apply?: boolean;
  operation_id?: string;
}

export interface LinuxInstallationLifecycleStep {
  id: string;
  action: string;
  mutation_owner: "package_manager" | "narada_site" | "supervisor";
  mutation: boolean;
  data_preserved: true;
}

export interface LinuxInstallationLifecyclePlan {
  schema: typeof LINUX_INSTALLATION_LIFECYCLE_SCHEMA;
  operation_id: string;
  operation: LinuxInstallationLifecycleOperation;
  status: LinuxInstallationLifecycleStatus;
  mutation_performed: boolean;
  site_id: string;
  mode: LinuxSiteMode;
  site_root: string;
  current_version: string;
  target_version: string | null;
  current_schema_version: string;
  target_schema_version: string | null;
  package_action: string;
  supervisor_action: string;
  steps: LinuxInstallationLifecycleStep[];
  data_preservation: {
    site_data_preserved: true;
    default_uninstall_behavior: "preserve_site_data";
    data_removal: "not_requested" | "separate_guarded_operation";
  };
  evidence_path: string;
  state_path: string;
  refusal_reason: string | null;
  next_action: string;
  request: Pick<
    LinuxInstallationLifecycleRequest,
    "remove_data" | "supervisor_registered" | "migration_artifact_ref"
  >;
}

export interface LinuxInstallationLifecycleApplyResult extends LinuxInstallationLifecyclePlan {
  applied_at: string;
}

export const LINUX_DATA_REMOVAL_CONFIRMATION = "REMOVE_SITE_DATA" as const;

async function writeJsonAtomically(path: string, value: unknown, operationId: string): Promise<void> {
  const temporaryPath = `${path}.${operationId}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export function linuxInstallationStatePath(siteRoot: string): string {
  return join(resolve(siteRoot), "runtime", "installation", "linux-installation-state.json");
}

export function linuxInstallationEvidencePath(siteRoot: string, operationId: string): string {
  return join(
    resolve(siteRoot),
    "runtime",
    "installation",
    "lifecycle",
    `${operationId}.json`,
  );
}

export async function readLinuxInstallationState(
  siteRoot: string,
): Promise<LinuxInstallationState | null> {
  try {
    return JSON.parse(await readFile(linuxInstallationStatePath(siteRoot), "utf8")) as LinuxInstallationState;
  } catch {
    return null;
  }
}

function requiredVersion(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function compatibilityRefusal(request: LinuxInstallationLifecycleRequest): string | null {
  const currentSchema = request.current_schema_version?.trim() || "1";
  const targetSchema = request.target_schema_version?.trim() || currentSchema;
  if (request.operation === "rollback"
    && targetSchema !== currentSchema
    && !request.migration_artifact_ref?.trim()) {
    return "rollback_schema_boundary_requires_migration_artifact";
  }
  if (request.operation === "migrate" && targetSchema === currentSchema) {
    return "migration_target_matches_current_schema";
  }
  return null;
}

function operationVersions(request: LinuxInstallationLifecycleRequest): {
  currentVersion: string;
  targetVersion: string | null;
  currentSchemaVersion: string;
  targetSchemaVersion: string | null;
  refusalReason: string | null;
} {
  const currentVersion = request.current_version?.trim() || "unknown";
  const currentSchemaVersion = request.current_schema_version?.trim() || "1";
  if (request.operation === "upgrade") {
    const targetVersion = requiredVersion(request.target_version);
    return {
      currentVersion,
      targetVersion,
      currentSchemaVersion,
      targetSchemaVersion: currentSchemaVersion,
      refusalReason: targetVersion ? null : "upgrade_requires_target_version",
    };
  }
  if (request.operation === "rollback") {
    const targetVersion = requiredVersion(request.rollback_to_version);
    return {
      currentVersion,
      targetVersion,
      currentSchemaVersion,
      targetSchemaVersion: request.target_schema_version?.trim() || currentSchemaVersion,
      refusalReason: targetVersion ? null : "rollback_requires_rollback_to_version",
    };
  }
  if (request.operation === "migrate") {
    const targetSchemaVersion = requiredVersion(request.target_schema_version);
    return {
      currentVersion,
      targetVersion: currentVersion,
      currentSchemaVersion,
      targetSchemaVersion,
      refusalReason: targetSchemaVersion ? null : "migration_requires_target_schema_version",
    };
  }
  return {
    currentVersion,
    targetVersion: currentVersion,
    currentSchemaVersion,
    targetSchemaVersion: currentSchemaVersion,
    refusalReason: null,
  };
}

export function buildLinuxInstallationLifecyclePlan(
  request: LinuxInstallationLifecycleRequest,
): LinuxInstallationLifecyclePlan {
  const operationId = request.operation_id?.trim() || `linux-lifecycle-${randomUUID()}`;
  const siteRoot = resolve(request.site_root);
  const versions = operationVersions(request);
  const refusalReason = request.remove_data
    ? "data_removal_requires_separate_guarded_operation"
    : versions.refusalReason ?? compatibilityRefusal(request);
  const packageAction = request.operation === "upgrade"
    ? `Package manager must install @narada-core/cli@${versions.targetVersion ?? "<target-version>"}.`
    : request.operation === "rollback"
      ? `Package manager must install @narada-core/cli@${versions.targetVersion ?? "<rollback-version>"}.`
      : request.operation === "uninstall"
        ? "Package manager may remove @narada-core/cli after Site and supervisor teardown are verified."
        : "No package replacement; apply the declared schema migration artifact.";
  const supervisorAction = request.operation === "uninstall"
    ? "Stop, disable, and unregister the Site supervisor; preserve Site data."
    : request.supervisor_registered
      ? "Keep supervisor ownership and revalidate its unit after the package operation."
      : "No registered supervisor was declared; no supervisor mutation is planned.";
  const steps: LinuxInstallationLifecycleStep[] = [
    {
      id: "preflight",
      action: "Validate version/schema compatibility and record the current Site identity.",
      mutation_owner: "narada_site",
      mutation: false,
      data_preserved: true,
    },
    {
      id: "package-boundary",
      action: packageAction,
      mutation_owner: "package_manager",
      mutation: request.operation !== "migrate",
      data_preserved: true,
    },
    {
      id: "supervisor-boundary",
      action: supervisorAction,
      mutation_owner: "supervisor",
      mutation: request.operation === "uninstall" && request.supervisor_registered === true,
      data_preserved: true,
    },
    {
      id: "evidence",
      action: "Write the lifecycle receipt and resulting installation state after the prior steps succeed.",
      mutation_owner: "narada_site",
      mutation: true,
      data_preserved: true,
    },
  ];
  const status: LinuxInstallationLifecycleStatus = refusalReason
    ? "refused"
    : request.apply === true
      ? "planned"
      : "planned";
  return {
    schema: LINUX_INSTALLATION_LIFECYCLE_SCHEMA,
    operation_id: operationId,
    operation: request.operation,
    status,
    mutation_performed: false,
    site_id: request.site_id,
    mode: request.mode,
    site_root: siteRoot,
    current_version: versions.currentVersion,
    target_version: versions.targetVersion,
    current_schema_version: versions.currentSchemaVersion,
    target_schema_version: versions.targetSchemaVersion,
    package_action: packageAction,
    supervisor_action: supervisorAction,
    steps,
    data_preservation: {
      site_data_preserved: true,
      default_uninstall_behavior: "preserve_site_data",
      data_removal: request.remove_data ? "separate_guarded_operation" : "not_requested",
    },
    evidence_path: linuxInstallationEvidencePath(siteRoot, operationId),
    state_path: linuxInstallationStatePath(siteRoot),
    refusal_reason: refusalReason,
    next_action: refusalReason
      ? `Refused: ${refusalReason}. No Site data or supervisor state was changed.`
      : request.apply === true
        ? "Apply the package/supervisor boundary, then persist the lifecycle receipt with narada."
        : "Review this plan, then rerun with --apply to persist the Site-owned lifecycle receipt.",
    request: {
      remove_data: request.remove_data === true,
      supervisor_registered: request.supervisor_registered === true,
      migration_artifact_ref: request.migration_artifact_ref?.trim() || undefined,
    },
  };
}

export async function applyLinuxInstallationLifecyclePlan(
  plan: LinuxInstallationLifecyclePlan,
): Promise<LinuxInstallationLifecycleApplyResult | LinuxInstallationLifecyclePlan> {
  if (plan.status === "refused") return plan;
  const appliedAt = new Date().toISOString();
  const installationStatus = plan.operation === "uninstall"
    ? "uninstalled"
    : plan.operation === "migrate"
      ? "migrated"
      : plan.operation === "rollback"
        ? "rolled_back"
        : "installed";
  const state: LinuxInstallationState = {
    schema: LINUX_INSTALLATION_STATE_SCHEMA,
    site_id: plan.site_id,
    mode: plan.mode,
    site_root: plan.site_root,
    installation_status: installationStatus,
    installed_version: plan.target_version ?? plan.current_version,
    schema_version: plan.target_schema_version ?? plan.current_schema_version,
    last_operation: plan.operation,
    updated_at: appliedAt,
    site_data_preserved: true,
  };
  await mkdir(dirname(plan.evidence_path), { recursive: true });
  await mkdir(dirname(plan.state_path), { recursive: true });
  const result: LinuxInstallationLifecycleApplyResult = {
    ...plan,
    status: "applied",
    mutation_performed: true,
    applied_at: appliedAt,
    next_action: plan.operation === "uninstall"
      ? "Site data remains intact. Reinstall the package and rerun the lifecycle plan to restore operation."
      : "Run the verification ladder and inspect the lifecycle receipt if any step reports partial failure.",
  };
  const partialResult: LinuxInstallationLifecyclePlan & { applied_at: string } = {
    ...result,
    status: "partial",
    next_action: "Inspect the lifecycle receipt and state file, then rerun the same operation after repairing the failed write.",
  };
  await writeJsonAtomically(plan.evidence_path, partialResult, plan.operation_id);
  try {
    await writeJsonAtomically(plan.state_path, state, plan.operation_id);
    await writeJsonAtomically(plan.evidence_path, result, plan.operation_id);
  } catch {
    return partialResult;
  }
  return result;
}
