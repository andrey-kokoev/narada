/** narada-intelligence CLI: file-referenced JSON in, canonical management JSON out. */

import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  CanonicalCatalogRecord,
  InvocationIntent,
  MaterializationAdmission,
  MaterializationEnvelope,
  MaterializationRevocation,
} from "@narada2/invokable-intelligence-contract";
import { SqliteMaterializationStore } from "@narada2/invokable-intelligence-materialization";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";
import type { ResolverContext } from "@narada2/invokable-intelligence-resolver";

import { parseLegacyRegistry } from "./legacy.js";
import { applyMigration, buildMigrationPlan, dryRunMigration } from "./migrate.js";
import {
  IntelligenceManagementService,
  ManagementError,
  managementErrorResult,
} from "./service.js";
import type {
  ManagementCollection,
  ManagementMutationContext,
  ManagementRequest,
  ManagementResult,
  ManagementSession,
} from "./service.js";

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string | boolean>;
}

const COLLECTIONS = new Set<ManagementCollection>([
  "resources",
  "offerings",
  "assertions",
  "policies",
  "catalog-records",
  "routes",
  "topologies",
  "authority-statements",
  "access",
  "materializations",
  "materialization-audit",
]);

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0], positional: positional.slice(1), flags };
}

function requiredFlag(flags: Map<string, string | boolean>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new ManagementError("argument-required", `--${name} <value> is required.`);
  }
  return value;
}

