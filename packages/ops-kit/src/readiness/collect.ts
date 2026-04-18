import fs from "node:fs";
import path from "node:path";
import type { CoordinatorConfig, OperationalRequirement } from "@narada2/charters";
import { collectOperationalRequirements } from "@narada2/charters";
import type { ScopeConfig } from "@narada2/exchange-fs-sync";
import { resolveConfigPath } from "../lib/config-io.js";
import type { ReadinessCheck, ReadinessReport, ReadinessStatus } from "./types.js";

export interface PreflightOptions {
  configPath?: string;
  scope?: ScopeConfig;
  target: string;
  coordinatorConfig?: CoordinatorConfig;
  mailboxIdForTools?: string;
}

function pushCheck(checks: ReadinessCheck[], check: ReadinessCheck): void {
  checks.push(check);
}

function statusFromChecks(checks: ReadinessCheck[]): ReadinessStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

function checkRequirement(checks: ReadinessCheck[], requirement: OperationalRequirement): void {
  switch (requirement.kind) {
    case "env_var": {
      const present = !!process.env[requirement.name]?.trim();
      pushCheck(checks, {
        category: "env_var",
        name: requirement.name,
        status: present ? "pass" : requirement.optional ? "warn" : "fail",
        detail: requirement.description,
        remediation: present ? undefined : `Set env var ${requirement.name}`,
      });
      return;
    }
    case "directory": {
      const exists = fs.existsSync(requirement.path) && fs.statSync(requirement.path).isDirectory();
      pushCheck(checks, {
        category: "directory",
        name: requirement.path,
        status: exists ? "pass" : requirement.optional ? "warn" : "fail",
        detail: requirement.description,
        remediation: exists ? undefined : `Create directory ${requirement.path}`,
      });
      return;
    }
    case "local_file": {
      const exists = fs.existsSync(requirement.path) && fs.statSync(requirement.path).isFile();
      pushCheck(checks, {
        category: "file",
        name: requirement.path,
        status: exists ? "pass" : requirement.optional ? "warn" : "fail",
        detail: requirement.description,
        remediation: exists ? undefined : `Create file ${requirement.path}`,
      });
      return;
    }
    case "local_executable": {
      const exists = fs.existsSync(requirement.command);
      pushCheck(checks, {
        category: "executable",
        name: requirement.command,
        status: exists ? "pass" : requirement.optional ? "warn" : "fail",
        detail: requirement.description,
        remediation: exists ? undefined : `Install or expose executable ${requirement.command}`,
      });
      return;
    }
    case "http_endpoint": {
      pushCheck(checks, {
        category: "endpoint",
        name: requirement.url,
        status: requirement.optional ? "warn" : "pass",
        detail: requirement.description,
        remediation: requirement.optional ? `Verify endpoint ${requirement.url}` : undefined,
      });
    }
  }
}

export function preflight(options: PreflightOptions): ReadinessReport {
  const checks: ReadinessCheck[] = [];
  const configPath = resolveConfigPath(options.configPath);
  pushCheck(checks, {
    category: "config",
    name: configPath,
    status: fs.existsSync(configPath) ? "pass" : "fail",
    detail: "Narada ops config file",
    remediation: fs.existsSync(configPath) ? undefined : `Create config at ${configPath}`,
  });

  if (options.scope) {
    const configDir = path.dirname(configPath);
    const resolvedRootDir = path.isAbsolute(options.scope.root_dir) ? options.scope.root_dir : path.resolve(configDir, options.scope.root_dir);
    pushCheck(checks, {
      category: "directory",
      name: resolvedRootDir,
      status: fs.existsSync(resolvedRootDir) ? "pass" : "fail",
      detail: "Scope data root",
      remediation: fs.existsSync(resolvedRootDir) ? undefined : `Create data root ${resolvedRootDir}`,
    });

    const runtime = options.scope.charter?.runtime ?? "mock";
    if (runtime === "codex-api") {
      const ok = !!(options.scope.charter?.api_key || process.env.NARADA_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
      pushCheck(checks, {
        category: "charter",
        name: "codex-api",
        status: ok ? "pass" : "fail",
        detail: "OpenAI-compatible charter runtime",
        remediation: ok ? undefined : "Set NARADA_OPENAI_API_KEY or config.charter.api_key",
      });
    } else if (runtime === "kimi-api") {
      const ok = !!(options.scope.charter?.api_key || process.env.NARADA_KIMI_API_KEY || process.env.KIMI_API_KEY);
      pushCheck(checks, {
        category: "charter",
        name: "kimi-api",
        status: ok ? "pass" : "fail",
        detail: "Kimi-compatible charter runtime",
        remediation: ok ? undefined : "Set NARADA_KIMI_API_KEY or config.charter.api_key",
      });
    }
  }

  if (options.coordinatorConfig && options.mailboxIdForTools) {
    for (const requirement of collectOperationalRequirements(options.coordinatorConfig, options.mailboxIdForTools)) {
      checkRequirement(checks, requirement);
    }
  }

  const status = statusFromChecks(checks);
  const counts = {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
  };
  return {
    target: options.target,
    status,
    checks,
    counts,
    nextActions: checks.filter((c) => c.status !== "pass" && c.remediation).map((c) => c.remediation as string),
  };
}
