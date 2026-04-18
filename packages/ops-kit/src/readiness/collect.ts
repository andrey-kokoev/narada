import fs from "node:fs";
import path from "node:path";
import type { CoordinatorConfig, OperationalRequirement } from "@narada2/charters";
import { collectOperationalRequirements } from "@narada2/charters";
import type { ScopeConfig } from "@narada2/control-plane";
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
  const configDir = path.dirname(configPath);
  pushCheck(checks, {
    category: "config",
    name: configPath,
    status: fs.existsSync(configPath) ? "pass" : "fail",
    detail: "Narada ops config file",
    remediation: fs.existsSync(configPath) ? undefined : `Create config at ${configPath}`,
  });

  if (options.scope) {
    const resolvedRootDir = path.isAbsolute(options.scope.root_dir) ? options.scope.root_dir : path.resolve(configDir, options.scope.root_dir);
    pushCheck(checks, {
      category: "directory",
      name: resolvedRootDir,
      status: fs.existsSync(resolvedRootDir) ? "pass" : "fail",
      detail: "Operation data root",
      remediation: fs.existsSync(resolvedRootDir) ? undefined : `Run \`narada setup\` to create ${resolvedRootDir}`,
    });

    const activatedPath = path.join(resolvedRootDir, ".activated");
    const activated = fs.existsSync(activatedPath);
    pushCheck(checks, {
      category: "activation",
      name: "activated",
      status: activated ? "pass" : "warn",
      detail: "Operation activation state",
      remediation: activated ? undefined : `Run \`narada activate ${options.target}\` when ready to go live`,
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

  // Determine if this is a non-live trial scope
  const isNonLive =
    options.scope?.sources.some((s) => s.type === "mock") ||
    options.scope?.charter?.runtime === "mock";

  if (isNonLive) {
    pushCheck(checks, {
      category: "source",
      name: "trial-mode",
      status: "pass",
      detail: "Non-live trial source — no external credentials required",
      remediation: undefined,
    });
  } else {
    // Graph credentials check (global, not scope-specific)
    const hasTenant = !!process.env.GRAPH_TENANT_ID?.trim();
    const hasClient = !!process.env.GRAPH_CLIENT_ID?.trim();
    const hasSecret = !!process.env.GRAPH_CLIENT_SECRET?.trim();
    const graphReady = hasTenant && hasClient && hasSecret;
    pushCheck(checks, {
      category: "env_var",
      name: "graph-credentials",
      status: graphReady ? "pass" : "fail",
      detail: "Microsoft Graph API credentials (GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET)",
      remediation: graphReady ? undefined : "Fill .env from .env.example with Graph API credentials",
    });
  }

  // .env file check (informational)
  const opsRoot = path.dirname(configDir);
  const envPath = path.join(opsRoot, ".env");
  pushCheck(checks, {
    category: "file",
    name: ".env",
    status: fs.existsSync(envPath) ? "pass" : "warn",
    detail: "Local environment file",
    remediation: fs.existsSync(envPath) ? undefined : "Copy .env.example to .env and fill in secrets",
  });

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
