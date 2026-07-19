/**
 * narada-intelligence CLI. Thin wrapper over the management operations;
 * JSON in, JSON out. Dry-run is the default for migration; --apply writes.
 */

import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";

import type { InvocationIntent } from "@narada2/invokable-intelligence-contract";
import { SqliteRegistryStore } from "@narada2/invokable-intelligence-registry";

import { projectLegacyRegistry } from "./compat.js";
import { parseLegacyRegistry } from "./legacy.js";
import { applyMigration, buildMigrationPlan, dryRunMigration } from "./migrate.js";
import { explainResolution, listAssertions, listPolicies, listResources, showResource, validateStore } from "./operations.js";
import type { ManagementSession } from "./operations.js";

interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Map<string, string | boolean>;
}

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

function siteRefArg(flags: Map<string, string | boolean>, name: string): { kind: "site"; id: string } {
  const value = flags.get(name);
  if (typeof value !== "string" || !value.startsWith("site:")) {
    throw new Error(`--${name} site:<slug> is required`);
  }
  return { kind: "site", id: value };
}

const USAGE = `narada-intelligence — intelligence catalog and policy management

Usage: narada-intelligence [--db <path>] <command> [args]

Commands:
  list resources|assertions|policies [--kind K] [--locus L] [--site S] [--family F]
  show <resource-id>
  validate
  explain --intent <file.json> --target site:S --user site:S --host site:S [--time ISO]
  migrate --registry <provider-registry.json> --target site:S --user site:S --host site:S [--apply]
  compat                      Read-only legacy provider-registry projection (temporary)

Defaults: --db .ai/intelligence-registry.db; migrate is dry-run unless --apply.`;

export async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  if (!command || command === "help" || flags.has("help")) {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  const dbPath = typeof flags.get("db") === "string" ? (flags.get("db") as string) : ".ai/intelligence-registry.db";
  if (dbPath !== ":memory:") {
    await mkdir(dirname(dbPath), { recursive: true });
  }
  const store = await SqliteRegistryStore.open(dbPath);
  const session: ManagementSession = {
    store,
    owningSite: typeof flags.get("owning-site") === "string"
      ? { kind: "site", id: flags.get("owning-site") as string }
      : { kind: "site", id: "site:local" },
  };
  try {
    switch (command) {
      case "list": {
        const [what] = positional;
        const siteFilter = typeof flags.get("site") === "string" ? { siteId: flags.get("site") as string } : {};
        if (what === "resources") {
          console.log(JSON.stringify(await listResources(session, typeof flags.get("kind") === "string" ? { kind: flags.get("kind") as never } : undefined), null, 2));
        } else if (what === "assertions") {
          console.log(JSON.stringify(await listAssertions(session, {
            ...(typeof flags.get("locus") === "string" ? { locus: flags.get("locus") as never } : {}),
            ...(typeof flags.get("family") === "string" ? { family: flags.get("family") as string } : {}),
            ...siteFilter,
          }), null, 2));
        } else if (what === "policies") {
          console.log(JSON.stringify(await listPolicies(session, {
            ...(typeof flags.get("locus") === "string" ? { locus: flags.get("locus") as never } : {}),
            ...(typeof flags.get("kind") === "string" ? { kind: flags.get("kind") as never } : {}),
            ...siteFilter,
          }), null, 2));
        } else {
          throw new Error("list expects resources|assertions|policies");
        }
        return 0;
      }
      case "show": {
        const result = await showResource(session, positional[0]);
        if (!result) throw new Error(`resource not found: ${positional[0]}`);
        console.log(JSON.stringify(result, null, 2));
        return 0;
      }
      case "validate": {
        const errors = await validateStore(session);
        console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
        return errors.length === 0 ? 0 : 2;
      }
      case "explain": {
        const intent = JSON.parse(await readFile(String(flags.get("intent")), "utf8")) as InvocationIntent;
        const { lines } = await explainResolution(session, intent, {
          targetSite: siteRefArg(flags, "target"),
          userSite: siteRefArg(flags, "user"),
          hostSite: siteRefArg(flags, "host"),
          runtime: "node",
          time: typeof flags.get("time") === "string" ? (flags.get("time") as string) : new Date().toISOString(),
        });
        console.log(lines.join("\n"));
        return 0;
      }
      case "migrate": {
        const registryPath = String(flags.get("registry"));
        const legacy = parseLegacyRegistry(JSON.parse(await readFile(registryPath, "utf8")));
        const loci = {
          targetSite: siteRefArg(flags, "target"),
          userSite: siteRefArg(flags, "user"),
          hostSite: siteRefArg(flags, "host"),
        };
        // Provenance time comes from the source file's mtime: re-running over
        // unchanged content replans identically, so applied migrations are
        // no-ops rather than timestamp rewrites.
        const plannedAt =
          typeof flags.get("planned-at") === "string"
            ? (flags.get("planned-at") as string)
            : (await stat(registryPath)).mtime.toISOString();
        const plan = buildMigrationPlan(legacy, loci, { reference: registryPath, plannedAt });
        const result = flags.has("apply") ? await applyMigration(store, plan) : await dryRunMigration(store, plan);
        console.log(JSON.stringify({ applied: flags.has("apply"), planned_at: plannedAt, counts: result.counts, diff: result.diff }, null, 2));
        return 0;
      }
      case "compat": {
        console.log(JSON.stringify(await projectLegacyRegistry(store), null, 2));
        return 0;
      }
      default:
        console.error(`unknown command: ${command}\n\n${USAGE}`);
        return 1;
    }
  } finally {
    await store.close();
  }
}
