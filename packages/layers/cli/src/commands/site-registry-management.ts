import type {
  RegistryAlias,
  RegistryManagementRequest,
  RegistryManagementResult,
  RegistrySiteRecord,
  RegistrySourceObservation,
  SiteRegistry,
  SiteVariant,
} from "@narada2/windows-site";
import {
  openRegistryDb,
  resolveRegistryDbPathByLocus,
} from "@narada2/windows-site";
import { listLaunchRegistrySites } from "../lib/site-root-resolver.js";
import type { CommandContext } from "../lib/command-wrapper.js";
import { ExitCode } from "../lib/exit-codes.js";
import { formattedResult, type CliFormat } from "../lib/cli-output.js";
import {
  lifecycleEvidence,
  registryManagementLifecycle,
} from "./site-registry-bootstrap-lifecycle.js";

const MANAGEMENT_SCHEMA = "narada.site_registry.management.v0" as const;
const DEFAULT_ACTOR = process.env.NARADA_AGENT_ID ?? "operator";

export interface SiteRegistryCommandOptions {
  format: CliFormat;
  verbose?: boolean;
}

export interface SiteRegistryShowOptions extends SiteRegistryCommandOptions {
  reference: string;
}

export interface SiteRegistryDiscoverOptions extends SiteRegistryCommandOptions {
  source?: "filesystem" | "launch_registry" | "all";
  root?: string;
  actor?: string;
  additionalCandidates?: RegistryManagementRequest[];
  apply?: boolean;
  dryRun?: boolean;
}

export interface SiteRegistryAddOptions extends SiteRegistryCommandOptions {
  siteId: string;
  root: string;
  variant?: string;
  substrate?: string;
  aimJson?: string;
  controlEndpoint?: string;
  alias?: string[];
  source?: string;
  sourceRef?: string;
  reason?: string;
  reAdmit?: boolean;
  actor?: string;
  apply?: boolean;
  dryRun?: boolean;
}

export interface SiteRegistryEditOptions extends SiteRegistryCommandOptions {
  reference: string;
  root?: string;
  variant?: string;
  substrate?: string;
  aimJson?: string;
  controlEndpoint?: string;
  clearAimJson?: boolean;
  clearControlEndpoint?: boolean;
  clearAliases?: boolean;
  alias?: string[];
  source?: string;
  sourceRef?: string;
  reason?: string;
  actor?: string;
  expectedRevision?: number;
  apply?: boolean;
  dryRun?: boolean;
}

export interface SiteRegistryStateOptions extends SiteRegistryCommandOptions {
  reference: string;
  reason?: string;
  actor?: string;
  expectedRevision?: number;
  confirmSiteId?: string;
  apply?: boolean;
  dryRun?: boolean;
}

interface OpenRegistryResult {
  registry: SiteRegistry;
  registryPath: string;
}

async function openUserRegistry(): Promise<OpenRegistryResult> {
  const registryPath = resolveRegistryDbPathByLocus({ authorityLocus: "user", variant: "native" });
  const db = await openRegistryDb(registryPath);
  const { SiteRegistry } = await import("@narada2/windows-site");
  return { registry: new SiteRegistry(db), registryPath };
}

async function withUserRegistry<T>(callback: (opened: OpenRegistryResult) => T | Promise<T>): Promise<T> {
  const opened = await openUserRegistry();
  try {
    return await callback(opened);
  } finally {
    opened.registry.close();
  }
}

function applyMode(apply: boolean | undefined, dryRun: boolean | undefined): boolean {
  return apply === true && dryRun !== true;
}

function modeRefusal(apply: boolean | undefined, dryRun: boolean | undefined): string[] {
  return apply === true && dryRun === true ? ["apply_and_dry_run_are_mutually_exclusive"] : [];
}

function asSiteVariant(value: string | undefined): SiteVariant | undefined {
  if (value === undefined) return undefined;
  if (isSiteVariant(value)) {
    return value;
  }
  throw new Error(`invalid_variant: ${value}`);
}

