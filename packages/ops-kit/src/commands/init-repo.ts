/**
 * `narada init-repo <path>`
 *
 * Bootstrap a private Narada operational repository.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface InitRepoOptions {
  name?: string;
  demo?: boolean;
  localSource?: boolean;
}

export interface InitRepoArtifact {
  path: string;
  category: "config" | "directory" | "credential-template" | "documentation" | "package";
  description: string;
}

export interface InitRepoResult {
  repoPath: string;
  createdFiles: string[];
  artifacts: InitRepoArtifact[];
  summary: string;
  nextSteps: string[];
}

/** Compute a file: reference from repoPath to a monorepo package location. */
function resolvePackageRef(monorepoRel: string, repoPath: string): string {
  // ops-kit is at packages/ops-kit/dist/commands/init-repo.js when built
  const thisFile = fileURLToPath(import.meta.url);
  const opsKitDir = path.dirname(path.dirname(path.dirname(thisFile)));
  const monorepoRoot = path.resolve(opsKitDir, "..", "..");
  const pkgDir = path.join(monorepoRoot, monorepoRel);
  const rel = path.relative(repoPath, pkgDir);
  const normalized = rel.startsWith(".") ? rel : `./${rel}`;
  return `link:${normalized}`;
}

export function initRepo(repoPath: string, options: InitRepoOptions = {}): InitRepoResult {
  const absPath = path.resolve(repoPath);
  const name = options.name ?? path.basename(absPath);

  const createdFiles: string[] = [];

  function write(filePath: string, content: string): void {
    const full = path.join(absPath, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
    createdFiles.push(filePath);
  }

  // Dependency strategy: standalone (default) uses npm semver refs;
  // local-source mode uses link: refs into the monorepo.
  const deps: Record<string, string> = options.localSource
    ? {
        "@narada2/control-plane": resolvePackageRef("packages/layers/control-plane", absPath),
        "@narada2/cli": resolvePackageRef("packages/layers/cli", absPath),
        "@narada2/daemon": resolvePackageRef("packages/layers/daemon", absPath),
        "@narada2/search": resolvePackageRef("packages/verticals/search", absPath),
        "@narada2/charters": resolvePackageRef("packages/domains/charters", absPath),
      }
    : {
        "@narada2/control-plane": "^0.1.0",
        "@narada2/cli": "^0.1.0",
        "@narada2/daemon": "^0.1.0",
        "@narada2/search": "^0.1.0",
        "@narada2/charters": "^0.1.0",
      };

  // package.json
  write(
    "package.json",
    JSON.stringify(
      {
        name: name.replace(/\s+/g, "-").toLowerCase(),
        version: "0.1.0",
        private: true,
        type: "module",
        packageManager: "pnpm@10.33.0",
        description: `Private operational repo for Narada`,
        scripts: {
          sync: "narada sync -c ./config/config.json",
          "sync:dry": "narada sync -c ./config/config.json --dry-run",
          status: "narada status -c ./config/config.json",
          daemon: "narada-daemon -c ./config/config.json",
          search: "narada-search -h",
        },
        dependencies: deps,
      },
      null,
      2,
    ) + "\n",
  );

  // .gitignore
  write(
    ".gitignore",
    [
      "node_modules/",
      "pnpm-lock.yaml",
      ".env",
      "config/*.local.json",
      "logs/",
      "*.log",
      ".DS_Store",
      "",
    ].join("\n"),
  );

  // .env.example
  write(
    ".env.example",
    [
      "GRAPH_TENANT_ID=your-tenant-id",
      "GRAPH_CLIENT_ID=your-client-id",
      "GRAPH_CLIENT_SECRET=your-client-secret",
      "GRAPH_ACCESS_TOKEN=your-access-token",
      "NARADA_OPENAI_API_KEY=your-openai-api-key",
      "NARADA_KIMI_API_KEY=your-kimi-api-key",
      "",
    ].join("\n"),
  );

  // config/config.json — minimal starter config (or demo scope if --demo)
  const starterConfig = options.demo
    ? {
        $schema: "../node_modules/@narada2/control-plane/config.schema.json",
        root_dir: "./data",
        scopes: [
          {
            scope_id: "demo",
            root_dir: "./data/demo",
            sources: [{ type: "mock" }],
            context_strategy: "mail",
            scope: {
              included_container_refs: ["inbox"],
              included_item_kinds: ["message"],
            },
            normalize: {
              attachment_policy: "metadata_only",
              body_policy: "text_only",
              include_headers: false,
              tombstones_enabled: true,
            },
            runtime: {
              polling_interval_ms: 60000,
              acquire_lock_timeout_ms: 30000,
              cleanup_tmp_on_startup: true,
              rebuild_views_after_sync: false,
            },
            charter: {
              runtime: "mock",
            },
            policy: {
              primary_charter: "support_steward",
              secondary_charters: [],
              allowed_actions: ["draft_reply", "mark_read", "set_categories", "no_action"],
              allowed_tools: [],
              require_human_approval: true,
            },
          },
        ],
      }
    : {
        $schema: "../node_modules/@narada2/control-plane/config.schema.json",
        root_dir: "./data",
        scopes: [],
      };

  write("config/config.json", JSON.stringify(starterConfig, null, 2) + "\n");

  // config/config.example.json — same as starter, acts as documentation
  write(
    "config/config.example.json",
    JSON.stringify(
      {
        $schema: "../node_modules/@narada2/control-plane/config.schema.json",
        root_dir: "./data",
        scopes: [
          {
            scope_id: "example-scope",
            root_dir: "./data/example-scope",
            sources: [{ type: "graph" }],
            graph: {
              user_id: "user@example.com",
              prefer_immutable_ids: true,
            },
            scope: {
              included_container_refs: ["inbox"],
              included_item_kinds: ["message"],
            },
            normalize: {
              attachment_policy: "metadata_only",
              body_policy: "text_only",
              include_headers: false,
              tombstones_enabled: true,
            },
            runtime: {
              polling_interval_ms: 60000,
              acquire_lock_timeout_ms: 30000,
              cleanup_tmp_on_startup: true,
              rebuild_views_after_sync: false,
            },
            policy: {
              primary_charter: "support_steward",
              secondary_charters: [],
              allowed_actions: ["draft_reply", "mark_read", "set_categories", "no_action"],
              allowed_tools: [],
              require_human_approval: true,
            },
          },
        ],
      },
      null,
      2,
    ) + "\n",
  );

  // Directories
  for (const dir of ["mailboxes", "workflows", "logs", "knowledge"]) {
    fs.mkdirSync(path.join(absPath, dir), { recursive: true });
    createdFiles.push(`${dir}/`);
  }

  const artifacts: InitRepoArtifact[] = [
    { path: "package.json", category: "package", description: "Dependencies and npm scripts" },
    { path: "config/config.json", category: "config", description: "Live operation config" },
    { path: "config/config.example.json", category: "config", description: "Documented config template" },
    { path: ".env.example", category: "credential-template", description: "Credential template" },
    { path: ".gitignore", category: "documentation", description: "Git ignore rules" },
    { path: "mailboxes/", category: "directory", description: "Mailbox operational material" },
    { path: "workflows/", category: "directory", description: "Workflow operational material" },
    { path: "logs/", category: "directory", description: "Local runner output" },
    { path: "knowledge/", category: "directory", description: "Global operational knowledge" },
    { path: "README.md", category: "documentation", description: "First-run guide" },
  ];

  // README.md
  const readmeLines = options.demo
    ? [
        `# ${name}`,
        "",
        "**Demo / Safe Trial Repo** — no live credentials required.",
        "",
        "This repo is pre-configured with a mock-backed demo operation so you can explore the Narada shaping workflow without connecting to a real mailbox or charter runtime.",
        "",
        "## Trial Path",
        "",
        "```bash",
        "# 1. Install dependencies",
        "pnpm install",
        "",
        "# 2. Check readiness (non-live — no external credentials needed)",
        "narada preflight demo",
        "",
        "# 3. See what the demo operation would do",
        "narada explain demo",
        "",
        "# 4. Activate the demo operation",
        "narada activate demo",
        "",
        "# 5. See synthetic sync data in action",
        "narada demo",
        "```",
        "",
        "## Going Live",
        "",
        "To switch from demo to a real mailbox operation:",
        "",
        "1. `narada want-mailbox <real-email>` — declare a real mailbox",
        "2. Fill `.env` with Graph API credentials",
        "3. Change `charter.runtime` from `mock` to `codex-api` or `kimi-api`",
        "4. `narada preflight <mailbox-id>` — verify readiness",
        "5. `narada activate <mailbox-id>` — activate",
        "",
        "## Layout",
        "",
        '- `config/`: live config and templates',
        '- `mailboxes/<mailbox-id>/`: mailbox-owned operational material',
        '- `mailboxes/<mailbox-id>/scenarios/`: canonical mailbox scenarios',
        '- `mailboxes/<mailbox-id>/knowledge/`: mailbox + charter knowledge',
        '- `mailboxes/<mailbox-id>/notes/`: operator notes',
        '- `workflows/<workflow-id>/`: timer- or workflow-owned operational material',
        '- `logs/`: local runner output',
        '- `knowledge/`: global operational knowledge',
        "",
        "## Repo Split",
        "",
        "- `narada`: public code and publishable packages",
        "- `narada.examples`: public-safe examples",
        "- This repo: private ops material",
        "",
      ]
    : [
        `# ${name}`,
        "",
        "Private operations repo for running Narada mailbox and workflow operations.",
        "",
        "## First-Run Gold Path",
        "",
        "```bash",
        "# 1. Install dependencies",
        "pnpm install",
        "",
        "# 2. Declare your first mailbox operation (safe defaults: draft-only, approval required)",
        "narada want-mailbox help@company.com",
        "",
        "# 3. Scaffold directories",
        "narada setup",
        "",
        "# 4. Fill credentials",
        "cp .env.example .env",
        "# edit .env with your Graph API and charter runtime credentials",
        "",
        "# 5. Check operation readiness",
        "narada preflight help@company.com",
        "",
        "# 6. Understand what this operation will do",
        "narada explain help@company.com",
        "",
        "# 7. Activate the operation when satisfied",
        "narada activate help@company.com",
        "",
        "# 8. Run the daemon",
        "pnpm daemon",
        "```",
        "",
        "## What Happens After `pnpm daemon`",
        "",
        "Narada will:",
        "",
        "1. Sync mailbox state into the operation data root",
        "2. Admit new contexts (messages) into the work queue",
        "3. Run the primary charter against each context",
        "4. Create durable draft proposals (never send without approval in draft-only posture)",
        "5. Log activity to `logs/`",
        "",
        "Operator review is always required before any outbound send in the default posture.",
        "",
        "## Layout",
        "",
        '- `config/`: live config and templates',
        '- `mailboxes/<mailbox-id>/`: mailbox-owned operational material',
        '- `mailboxes/<mailbox-id>/scenarios/`: canonical mailbox scenarios',
        '- `mailboxes/<mailbox-id>/knowledge/`: mailbox + charter knowledge',
        '- `mailboxes/<mailbox-id>/notes/`: operator notes',
        '- `workflows/<workflow-id>/`: timer- or workflow-owned operational material',
        '- `logs/`: local runner output',
        '- `knowledge/`: global operational knowledge',
        "",
        "## Repo Split",
        "",
        "- `narada`: public code and publishable packages",
        "- `narada.examples`: public-safe examples",
        "- This repo: private ops material",
        "",
      ];

  write("README.md", readmeLines.join("\n"));

  return {
    repoPath: absPath,
    createdFiles,
    artifacts,
    summary: `Initialized Narada ops repo at ${absPath} (${createdFiles.length} files/directories).`,
    nextSteps: options.demo
      ? [
          `cd ${absPath}`,
          "pnpm install",
          "narada setup",
          "narada preflight demo",
          "narada explain demo",
          "narada activate demo",
          "narada demo",
        ]
      : [
          `cd ${absPath}`,
          "pnpm install",
          "narada want-mailbox <mailbox-id>",
          "narada setup",
          "narada preflight <mailbox-id>",
          "narada explain <mailbox-id>",
          "narada activate <mailbox-id>",
          "pnpm daemon",
        ],
  };
}
