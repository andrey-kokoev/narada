import type { CommandContext } from "../lib/command-wrapper.js";
import { formattedResult, type CliFormat } from "../lib/cli-output.js";
import { ExitCode } from "../lib/exit-codes.js";
import {
  applyLinuxInstallationLifecyclePlan,
  buildLinuxInstallationLifecyclePlan,
  readLinuxInstallationState,
  type LinuxInstallationLifecycleOperation,
} from "@narada2/linux-site";

export interface LinuxInstallationLifecycleCommandOptions {
  siteId: string;
  mode?: "system" | "user";
  siteRoot: string;
  currentVersion?: string;
  targetVersion?: string;
  currentSchemaVersion?: string;
  targetSchemaVersion?: string;
  rollbackToVersion?: string;
  migrationArtifactRef?: string;
  supervisorRegistered?: boolean;
  removeData?: boolean;
  confirmDataRemoval?: string;
  apply?: boolean;
  operationId?: string;
  format?: CliFormat;
}

function renderHuman(result: {
  operation: string;
  status: string;
  mutation_performed: boolean;
  site_id: string;
  mode: string;
  site_root: string;
  current_version: string;
  target_version: string | null;
  package_action: string;
  supervisor_action: string;
  evidence_path: string;
  state_path: string;
  refusal_reason: string | null;
  next_action: string;
}): string {
  return [
    `Narada Linux lifecycle: ${result.operation} (${result.status})`,
    `  Site       ${result.site_id} (${result.mode})`,
    `  Root       ${result.site_root}`,
    `  Version    ${result.current_version} -> ${result.target_version ?? "unchanged"}`,
    `  Mutation   ${result.mutation_performed ? "applied" : "not applied"}`,
    `  Package    ${result.package_action}`,
    `  Supervisor ${result.supervisor_action}`,
    `  Evidence   ${result.evidence_path}`,
    `  State      ${result.state_path}`,
    ...(result.refusal_reason ? [`  Refusal    ${result.refusal_reason}`] : []),
    `Next: ${result.next_action}`,
  ].join("\n");
}

export async function linuxInstallationLifecycleCommand(
  operation: LinuxInstallationLifecycleOperation,
  options: LinuxInstallationLifecycleCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const state = await readLinuxInstallationState(options.siteRoot);
  const plan = buildLinuxInstallationLifecyclePlan({
    operation,
    site_id: options.siteId,
    mode: options.mode ?? state?.mode ?? "user",
    site_root: options.siteRoot,
    current_version: options.currentVersion ?? state?.installed_version,
    target_version: options.targetVersion,
    current_schema_version: options.currentSchemaVersion ?? state?.schema_version,
    target_schema_version: options.targetSchemaVersion,
    rollback_to_version: options.rollbackToVersion,
    migration_artifact_ref: options.migrationArtifactRef,
    supervisor_registered: options.supervisorRegistered,
    remove_data: options.removeData,
    confirm_data_removal: options.confirmDataRemoval,
    apply: options.apply,
    operation_id: options.operationId,
  });
  const result = options.apply === true && plan.status !== "refused"
    ? await applyLinuxInstallationLifecyclePlan(plan)
    : plan;
  const exitCode = result.status === "refused" ? ExitCode.INVALID_CONFIG : ExitCode.SUCCESS;
  return {
    exitCode,
    result: formattedResult(result, renderHuman(result), options.format ?? "human"),
  };
}