function isSiteVariant(value: string): value is SiteVariant {
  return value === "native"
    || value === "wsl"
    || value === "cloudflare"
    || value === "linux-user"
    || value === "linux-system";
}

function metadataRefusals(variant: string | undefined, aimJson: string | undefined): string[] {
  const refusals: string[] = [];
  if (variant !== undefined && !isSiteVariant(variant)) refusals.push(`invalid_variant: ${variant}`);
  if (aimJson !== undefined) {
    try {
      JSON.parse(aimJson);
    } catch {
      refusals.push("invalid_aim_json");
    }
  }
  return refusals;
}

function sourceObservation(kind: string | undefined, ref: string | undefined): RegistrySourceObservation | undefined {
  if (!kind) return undefined;
  return {
    kind,
    ref: ref?.trim() || "cli",
    observedAt: new Date().toISOString(),
  };
}

function serializeAudit(record: {
  eventId: string;
  siteId: string;
  operation: string;
  actor: string;
  reason: string | null;
  occurredAt: string;
  beforeJson: string | null;
  afterJson: string | null;
  status: string;
}): Record<string, unknown> {
  return {
    event_id: record.eventId,
    site_id: record.siteId,
    operation: record.operation,
    actor: record.actor,
    reason: record.reason,
    occurred_at: record.occurredAt,
    before_json: record.beforeJson,
    after_json: record.afterJson,
    status: record.status,
  };
}

function aliases(values: string[] | undefined, source: string): RegistryAlias[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.filter((value) => value.trim()).map((value) => ({ value: value.trim(), source }));
}

function normalizedAimJson(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const parsed: unknown = JSON.parse(value);
  return JSON.stringify(parsed);
}

function serializeSite(site: RegistrySiteRecord | null): Record<string, unknown> | null {
  if (!site) return null;
  return {
    site_id: site.siteId,
    site_root: site.siteRoot,
    variant: site.variant,
    substrate: site.substrate,
    aim_json: site.aimJson,
    control_endpoint: site.controlEndpoint,
    last_seen_at: site.lastSeenAt,
    created_at: site.createdAt,
    updated_at: site.updatedAt,
    lifecycle_status: site.lifecycleStatus,
    observation_status: site.observationStatus,
    sources: site.sources.map((source) => ({
      kind: source.kind,
      ref: source.ref,
      observed_at: source.observedAt,
    })),
    aliases: site.aliases.map((alias) => ({
      value: alias.value,
      source: alias.source,
    })),
    revision: site.revision,
    retired_at: site.retiredAt,
    retire_reason: site.retireReason,
  };
}

function serializeManagement(
  result: RegistryManagementResult,
  registryPath: string,
): Record<string, unknown> {
  const status = String(result.status);
  const outcome = result.refusals.length > 0 || result.conflicts.length > 0
    ? "refused"
    : status === "advisory"
      ? "advisory"
      : status === "planned"
        ? "planned"
        : "applied";
  const lifecycle = registryManagementLifecycle({
    apply: result.mutationPerformed || status === "applied",
    outcome,
  });
  return {
    schema: MANAGEMENT_SCHEMA,
    status: result.status,
    operation: result.operation,
    mutation_performed: result.mutationPerformed,
    site_id: result.siteId,
    registry_path: registryPath,
    catalog_source: "user_site_site_registry",
    before: serializeSite(result.before),
    after: serializeSite(result.after),
    changes: result.changes,
    conflicts: result.conflicts,
    refusals: result.refusals,
    audit_ref: result.auditRef,
    confirmation_required: result.operation === "purge" ? result.before?.siteId ?? null : null,
    ...lifecycleEvidence(lifecycle),
  };
}

function clip(value: unknown, width: number): string {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ");
  return text.length > width ? `${text.slice(0, Math.max(0, width - 3))}...` : text.padEnd(width);
}

function table(headers: Array<[string, number]>, rows: string[][]): string {
  const header = headers.map(([label, width]) => clip(label, width)).join(" | ");
  const divider = headers.map(([, width]) => "-".repeat(width)).join("-+-");
  const body = rows.map((row) => row.map((value, index) => clip(value, headers[index]?.[1] ?? 20)).join(" | ")).join("\n");
  return [header, divider, body].filter(Boolean).join("\n");
}

