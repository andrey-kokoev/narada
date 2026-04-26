/**
 * Principal Runtime CLI commands (Task 406)
 *
 * `narada principal status` — show principal runtime state
 * `narada principal attach <scope-id>` — attach a principal to a scope
 * `narada principal detach <runtime-id>` — detach a principal
 * `narada principal list` — list all principal runtimes
 */

import { resolve, dirname } from "node:path";
import {
  JsonPrincipalRuntimeRegistry,
  attachPrincipal,
  detachPrincipal,
  transitionState,
  canClaimWork,
  canExecute,
  type PrincipalRuntimeSnapshot,
} from "@narada2/control-plane";
import type { CommandContext } from "../lib/command-wrapper.js";
import { attachFormattedOutput } from "../lib/cli-output.js";

interface PrincipalCommandOptions {
  format: "json" | "human" | "auto";
  verbose?: boolean;
  config?: string;
}

function loadConfigPath(opts: { config?: string }): string {
  return resolve(opts.config ?? "./config.json");
}

/**
 * Resolve the directory where PrincipalRuntime state is persisted.
 * Rule: config-adjacent — state file lives in the same directory as config.json.
 */
function resolveStateDir(configPath: string): string {
  return dirname(resolve(configPath));
}

async function getRegistry(configPath: string): Promise<JsonPrincipalRuntimeRegistry> {
  const rootDir = resolveStateDir(configPath);
  const registry = new JsonPrincipalRuntimeRegistry({ rootDir });
  await registry.init();
  return registry;
}

