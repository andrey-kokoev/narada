#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  planHostedTelemetryDeployPreflight,
  verifyHostedTelemetrySurface,
} from "../dist/deploy-readiness.js";

const command = process.argv[2] ?? "preflight";
const args = process.argv.slice(3);

function option(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (command === "preflight") {
  const configPath = option("--config", new URL("../wrangler.example.jsonc", import.meta.url));
  const configText = readFileSync(configPath, "utf8");
  print(planHostedTelemetryDeployPreflight({ wranglerConfigText: configText, env: process.env }));
} else if (command === "verify") {
  const surfaceUrl = option("--url");
  if (!surfaceUrl) throw new Error("surface_url_required");
  print(await verifyHostedTelemetrySurface({ surfaceUrl }));
} else if (command === "deploy") {
  const approved = process.env.NARADA_SITE_TELEMETRY_DEPLOY_APPROVED === "1";
  const live = hasFlag("--live");
  if (!live || !approved) {
    print({
      schema: "narada.site_telemetry.deploy_gate.v0",
      status: "blocked",
      reason: "live_deploy_requires_--live_and_NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1",
      deploy_mutation_performed: false,
      raw_secret_values_recorded: false,
    });
    process.exitCode = 1;
  } else {
    const configPath = option("--config", "wrangler.jsonc");
    const result = spawnSync("wrangler", ["deploy", "--config", configPath], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    process.exitCode = result.status ?? 1;
  }
} else {
  throw new Error(`unsupported_command:${command}`);
}
