import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = resolve(repoRoot, "packages", "layers", "cli");
const linuxRoot = resolve(repoRoot, "packages", "sites", "linux");

type JsonRecord = Record<string, unknown>;

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function hasString(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.includes(expected);
}

function isWsl(): boolean {
  return Boolean(process.env.WSL_INTEROP || process.env.WSL_DISTRO_NAME);
}

function executionSubstrate(): "native_linux" | "wsl" | "controlled_fixture" {
  if (process.platform !== "linux") return "controlled_fixture";
  return isWsl() ? "wsl" : "native_linux";
}

const cliPackage = readJson(resolve(cliRoot, "package.json"));
const linuxPackage = readJson(resolve(linuxRoot, "package.json"));
const scripts = (cliPackage.scripts ?? {}) as JsonRecord;
const engine = String((cliPackage.engines as JsonRecord | undefined)?.node ?? "");
const requiredFiles: Array<[string, string]> = [
  ["canonical_runbook", resolve(repoRoot, "docs", "deployment", "linux-installation.md")],
  ["linux_contract_fixture", resolve(linuxRoot, "test", "installation-e2e-contract.test.ts")],
  ["source_checkout_e2e", resolve(cliRoot, "test", "integration", "clean-install-onboarding.test.ts")],
  ["published_artifact_e2e", resolve(cliRoot, "test", "integration", "published-cli-install.test.ts")],
  ["runtime_replay_web_ui_e2e", resolve(cliRoot, "test", "integration", "operator-journey-acceptance-e2e.test.ts")],
  ["session_refusal_e2e", resolve(cliRoot, "test", "commands", "agent-web-ui-session.test.ts")],
];

const checks: Array<{ id: string; passed: boolean; detail: string }> = [
  {
    id: "node_engine",
    passed: engine === ">=22.0.0" && Number(process.versions.node.split(".")[0]) >= 22,
    detail: `package=${engine}; observed=${process.versions.node}`,
  },
  {
    id: "linux_package_is_published",
    passed: hasString(linuxPackage.files, "dist/") && linuxPackage.main === "./dist/index.js",
    detail: "Linux package publishes dist and declares a runnable entrypoint.",
  },
  {
    id: "cli_bundles_linux_runtime_and_surfaces",
    passed: ["@narada2/linux-site", "@narada2/agent-runtime-server", "@narada2/agent-web-ui"].every((name) => hasString(cliPackage.bundleDependencies, name)),
    detail: "Published CLI bundle admits Linux Site, runtime-server, and Web UI assets.",
  },
  {
    id: "release_gate_script",
    passed: typeof scripts["test:linux-installation-e2e"] === "string",
    detail: "CLI publication invokes the Linux installation E2E gate.",
  },
  ...requiredFiles.map(([id, path]) => ({ id, passed: existsSync(path), detail: path })),
  {
    id: "source_and_published_paths_are_separate",
    passed: typeof scripts["test:publication-boundary"] === "string"
      && typeof scripts["test:operator-journey-acceptance"] === "string",
    detail: "Source/publication boundary and runtime first-use journeys have separate commands.",
  },
];

const substrate = executionSubstrate();
const nativeRequired = process.env.NARADA_REQUIRE_NATIVE_LINUX_E2E === "1";
checks.push({
  id: "native_linux_required",
  passed: !nativeRequired || substrate === "native_linux",
  detail: nativeRequired
    ? `native Linux is required, observed ${substrate}`
    : `execution substrate labeled ${substrate}; WSL is separate from native Linux`,
});

const failed = checks.filter((check) => !check.passed);
const report = {
  schema: "narada.linux.installation.e2e_gate.v1",
  status: failed.length === 0 ? "passed" : "failed",
  execution_substrate: substrate,
  native_linux_required: nativeRequired,
  wsl_is_separate_substrate: true,
  checks,
  failure_count: failed.length,
  next_action: failed.length === 0
    ? "Run the controlled fixture and operator journey commands; native CI must set NARADA_REQUIRE_NATIVE_LINUX_E2E=1."
    : "Repair failed publication or E2E prerequisites before publishing.",
};

console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) process.exit(1);
