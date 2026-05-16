export interface HostedTelemetryDeployPreflightInput {
  wranglerConfigText: string;
  env?: Record<string, string | undefined>;
  buildCommand?: string;
  deployCommand?: string;
}

export interface HostedTelemetryDeployPreflight {
  schema: "narada.site_telemetry.deploy_preflight.v0";
  status: "ready" | "blocked";
  build_command: string;
  deploy_command: string;
  live_deploy_gated: true;
  live_deploy_requires: string[];
  deploy_mutation_planned: false;
  checks: Array<{ name: string; status: "pass" | "fail"; detail?: string }>;
  missing_bindings: string[];
  placeholder_bindings: string[];
  raw_secret_values_recorded: false;
  authority_limits: string[];
}

export interface HostedTelemetrySurfaceVerificationInput {
  surfaceUrl: string;
  fetch?: typeof fetch;
}

export interface HostedTelemetrySurfaceVerification {
  schema: "narada.site_telemetry.hosted_surface_verification.v0";
  status: "verified" | "failed";
  surface_url: string;
  health_url: string;
  health_status: number | null;
  live_network_performed: true;
  cloudflare_mutation_performed: false;
  raw_secret_values_recorded: false;
  response_summary: Record<string, unknown> | null;
  authority_limits: string[];
}

const REQUIRED_KV_BINDINGS = ["NARADA_SITE_REGISTRY_KV"];
const REQUIRED_D1_BINDINGS = ["NARADA_SITE_REGISTRY_D1"];
const REQUIRED_SECRET_REFS = [
  "NARADA_SITE_REGISTRY_READ_TOKEN",
  "NARADA_SITE_REGISTRY_PUBLISH_TOKEN",
  "NARADA_SITE_REGISTRY_MESSAGE_TOKEN",
  "NARADA_SITE_REGISTRY_POLL_TOKEN",
  "NARADA_SITE_REGISTRY_LOCAL_ADMISSION_TOKEN",
  "NARADA_SITE_REGISTRY_ADMIN_TOKEN",
];

export function planHostedTelemetryDeployPreflight(input: HostedTelemetryDeployPreflightInput): HostedTelemetryDeployPreflight {
  const config = parseJsoncObject(input.wranglerConfigText);
  const checks: HostedTelemetryDeployPreflight["checks"] = [];
  const env = input.env ?? {};
  const buildCommand = input.buildCommand ?? "pnpm --filter @narada2/site-registry-cloudflare build";
  const deployCommand = input.deployCommand ?? "wrangler deploy --config packages/site-registry-cloudflare/wrangler.jsonc";

  const wranglerAuthPresent = env.CLOUDFLARE_API_TOKEN || env.WRANGLER_API_TOKEN || env.WRANGLER_AUTH_READY === "1";
  checks.push(wranglerAuthPresent
    ? { name: "wrangler_auth_reference_present", status: "pass" }
    : { name: "wrangler_auth_reference_present", status: "fail", detail: "missing_wrangler_auth_reference" });

  const kvBindings = arrayOfRecords(config.kv_namespaces);
  const d1Bindings = arrayOfRecords(config.d1_databases);
  const missingBindings = [
    ...missingNamedBindings(kvBindings, REQUIRED_KV_BINDINGS),
    ...missingNamedBindings(d1Bindings, REQUIRED_D1_BINDINGS),
  ];
  const placeholderBindings = [
    ...placeholderValues(kvBindings, "id"),
    ...placeholderValues(d1Bindings, "database_id"),
  ];

  checks.push(missingBindings.length === 0
    ? { name: "storage_bindings_declared", status: "pass" }
    : { name: "storage_bindings_declared", status: "fail", detail: missingBindings.join(",") });
  checks.push(placeholderBindings.length === 0
    ? { name: "storage_binding_ids_non_placeholder", status: "pass" }
    : { name: "storage_binding_ids_non_placeholder", status: "fail", detail: placeholderBindings.join(",") });
  checks.push({ name: "build_command_declared", status: "pass", detail: buildCommand });
  checks.push({ name: "live_deploy_requires_explicit_gate", status: "pass" });
  checks.push({ name: "secret_refs_withheld_from_config", status: "pass", detail: REQUIRED_SECRET_REFS.join(",") });

  return {
    schema: "narada.site_telemetry.deploy_preflight.v0",
    status: checks.every((check) => check.status === "pass") ? "ready" : "blocked",
    build_command: buildCommand,
    deploy_command: deployCommand,
    live_deploy_gated: true,
    live_deploy_requires: [
      "operator_capability_grant",
      "NARADA_SITE_TELEMETRY_DEPLOY_APPROVED=1",
      "non_placeholder_wrangler_config",
      "post_deploy_smoke_evidence",
    ],
    deploy_mutation_planned: false,
    checks,
    missing_bindings: missingBindings,
    placeholder_bindings: placeholderBindings,
    raw_secret_values_recorded: false,
    authority_limits: [
      "deploy_preflight_does_not_publish_or_deploy",
      "cloudflare_coordinates_are_deployment_coordinates_not_site_authority",
      "raw_secret_values_must_not_be_recorded",
    ],
  };
}

export async function verifyHostedTelemetrySurface(input: HostedTelemetrySurfaceVerificationInput): Promise<HostedTelemetrySurfaceVerification> {
  const healthUrl = new URL("/health", input.surfaceUrl).toString();
  try {
    const response = await (input.fetch ?? fetch)(healthUrl);
    const body = await safeJson(response);
    return {
      schema: "narada.site_telemetry.hosted_surface_verification.v0",
      status: response.ok ? "verified" : "failed",
      surface_url: input.surfaceUrl,
      health_url: healthUrl,
      health_status: response.status,
      live_network_performed: true,
      cloudflare_mutation_performed: false,
      raw_secret_values_recorded: false,
      response_summary: summarizeHealth(body),
      authority_limits: [
        "hosted_verification_reads_surface_only",
        "verification_does_not_mutate_cloudflare_resources",
        "health_response_does_not_prove_site_authority",
      ],
    };
  } catch (error) {
    return {
      schema: "narada.site_telemetry.hosted_surface_verification.v0",
      status: "failed",
      surface_url: input.surfaceUrl,
      health_url: healthUrl,
      health_status: null,
      live_network_performed: true,
      cloudflare_mutation_performed: false,
      raw_secret_values_recorded: false,
      response_summary: { error: error instanceof Error ? error.message : String(error) },
      authority_limits: [
        "hosted_verification_reads_surface_only",
        "verification_does_not_mutate_cloudflare_resources",
        "health_response_does_not_prove_site_authority",
      ],
    };
  }
}

function parseJsoncObject(text: string): Record<string, unknown> {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as Record<string, unknown>;
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function missingNamedBindings(bindings: Array<Record<string, unknown>>, required: string[]): string[] {
  const present = new Set(bindings.map((binding) => typeof binding.binding === "string" ? binding.binding : ""));
  return required.filter((binding) => !present.has(binding));
}

function placeholderValues(bindings: Array<Record<string, unknown>>, field: string): string[] {
  return bindings
    .filter((binding) => typeof binding.binding === "string" && typeof binding[field] === "string" && String(binding[field]).includes("<"))
    .map((binding) => String(binding.binding));
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function summarizeHealth(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return {
    schema: typeof record.schema === "string" ? record.schema : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
  };
}
