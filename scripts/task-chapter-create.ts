#!/usr/bin/env tsx
/**
 * Task Chapter Create
 *
 * Creates a chapter DAG file + stub task files, and reserves the range.
 *
 * Usage:
 *   pnpm exec tsx scripts/task-chapter-create.ts \
 *     --title "Chapter Title" \
 *     --tasks "task1 title,task2 title,task3 title" \
 *     [--depends-on 428] \
 *     [--dry-run]
 *
 * Exit codes:
 *   0 — success
 *   1 — validation error
 *   2 — internal failure
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TASKS_DIR = join(ROOT, ".ai", "tasks");
const REGISTRY_PATH = join(TASKS_DIR, ".registry.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Registry {
  version: number;
  last_allocated: number;
  reservations: Array<{
    range_start: number;
    range_end: number;
    purpose: string;
    reserved_by: string;
    reserved_at: string;
    expires_at: string;
    status: "active" | "released" | "expired";
  }>;
}

interface TaskStub {
  title: string;
  num: number;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  title: string | null;
  tasks: string[];
  dependsOn: number[];
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let title: string | null = null;
  const tasks: string[] = [];
  const dependsOn: number[] = [];
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--title":
        title = args[++i];
        break;
      case "--tasks":
        tasks.push(...args[++i].split(",").map((s) => s.trim()).filter(Boolean));
        break;
      case "--depends-on":
        dependsOn.push(...args[++i].split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n)));
        break;
      case "--dry-run":
        dryRun = true;
        break;
    }
  }

  return { title, tasks, dependsOn, dryRun };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function readRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) {
    return { version: 1, last_allocated: 0, reservations: [] };
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8")) as Registry;
  } catch {
    return { version: 1, last_allocated: 0, reservations: [] };
  }
}

function writeRegistry(registry: Registry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf-8");
}

function findAllTaskNumbers(): Set<number> {
  const nums = new Set<number>();
  const files = readdirSync(TASKS_DIR).filter((n) => n.endsWith(".md"));
  for (const f of files) {
    const m = /\d{8}-(\d+)(?:-\d+)?-/.exec(f);
    if (m) nums.add(parseInt(m[1], 10));
    const content = readFileSync(join(TASKS_DIR, f), "utf-8");
    const hm = /^#\s+Task\s+(\d+)/m.exec(content);
    if (hm) nums.add(parseInt(hm[1], 10));
  }
  return nums;
}

function nextAvailableRange(count: number): { start: number; end: number } {
  const registry = readRegistry();
  const existing = findAllTaskNumbers();

  const maxReserved = registry.reservations
    .filter((r) => r.status === "active")
    .reduce((max, r) => Math.max(max, r.range_end), registry.last_allocated);

  let candidate = maxReserved + 1;

  // Ensure none of the range numbers are already used
  while (true) {
    let clear = true;
    for (let i = 0; i < count; i++) {
      if (existing.has(candidate + i)) {
        clear = false;
        candidate = candidate + i + 1;
        break;
      }
    }
    if (clear) break;
  }

  return { start: candidate, end: candidate + count - 1 };
}

function kebabCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function zeroPad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildChapterDag(
  range: { start: number; end: number },
  title: string,
  stubs: TaskStub[],
  dependsOn: number[],
): { filename: string; content: string } {
  const todayStr = today();
  const filename = `${todayStr}-${range.start}-${range.end}-${kebabCase(title)}.md`;

  const depsStr = dependsOn.length > 0 ? `\ndepends_on: [${dependsOn.join(", ")}]` : "";

  const taskRows = stubs
    .map(
      (s) =>
        `| **${s.num}** | ${s.title} | _stub — fill during assignment_ |`,
    )
    .join("\n");

  const mermaidNodes = stubs.map((s) => `    ${s.num}[Task ${s.num}]`).join("\n");

  const content = `---\nstatus: opened${depsStr}\n---\n\n# Chapter DAG — ${title} (Tasks ${range.start}–${range.end})\n\n> Self-standing chapter for ${title.toLowerCase()}.\n\n---\n\n## Chapter Goal\n\nDefine the boundary, tasks, and acceptance criteria for the ${title} chapter.\n\n---\n\n## Task DAG\n\n\`\`\`mermaid\ngraph TD\n${mermaidNodes}\n\`\`\`\n\n| Task | Title | Purpose |\n|------|-------|---------|\n${taskRows}\n`;

  return { filename, content };
}

function buildStubTask(
  num: number,
  title: string,
  range: { start: number; end: number },
  chapterTitle: string,
): { filename: string; content: string } {
  const todayStr = today();
  const filename = `${todayStr}-${zeroPad(num, String(range.start).length)}-${kebabCase(title)}.md`;

  const content = `---\nstatus: opened\ndepends_on: []\n---\n\n# Task ${num} — ${title}\n\n## Context\n\nPart of the ${chapterTitle} chapter (Tasks ${range.start}–${range.end}).\n\n## Goal\n\nComplete the implementation for ${title}.\n\n## Acceptance Criteria\n\n- [ ] Scope is defined.\n- [ ] Implementation is complete.\n- [ ] Verification passes.\n\n## Execution Mode\n\nProceed directly or start in planning mode depending on write set.\n`;

  return { filename, content };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  try {
    const args = parseArgs();

    if (!args.title) {
      console.error("Usage: tsx scripts/task-chapter-create.ts --title <title> --tasks <comma-list> [--depends-on <nums>] [--dry-run]");
      return 1;
    }

    if (args.tasks.length === 0) {
      console.error("error: --tasks is required (comma-separated task titles)");
      return 1;
    }

    const range = nextAvailableRange(args.tasks.length);
    const stubs: TaskStub[] = args.tasks.map((t, i) => ({
      title: t,
      num: range.start + i,
    }));

    console.log(`Chapter: ${args.title}`);
    console.log(`Range:   ${range.start}–${range.end}`);
    console.log(`Tasks:   ${stubs.map((s) => `${s.num}: ${s.title}`).join(", ")}`);
    console.log("");

    const chapter = buildChapterDag(range, args.title, stubs, args.dependsOn);
    const chapterPath = join(TASKS_DIR, chapter.filename);

    console.log(`[CHAPTER] ${chapter.filename}`);
    for (const stub of stubs) {
      const task = buildStubTask(stub.num, stub.title, range, args.title);
      console.log(`[TASK]    ${task.filename}`);
    }

    if (args.dryRun) {
      console.log("");
      console.log("Dry-run mode. No files were created. Use --execute to apply.");
      return 0;
    }

    // Write chapter DAG
    writeFileSync(chapterPath, chapter.content, "utf-8");
    console.log(`[WRITTEN] ${chapterPath}`);

    // Write stub tasks
    for (const stub of stubs) {
      const task = buildStubTask(stub.num, stub.title, range, args.title);
      const taskPath = join(TASKS_DIR, task.filename);
      writeFileSync(taskPath, task.content, "utf-8");
      console.log(`[WRITTEN] ${taskPath}`);
    }

    // Update registry
    const registry = readRegistry();
    registry.last_allocated = Math.max(registry.last_allocated, range.end);
    registry.reservations.push({
      range_start: range.start,
      range_end: range.end,
      purpose: `Chapter: ${args.title}`,
      reserved_by: "chapter-create",
      reserved_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "active",
    });
    writeRegistry(registry);
    console.log(`[REGISTRY] Updated ${REGISTRY_PATH}`);

    console.log("");
    console.log("Chapter creation complete.");
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: internal: ${message}`);
    return 2;
  }
}

process.exit(main());