function humanSiteList(sites: RegistrySiteRecord[]): string {
  if (sites.length === 0) return "No Sites registered.";
  return table(
    [
      ["Site ID", 22],
      ["Root", 42],
      ["Lifecycle", 10],
      ["Observation", 12],
      ["Sources", 20],
      ["Last seen", 24],
      ["Aliases", 20],
    ],
    sites.map((site) => [
      site.siteId,
      site.siteRoot,
      site.lifecycleStatus,
      site.observationStatus,
      site.sources.map((source) => source.kind).join(",") || "-",
      site.lastSeenAt ?? "never",
      site.aliases.map((alias) => alias.value).join(",") || "-",
    ]),
  );
}

function humanManagement(result: Record<string, unknown>): string {
  const lines = [
    `${String(result.operation)}: ${String(result.status)}`,
    `site_id: ${String(result.site_id)}`,
    `mutation_performed: ${String(result.mutation_performed)}`,
    `changes: ${JSON.stringify(result.changes)}`,
  ];
  const conflicts = result.conflicts as unknown[] | undefined;
  const refusals = result.refusals as unknown[] | undefined;
  if (conflicts && conflicts.length > 0) lines.push(`conflicts: ${JSON.stringify(conflicts)}`);
  if (refusals && refusals.length > 0) lines.push(`refusals: ${JSON.stringify(refusals)}`);
  if (result.confirmation_required) lines.push(`confirmation_required: ${String(result.confirmation_required)}`);
  if (result.audit_ref) lines.push(`audit_ref: ${String(result.audit_ref)}`);
  return lines.join("\n");
}

function envelope(
  result: Record<string, unknown>,
  format: CliFormat,
  human: string,
  exitCode: ExitCode = ExitCode.SUCCESS,
): { exitCode: ExitCode; result: unknown } {
  return { exitCode, result: formattedResult(result, human, format) };
}

function refusalResult(
  operation: string,
  siteId: string,
  registryPath: string,
  refusals: string[],
  format: CliFormat,
): { exitCode: ExitCode; result: unknown } {
  const result = {
    schema: MANAGEMENT_SCHEMA,
    status: "refused",
    operation,
    mutation_performed: false,
    site_id: siteId,
    registry_path: registryPath,
    catalog_source: "user_site_site_registry",
    before: null,
    after: null,
    changes: [],
    conflicts: [],
    refusals,
    audit_ref: null,
    ...lifecycleEvidence(registryManagementLifecycle({ apply: false, outcome: "refused" })),
  };
  return envelope(result, format, humanManagement(result), ExitCode.INVALID_CONFIG);
}

export async function sitesRegistryListCommand(
  options: SiteRegistryCommandOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return withUserRegistry(({ registry, registryPath }) => {
    const sites = registry.listManagedSites();
    const result = {
      schema: MANAGEMENT_SCHEMA,
      status: "success",
      operation: "list",
      mutation_performed: false,
      registry_path: registryPath,
      catalog_source: "user_site_site_registry",
      count: sites.length,
      sites: sites.map(serializeSite),
    };
    return envelope(result, options.format, humanSiteList(sites));
  });
}

export async function sitesRegistryShowCommand(
  options: SiteRegistryShowOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return withUserRegistry(({ registry, registryPath }) => {
    const site = registry.getManagedSite(options.reference);
    if (!site) {
      return refusalResult("show", options.reference, registryPath, ["site_not_found"], options.format);
    }
    const audit = registry.getManagementAuditRecords(site.siteId, 20);
    const nextActions = site.lifecycleStatus === "retired"
      ? ["restore", "purge"]
      : ["edit", "retire"];
    const result = {
      schema: MANAGEMENT_SCHEMA,
      status: "success",
      operation: "show",
      mutation_performed: false,
      site_id: site.siteId,
      registry_path: registryPath,
      catalog_source: "user_site_site_registry",
      site: serializeSite(site),
      management_audit: audit.map(serializeAudit),
      next_actions: nextActions,
    };
    return envelope(result, options.format, `${humanManagement(result)}\nnext_actions: ${nextActions.join(", ")}`);
  });
}