function formatPrincipal(p: PrincipalRuntimeSnapshot & { can_claim_work?: boolean; can_execute?: boolean }): string {
  const lines = [
    `  Runtime: ${p.runtime_id}`,
    `  Principal: ${p.principal_id} (${p.principal_type})`,
    `  State: ${p.state}`,
    p.scope_id ? `  Scope: ${p.scope_id}` : null,
    p.attachment_mode ? `  Mode: ${p.attachment_mode}` : null,
    p.active_work_item_id ? `  Work item: ${p.active_work_item_id}` : null,
    p.budget_remaining !== null ? `  Budget: ${p.budget_remaining} ${p.budget_unit ?? ""}` : null,
    p.detail ? `  Detail: ${p.detail}` : null,
    `  Changed: ${new Date(p.state_changed_at).toLocaleString()}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function formatPrincipalStatus(snapshots: PrincipalRuntimeSnapshot[]): string {
  if (snapshots.length === 0) return "No principal runtimes registered.";
  const lines = ["Principal Runtimes", ""];
  for (const p of snapshots) {
    lines.push(formatPrincipal({
      ...p,
      can_claim_work: canClaimWork(p.state),
      can_execute: canExecute(p.state),
    }));
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatPrincipalList(
  snapshots: Array<{
    runtime_id: string;
    principal_id: string;
    principal_type: string;
    state: string;
    scope_id?: string | null;
    attachment_mode?: string | null;
    can_claim_work: boolean;
    can_execute: boolean;
  }>,
): string {
  if (snapshots.length === 0) return "No principal runtimes found.";
  const lines = [
    "Principal Runtimes",
    "-".repeat(80),
    `${"Runtime ID".padEnd(24)} ${"Principal".padEnd(16)} ${"Type".padEnd(8)} ${"State".padEnd(16)} ${"Scope".padEnd(12)} ${"Can Claim".padEnd(10)}`,
    "-".repeat(80),
  ];
  for (const p of snapshots) {
    lines.push(
      `${p.runtime_id.padEnd(24)} ${p.principal_id.padEnd(16)} ${p.principal_type.padEnd(8)} ${p.state.padEnd(16)} ${(p.scope_id ?? "-").padEnd(12)} ${p.can_claim_work ? "yes" : "no"}`,
    );
  }
  return lines.join("\n");
}

export async function principalStatusCommand(
  opts: PrincipalCommandOptions,
  _ctx: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  const registry = await getRegistry(loadConfigPath(opts));
  const snapshots = registry.snapshot();
  await registry.flush();

  if (opts.format === "json") {
    return { exitCode: 0, result: snapshots };
  }

  return { exitCode: 0, result: attachFormattedOutput({ snapshots }, formatPrincipalStatus(snapshots), "human") };
}

export async function principalListCommand(
  opts: PrincipalCommandOptions & { scope?: string },
  _ctx: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  const registry = await getRegistry(loadConfigPath(opts));
  const principals = registry.list(opts.scope);
  const snapshots = principals.map((p) => ({
    runtime_id: p.runtime_id,
    principal_id: p.principal_id,
    principal_type: p.principal_type,
    state: p.state,
    scope_id: p.scope_id,
    attachment_mode: p.attachment_mode,
    can_claim_work: canClaimWork(p.state),
    can_execute: canExecute(p.state),
  }));
  await registry.flush();

  if (opts.format === "json") {
    return { exitCode: 0, result: snapshots };
  }

  return { exitCode: 0, result: attachFormattedOutput({ snapshots }, formatPrincipalList(snapshots), "human") };
}

export async function principalAttachCommand(
  opts: PrincipalCommandOptions & { scope: string; mode?: string; principal?: string; runtime?: string; type?: string },
  _ctx: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  const registry = await getRegistry(loadConfigPath(opts));
  const principalId = opts.principal ?? `principal_${Date.now()}`;
  const runtimeId = opts.runtime ?? `rt_${Date.now()}`;
  const principalType = (opts.type as "operator" | "agent" | "worker" | "external") ?? "operator";
  const mode = (opts.mode as "observe" | "interact") ?? "interact";

  let principal = registry.get(runtimeId);
  if (!principal) {
    principal = registry.create({
      runtime_id: runtimeId,
      principal_id: principalId,
      principal_type: principalType,
    });
    // New principals start in `unavailable`; transition to `available` before attach
    transitionState(principal, 'available');
  }

  // Use registry.update() so mutation triggers persistence
  let attachSuccess = false;
  registry.update(runtimeId, (p) => {
    attachSuccess = attachPrincipal(p, opts.scope, mode);
  });
  if (!attachSuccess) {
    await registry.flush();
    return {
      exitCode: 1,
      result: { error: `Cannot attach principal from state "${principal.state}"` },
    };
  }

  const snapshot = registry.snapshot().find((s) => s.runtime_id === runtimeId);
  await registry.flush();

  if (opts.format === "json") {
    return { exitCode: 0, result: snapshot };
  }

  return {
    exitCode: 0,
    result: attachFormattedOutput(
      { snapshot },
      `Attached principal ${principalId} (runtime ${runtimeId}) to scope ${opts.scope} in ${mode} mode`,
      "human",
    ),
  };
}

export async function principalDetachCommand(
  opts: PrincipalCommandOptions & { runtimeId: string; reason?: string },
  _ctx: CommandContext,
): Promise<{ exitCode: number; result: unknown }> {
  const registry = await getRegistry(loadConfigPath(opts));
  const principal = registry.get(opts.runtimeId);

  if (!principal) {
    return {
      exitCode: 1,
      result: { error: `Principal runtime ${opts.runtimeId} not found` },
    };
  }

  // Use registry.update() so mutation triggers persistence
  let detachSuccess = false;
  registry.update(opts.runtimeId, (p) => {
    detachSuccess = detachPrincipal(p, opts.reason);
  });
  if (!detachSuccess) {
    await registry.flush();
    return {
      exitCode: 1,
      result: { error: `Cannot detach principal from state "${principal.state}"` },
    };
  }

  const snapshot = registry.snapshot().find((s) => s.runtime_id === opts.runtimeId);
  await registry.flush();

  if (opts.format === "json") {
    return { exitCode: 0, result: snapshot };
  }

  return {
    exitCode: 0,
    result: attachFormattedOutput({ snapshot }, `Detached principal ${opts.runtimeId}`, "human"),
  };
}
