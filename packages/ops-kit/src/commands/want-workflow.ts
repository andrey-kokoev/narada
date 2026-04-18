/**
 * `ops-kit want workflow <workflow-id>`
 *
 * Shape "I want Narada to do this periodically" into workflow-owned objects.
 */

import fs from "node:fs";
import path from "node:path";
import {
  ensureConfig,
  findScope,
  getOpsRepoRoot,
  upsertScope,
  writeConfig,
} from "../lib/config-io.js";
import { scaffoldGlobal, scaffoldWorkflow } from "../lib/scaffold.js";
import { buildWorkflowScope } from "../lib/scope-builder.js";
import type { ShapedWorkflow } from "../intents/workflow.js";
import { resolvePostureActions } from "../intents/posture.js";

export interface WantWorkflowOptions {
  configPath?: string;
  primaryCharter?: string;
  schedule: string;
  posture?: string;
  dataRootDir?: string;
  scaffold?: boolean;
  description?: string;
}

export function wantWorkflow(
  workflowId: string,
  options: WantWorkflowOptions
): ShapedWorkflow {
  const config = ensureConfig(options.configPath);
  const opsRoot = getOpsRepoRoot(options.configPath);
  const dataRoot =
    options.dataRootDir ?? path.join(config.root_dir, workflowId);
  const scopeId = workflowId;
  const contextId = `timer:${workflowId}`;
  const existed = !!findScope(config, scopeId);

  const scope = buildWorkflowScope({
    scopeId,
    workflowId,
    schedule: options.schedule,
    dataRootDir: dataRoot,
    primaryCharter: options.primaryCharter,
    posture: options.posture as "observe-only" | "draft-alert" | "act-with-approval" | undefined,
  });

  upsertScope(config, scope);
  writeConfig(config, options.configPath);

  const configPath = options.configPath ?? "./config/config.json";
  const touchedPaths: string[] = [configPath];

  if (options.scaffold !== false) {
    touchedPaths.push(...scaffoldGlobal(opsRoot));
    touchedPaths.push(...scaffoldWorkflow(opsRoot, workflowId));
  }

  const workflowRoot = path.join(opsRoot, "workflows", workflowId);
  const schedulePath = path.join(workflowRoot, "schedule.json");
  fs.mkdirSync(workflowRoot, { recursive: true });
  fs.writeFileSync(
    schedulePath,
    JSON.stringify(
      {
        workflow_id: workflowId,
        schedule: options.schedule,
        description: options.description ?? `Timer workflow: ${workflowId}`,
        primary_charter: scope.policy.primary_charter,
        posture: options.posture ?? "observe-only",
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  touchedPaths.push(schedulePath);

  const posture = options.posture ?? "observe-only";
  const allowed = resolvePostureActions(posture as "observe-only" | "draft-alert" | "act-with-approval");

  return {
    scopeId,
    contextId,
    touchedPaths,
    existed,
    summary:
      `Workflow ${workflowId} ${existed ? "updated" : "created"}. ` +
      `Primary charter: ${scope.policy.primary_charter}. ` +
      `Posture: ${posture} (${allowed.length} allowed actions). ` +
      `Schedule: ${options.schedule}.`,
  };
}