function requestForAdd(options: SiteRegistryAddOptions, apply: boolean): RegistryManagementRequest {
  return {
    operation: "add",
    siteId: options.siteId,
    actor: options.actor?.trim() || DEFAULT_ACTOR,
    siteRoot: options.root,
    variant: asSiteVariant(options.variant),
    substrate: options.substrate,
    aimJson: normalizedAimJson(options.aimJson),
    controlEndpoint: options.controlEndpoint,
    aliases: aliases(options.alias, "manual"),
    source: sourceObservation(options.source ?? "manual", options.sourceRef),
    reason: options.reason,
    reAdmit: options.reAdmit,
    apply,
  };
}

function requestForEdit(options: SiteRegistryEditOptions, apply: boolean): RegistryManagementRequest {
  return {
    operation: "edit",
    siteId: options.reference,
    actor: options.actor?.trim() || DEFAULT_ACTOR,
    reason: options.reason,
    siteRoot: options.root,
    variant: asSiteVariant(options.variant),
    substrate: options.substrate,
    aimJson: normalizedAimJson(options.aimJson),
    controlEndpoint: options.controlEndpoint,
    clearAimJson: options.clearAimJson,
    clearControlEndpoint: options.clearControlEndpoint,
    clearAliases: options.clearAliases,
    aliases: aliases(options.alias, "manual"),
    source: sourceObservation(options.source, options.sourceRef),
    expectedRevision: options.expectedRevision,
    apply,
  };
}

async function executeManagementRequest(
  request: RegistryManagementRequest,
  format: CliFormat,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  return withUserRegistry(({ registry, registryPath }) => {
    const managed = registry.manageSite(request);
    const result = serializeManagement(managed, registryPath);
    const exitCode = managed.status === "refused" ? ExitCode.INVALID_CONFIG : ExitCode.SUCCESS;
    return envelope(result, format, humanManagement(result), exitCode);
  });
}

export async function sitesRegistryAddCommand(
  options: SiteRegistryAddOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const modeRefusals = modeRefusal(options.apply, options.dryRun);
  if (modeRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult("add", options.siteId, registryPath, modeRefusals, options.format));
  const inputRefusals = metadataRefusals(options.variant, options.aimJson);
  if (inputRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult("add", options.siteId, registryPath, inputRefusals, options.format));
  return executeManagementRequest(requestForAdd(options, applyMode(options.apply, options.dryRun)), options.format);
}

export async function sitesRegistryEditCommand(
  options: SiteRegistryEditOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const modeRefusals = modeRefusal(options.apply, options.dryRun);
  if (modeRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult("edit", options.reference, registryPath, modeRefusals, options.format));
  const inputRefusals = metadataRefusals(options.variant, options.aimJson);
  if (inputRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult("edit", options.reference, registryPath, inputRefusals, options.format));
  return executeManagementRequest(requestForEdit(options, applyMode(options.apply, options.dryRun)), options.format);
}

export async function sitesRegistryStateCommand(
  operation: "retire" | "restore" | "purge",
  options: SiteRegistryStateOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const modeRefusals = modeRefusal(options.apply, options.dryRun);
  if (modeRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult(operation, options.reference, registryPath, modeRefusals, options.format));
  return executeManagementRequest({
    operation,
    siteId: options.reference,
    actor: options.actor?.trim() || DEFAULT_ACTOR,
    reason: options.reason,
    expectedRevision: options.expectedRevision,
    confirmSiteId: options.confirmSiteId,
    apply: applyMode(options.apply, options.dryRun),
  }, options.format);
}

function sameRoot(left: string, right: string): boolean {
  return left.replace(/[\\/]+$/, "").replaceAll("\\", "/").toLowerCase()
    === right.replace(/[\\/]+$/, "").replaceAll("\\", "/").toLowerCase();
}