function optionalFlag(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function siteRefArg(flags: Map<string, string | boolean>, name: string): { kind: "site"; id: string } {
  const value = requiredFlag(flags, name);
  if (!value.startsWith("site:")) {
    throw new ManagementError("invalid-site-ref", `--${name} must be an explicit site:<slug> reference.`);
  }
  return { kind: "site", id: value };
}

function integerFlag(flags: Map<string, string | boolean>, name: string): number | undefined {
  const value = optionalFlag(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ManagementError("invalid-argument", `--${name} must be an integer.`);
  return parsed;
}

async function readJsonFile<T>(path: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    throw new ManagementError("invalid-input-reference", `${label} must reference a readable JSON file.`);
  }
}

async function jsonFlag<T>(flags: Map<string, string | boolean>, name: string): Promise<T> {
  return readJsonFile<T>(requiredFlag(flags, name), `--${name}`);
}

function printResult(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function exitFor(result: ManagementResult): number {
  return result.ok ? 0 : 2;
}

function listFilter(flags: Map<string, string | boolean>): Record<string, unknown> {
  const mappings = [
    ["kind", "kind"],
    ["locus", "locus"],
    ["site", "siteId"],
    ["family", "family"],
    ["name", "name"],
    ["subject", "subjectId"],
    ["record-kind", "recordKind"],
    ["record-id", "recordId"],
    ["authority-locus", "authorityLocus"],
    ["destination-site", "destinationSiteId"],
    ["resolver", "resolver"],
    ["status", "status"],
    ["projection-key", "projectionKey"],
    ["audit-operation", "operation"],
    ["outcome", "outcome"],
  ] as const;
  return Object.fromEntries(mappings.flatMap(([flag, key]) => {
    const value = optionalFlag(flags, flag);
    return value === undefined ? [] : [[key, value]];
  }));
}

async function canonicalRequest(
  command: string,
  positional: string[],
  flags: Map<string, string | boolean>,
): Promise<ManagementRequest> {
  switch (command) {
    case "list": {
      const collection = positional[0] as ManagementCollection | undefined;
      if (!collection || !COLLECTIONS.has(collection)) {
        throw new ManagementError("invalid-collection", "list requires a canonical management collection.");
      }
      const filter = optionalFlag(flags, "filter")
        ? await jsonFlag<Record<string, unknown>>(flags, "filter")
        : listFilter(flags);
      return {
        operation: "list",
        collection,
        ...(Object.keys(filter).length ? { filter } : {}),
        page: {
          ...(integerFlag(flags, "offset") !== undefined ? { offset: integerFlag(flags, "offset") } : {}),
          ...(integerFlag(flags, "limit") !== undefined ? { limit: integerFlag(flags, "limit") } : {}),
        },
      };
    }
    case "show": {
      const entity = positional[0];
      const id = positional[1];
      if (!entity || !["resource", "assertion", "policy", "catalog-record", "materialization"].includes(entity) || !id) {
        throw new ManagementError("invalid-show-request", "show requires <entity> <id>.");
      }
      return { operation: "show", entity: entity as "resource" | "assertion" | "policy" | "catalog-record" | "materialization", id };
    }
    case "validate":
      return { operation: "validate" };
    case "explain-resolution":
      return {
        operation: "explain-resolution",
        resolver: requiredFlag(flags, "resolver") as "local" | "cloudflare",
        intent: await jsonFlag<InvocationIntent>(flags, "intent"),
        context: await jsonFlag<ResolverContext>(flags, "context"),
      };
    case "admit-catalog-record":
      return {
        operation: "admit-catalog-record",
        record: await jsonFlag<CanonicalCatalogRecord>(flags, "record"),
        context: await jsonFlag<ManagementMutationContext>(flags, "context"),
      };
    case "materialize":
    case "refresh":
      return {
        operation: command,
        envelope: await jsonFlag<MaterializationEnvelope>(flags, "envelope"),
        admission: await jsonFlag<MaterializationAdmission>(flags, "admission"),
        statement_record: await jsonFlag<CanonicalCatalogRecord>(flags, "statement-record"),
        payload_record: await jsonFlag<CanonicalCatalogRecord>(flags, "payload-record"),
        context: await jsonFlag<ManagementMutationContext>(flags, "context"),
      };
    case "reject-materialization":
      return {
        operation: command,
        envelope: await jsonFlag<MaterializationEnvelope>(flags, "envelope"),
        admission: await jsonFlag<MaterializationAdmission>(flags, "admission"),
        context: await jsonFlag<ManagementMutationContext>(flags, "context"),
      };
    case "revoke-materialization":
      return {
        operation: "revoke-materialization",
        revocation: await jsonFlag<MaterializationRevocation>(flags, "revocation"),
        context: await jsonFlag<ManagementMutationContext>(flags, "context"),
      };
    case "inspect-materialization":
    case "explain-materialization": {
      const projectionKey = optionalFlag(flags, "projection-key");
      const envelopeId = optionalFlag(flags, "envelope-id");
      return {
        operation: command,
        ...(projectionKey ? { projection_key: projectionKey } : {}),
        ...(envelopeId ? { envelope_id: envelopeId } : {}),
      };
    }
    default:
      throw new ManagementError("unsupported-operation", `Unknown canonical management command: ${command}.`);
  }
}

const USAGE = `narada-intelligence — canonical invokable-intelligence management

Usage: narada-intelligence [--db <path>] [--materialization-db <path>] [--owning-site site:S] <command>

Canonical commands (all JSON output):
  list <collection> [--filter <file.json>] [--offset N] [--limit N]
  show resource|assertion|policy|catalog-record|materialization <id>
  validate
  explain-resolution --resolver local|cloudflare --intent <file.json> --context <resolver-context.json>
  admit-catalog-record --record <file.json> --context <file.json>
  materialize|refresh --envelope <file.json> --admission <file.json> --statement-record <file.json> --payload-record <file.json> --context <file.json>
  reject-materialization --envelope <file.json> --admission <file.json> --context <file.json>
  revoke-materialization --revocation <file.json> --context <file.json>
  inspect-materialization|explain-materialization (--projection-key <key> | --envelope-id <id>)

Migration command (temporary cutover surface):
  migrate --registry <provider-registry.json> --target site:S --user site:S --host site:S [--planned-at ISO] [--apply]

Canonical payloads and mutation contexts are accepted only through JSON file references, never as command-line JSON.`;

async function ensureDatabaseParent(path: string): Promise<void> {
  if (path !== ":memory:") await mkdir(dirname(path), { recursive: true });
}

export async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  if (!command || command === "help" || flags.has("help")) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  const dbPath = optionalFlag(flags, "db") ?? ".ai/intelligence-registry.db";
  const materializationDbPath = optionalFlag(flags, "materialization-db") ?? dbPath;
  let store: SqliteRegistryStore | undefined;
  let materialization: SqliteMaterializationStore | undefined;
  try {
    await ensureDatabaseParent(dbPath);
    await ensureDatabaseParent(materializationDbPath);
    store = await SqliteRegistryStore.open(dbPath);
    materialization = await SqliteMaterializationStore.open(materializationDbPath);
    const session: ManagementSession = {
      store,
      materialization,
      owningSite: optionalFlag(flags, "owning-site")
        ? siteRefArg(flags, "owning-site")
        : { kind: "site", id: "site:local" },
    };

    if (command === "migrate") {
      const registryPath = requiredFlag(flags, "registry");
      const legacy = parseLegacyRegistry(await readJsonFile<unknown>(registryPath, "--registry"));
      const loci = {
        targetSite: siteRefArg(flags, "target"),
        userSite: siteRefArg(flags, "user"),
        hostSite: siteRefArg(flags, "host"),
      };
      const plannedAt = optionalFlag(flags, "planned-at") ?? (await stat(registryPath)).mtime.toISOString();
      const plan = buildMigrationPlan(legacy, loci, { reference: registryPath, plannedAt });
      const migration = flags.has("apply") ? await applyMigration(store, plan) : await dryRunMigration(store, plan);
      printResult({ applied: flags.has("apply"), planned_at: plannedAt, counts: migration.counts, diff: migration.diff });
      return 0;
    }

    const response = await new IntelligenceManagementService(session).execute(
      await canonicalRequest(command, positional, flags),
    );
    printResult(response);
    return exitFor(response);
  } catch (error) {
    printResult(managementErrorResult(error));
    return 2;
  } finally {
    await Promise.allSettled([
      ...(materialization ? [materialization.close()] : []),
      ...(store ? [store.close()] : []),
    ]);
  }
}
