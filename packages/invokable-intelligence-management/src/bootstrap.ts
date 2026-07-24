/** Idempotent, non-secret initialization of a Site intelligence catalog. */

import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ResourceRef } from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";

import { parseLegacyRegistry } from "./legacy.js";
import { applyMigration, buildMigrationPlan, dryRunMigration } from "./migrate.js";

export const INTELLIGENCE_CATALOG_BOOTSTRAP_SCHEMA =
  "narada.invokable-intelligence.catalog-bootstrap.v1" as const;

export interface EnsureIntelligenceCatalogOptions {
  siteRoot: string;
  targetSiteId: ResourceRef | string;
  userSiteId?: ResourceRef | string;
  hostSiteId?: ResourceRef | string;
  registryDbPath?: string;
  sourceRegistryPath?: string;
  plannedAt?: string;
  validUntil?: string;
}

export interface EnsureIntelligenceCatalogResult {
  schema: typeof INTELLIGENCE_CATALOG_BOOTSTRAP_SCHEMA;
  status: "initialized" | "already_ready";
  mutation_performed: boolean;
  site_root: string;
  registry_db_path: string;
  source_registry_path: string;
  target_site: ResourceRef;
  user_site: ResourceRef;
  host_site: ResourceRef;
  counts: { add: number; update: number; unchanged: number };
  catalog_record_count: number;
  resource_count: number;
}

function siteRef(value: ResourceRef | string): ResourceRef {
  if (typeof value !== "string") return value;
  return { kind: "site", id: value.startsWith("site:") ? value : `site:${value}` };
}

function defaultBootstrapRegistryPath(): string {
  return fileURLToPath(new URL("../assets/provider-registry.bootstrap.json", import.meta.url));
}

export async function ensureIntelligenceCatalog(
  options: EnsureIntelligenceCatalogOptions,
): Promise<EnsureIntelligenceCatalogResult> {
  const siteRoot = resolve(options.siteRoot);
  const registryDbPath = resolve(options.registryDbPath ?? join(siteRoot, ".ai", "intelligence-registry.db"));
  const sourceRegistryPath = resolve(options.sourceRegistryPath ?? defaultBootstrapRegistryPath());
  const targetSite = siteRef(options.targetSiteId);
  const userSite = siteRef(options.userSiteId ?? targetSite);
  const hostSite = siteRef(options.hostSiteId ?? targetSite);

  await mkdir(dirname(registryDbPath), { recursive: true });
  const store = await SqliteRegistryStore.open(registryDbPath);
  try {
    const [existingCatalogRecords, existingResources, existingResiduals] = await Promise.all([
      store.listCatalogRecords(),
      store.listResources(),
      store.listCatalogResiduals(),
    ]);

    // Bootstrap is a first-use initializer, not an update authority. Once a
    // catalog exists, source moves or metadata edits must not rewrite its
    // immutable envelopes during an unrelated launch.
    if (existingCatalogRecords.length > 0) {
      return {
        schema: INTELLIGENCE_CATALOG_BOOTSTRAP_SCHEMA,
        status: "already_ready",
        mutation_performed: false,
        site_root: siteRoot,
        registry_db_path: registryDbPath,
        source_registry_path: sourceRegistryPath,
        target_site: targetSite,
        user_site: userSite,
        host_site: hostSite,
        counts: {
          add: 0,
          update: 0,
          unchanged: existingCatalogRecords.length + existingResiduals.length,
        },
        catalog_record_count: existingCatalogRecords.length,
        resource_count: existingResources.length,
      };
    }

    const plannedAt = options.plannedAt ?? (await stat(sourceRegistryPath)).mtime.toISOString();
    const legacy = parseLegacyRegistry(JSON.parse(await readFile(sourceRegistryPath, "utf8")) as unknown);
    const plan = {
      targetSite,
      userSite,
      hostSite,
    };
    const migrationPlan = buildMigrationPlan(legacy, plan, {
      reference: sourceRegistryPath,
      plannedAt,
      ...(options.validUntil ? { validUntil: options.validUntil } : {}),
    });
    const dryRun = await dryRunMigration(store, migrationPlan);
    const mutationPerformed = dryRun.counts.add > 0 || dryRun.counts.update > 0;
    if (mutationPerformed) {
      await applyMigration(store, migrationPlan);
    }
    const [catalogRecords, resources] = await Promise.all([
      store.listCatalogRecords(),
      store.listResources(),
    ]);
    return {
      schema: INTELLIGENCE_CATALOG_BOOTSTRAP_SCHEMA,
      status: mutationPerformed ? "initialized" : "already_ready",
      mutation_performed: mutationPerformed,
      site_root: siteRoot,
      registry_db_path: registryDbPath,
      source_registry_path: sourceRegistryPath,
      target_site: targetSite,
      user_site: userSite,
      host_site: hostSite,
      counts: dryRun.counts,
      catalog_record_count: catalogRecords.length,
      resource_count: resources.length,
    };
  } finally {
    await store.close();
  }
}