function filterRoot(root: string | undefined, candidateRoot: string): boolean {
  return !root || sameRoot(root, candidateRoot);
}

function requestSources(request: RegistryManagementRequest): RegistrySourceObservation[] {
  return [
    ...(request.source ? [request.source] : []),
    ...(request.sources ?? []),
  ];
}

function mergeRequestEvidence(target: RegistryManagementRequest, incoming: RegistryManagementRequest): void {
  const sourceMap = new Map<string, RegistrySourceObservation>();
  for (const source of [...requestSources(target), ...requestSources(incoming)]) {
    sourceMap.set(`${source.kind}:${source.ref}`, source);
  }
  target.sources = [...sourceMap.values()];
  target.aliases = [
    ...(target.aliases ?? []),
    ...(incoming.aliases ?? []),
  ].filter((alias, index, aliases) => aliases.findIndex((candidate) => candidate.value.toLowerCase() === alias.value.toLowerCase()) === index);
}

function mergeDiscoveryRequests(requests: RegistryManagementRequest[]): RegistryManagementRequest[] {
  const merged: RegistryManagementRequest[] = [];
  for (const request of requests) {
    const existing = merged.find((candidate) =>
      (request.siteRoot && candidate.siteRoot && sameRoot(request.siteRoot, candidate.siteRoot))
      || (request.siteId === candidate.siteId && (!request.siteRoot || !candidate.siteRoot)),
    );
    if (!existing) {
      merged.push(request);
      continue;
    }

    if (existing.operation === "add" && request.operation === "add") {
      if (existing.siteId !== request.siteId) {
        existing.aliases = [
          ...(existing.aliases ?? []),
          { value: request.siteId, source: "discovery" },
        ];
      }
      mergeRequestEvidence(existing, request);
      continue;
    }

    if (existing.operation === "add" && request.operation === "edit") {
      mergeRequestEvidence(existing, request);
      continue;
    }

    mergeRequestEvidence(existing, request);
  }
  return merged;
}

function filesystemRequests(registry: SiteRegistry, root: string | undefined, actor: string, apply: boolean): RegistryManagementRequest[] {
  const requests: RegistryManagementRequest[] = [];
  for (const variant of ["native", "wsl"] as const) {
    for (const site of registry.scanSites(variant)) {
      if (!filterRoot(root, site.siteRoot)) continue;
      requests.push({
        operation: "add",
        siteId: site.siteId,
        actor,
        siteRoot: site.siteRoot,
        variant: site.variant,
        substrate: site.substrate,
        aimJson: site.aimJson,
        source: { kind: "filesystem", ref: site.siteRoot, observedAt: new Date().toISOString() },
        apply,
      });
    }
  }
  return requests;
}

function launchRegistryRequests(
  registry: SiteRegistry,
  root: string | undefined,
  actor: string,
  apply: boolean,
  ignored: { count: number },
): RegistryManagementRequest[] {
  const requests: RegistryManagementRequest[] = [];
  const managedSites = registry.listManagedSites();
  for (const candidate of listLaunchRegistrySites()) {
    if (!candidate.site_id || !candidate.site_root) {
      ignored.count += 1;
      continue;
    }
    if (!filterRoot(root, candidate.site_root)) continue;
    const rootOwner = managedSites.find((site) => sameRoot(site.siteRoot, candidate.site_root));
    if (rootOwner && rootOwner.siteId !== candidate.site_id) {
      requests.push({
        operation: "edit",
        siteId: rootOwner.siteId,
        actor,
        aliases: [{ value: candidate.site_id, source: "launch_registry" }],
        source: { kind: "launch_registry", ref: candidate.site_root, observedAt: new Date().toISOString() },
        reason: "preserve_launch_registry_alias",
        apply,
      });
      continue;
    }
    requests.push({
      operation: "add",
      siteId: candidate.site_id,
      actor,
      siteRoot: candidate.site_root,
      variant: "native",
      substrate: "windows-launch-registry",
      source: { kind: "launch_registry", ref: candidate.site_root, observedAt: new Date().toISOString() },
      apply,
    });
  }
  return requests;
}

export async function sitesRegistryDiscoverCommand(
  options: SiteRegistryDiscoverOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const modeRefusals = modeRefusal(options.apply, options.dryRun);
  if (modeRefusals.length > 0) return withUserRegistry(({ registryPath }) => refusalResult("discover", "discover", registryPath, modeRefusals, options.format));

  return withUserRegistry(({ registry, registryPath }) => {
    const apply = applyMode(options.apply, options.dryRun);
    const actor = options.actor?.trim() || DEFAULT_ACTOR;
    const source = options.source ?? "all";
    const ignored = { count: 0 };
    const requests = mergeDiscoveryRequests([
      ...(source === "filesystem" || source === "all" ? filesystemRequests(registry, options.root, actor, apply) : []),
      ...(source === "launch_registry" || source === "all" ? launchRegistryRequests(registry, options.root, actor, apply, ignored) : []),
      ...(options.additionalCandidates ?? []).map((request) => ({ ...request, apply })),
    ]);
    const results = requests.map((request) => registry.manageSite(request));
    const serialized = results.map((result) => serializeManagement(result, registryPath));
    const conflicts = serialized.flatMap((result) => result.conflicts as unknown[]);
    const refusals = serialized.flatMap((result) => result.refusals as unknown[]);
    const added = serialized.filter((result) => result.before === null && result.after !== null).map((result) => result.site_id);
    const updated = serialized.filter((result) => result.before !== null && result.after !== null && (result.changes as unknown[]).length > 0).map((result) => result.site_id);
    const unchanged = serialized.filter((result) =>
      result.before !== null
      && result.after !== null
      && (result.changes as unknown[]).length === 0
      && !(result.refusals as unknown[]).length
      && !(result.conflicts as unknown[]).length,
    ).map((result) => result.site_id);
    const retiredSourcePresent = serialized.filter((result) =>
      (result.refusals as unknown[]).some((refusal) => refusal === "retired_record_requires_restore_or_re_admit"),
    ).length;
    const actionableRefusals = refusals.filter((refusal) => refusal !== "retired_record_requires_restore_or_re_admit");
    const auditRefs = serialized
      .map((entry) => entry.audit_ref)
      .filter((auditRef): auditRef is string => typeof auditRef === "string");
    const status = actionableRefusals.length > 0 || conflicts.length > 0
      ? "conflict"
      : retiredSourcePresent > 0
        ? "advisory"
        : apply
          ? "applied"
          : "planned";
    const lifecycleOutcome = status === "conflict"
      ? "refused"
      : status === "advisory"
        ? "advisory"
        : status === "applied"
          ? "applied"
          : "planned";
    const result = {
      schema: MANAGEMENT_SCHEMA,
      status,
      operation: "discover",
      mutation_performed: apply && serialized.some((entry) => entry.mutation_performed === true),
      registry_path: registryPath,
      catalog_source: "user_site_site_registry",
      source,
      root_filter: options.root ?? null,
      counts: {
        added: added.length,
        updated: updated.length,
        unchanged: unchanged.length,
        ignored: ignored.count,
        retired_source_present: retiredSourcePresent,
        conflicted: conflicts.length,
      },
      added,
      updated,
      unchanged,
      entries: serialized,
      conflicts,
      refusals,
      audit_ref: auditRefs.length === 1 ? auditRefs[0] : null,
      audit_refs: auditRefs,
      ...lifecycleEvidence(registryManagementLifecycle({ apply, outcome: lifecycleOutcome })),
    };
    const human = [
      `discover: ${String(result.status)}`,
      `source: ${source}`,
      `added: ${added.length}, updated: ${updated.length}, unchanged: ${unchanged.length}, ignored: ${ignored.count}, retired: ${retiredSourcePresent}, conflicts: ${conflicts.length}`,
      requests.length === 0 ? "No discovery candidates." : humanManagement(serialized[0] ?? result),
    ].join("\n");
    return envelope(result, options.format, human, conflicts.length > 0 || actionableRefusals.length > 0 ? ExitCode.INVALID_CONFIG : ExitCode.SUCCESS);
  });
}

