#!/usr/bin/env tsx
/**
 * Task Renumber / Correction Operator
 *
 * Safely renumbers a task and patches all references across the task graph.
 *
 * Usage:
 *   pnpm exec tsx scripts/task-renumber.ts --from 430 --to 450 --dry-run
 *   pnpm exec tsx scripts/task-renumber.ts --from 430 --to 450 --execute
 *   pnpm exec tsx scripts/task-renumber.ts --from 430 --to 450 --file <exact-path> --dry-run
 *
 * Exit codes:
 *   0 — success (dry-run or executed)
 *   1 — validation error / collision / target exists
 *   2 — internal tool failure
 */

import { readdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";

const ROOT = process.cwd();
const TASKS_DIR = join(ROOT, ".ai", "tasks");
const REVIEWS_DIR = join(ROOT, ".ai", "reviews");
const DECISIONS_DIR = join(ROOT, ".ai", "decisions");
const AGENTS_DIR = join(ROOT, ".ai", "agents");
const LEARNING_DIR = join(ROOT, ".ai", "learning", "accepted");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Patch {
  type: "rename" | "edit";
  file: string;
  description: string;
  oldContent?: string;
  newContent?: string;
  oldPath?: string;
  newPath?: string;
}

interface TaskMatch {
  filepath: string;
  filename: string;
  headingNumber: number | null;
  fileNumber: number | null;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  from: number | null;
  to: number | null;
  dryRun: boolean;
  execute: boolean;
  file: string | null;
} {
  const args = process.argv.slice(2);
  let from: number | null = null;
  let to: number | null = null;
  let dryRun = false;
  let execute = false;
  let file: string | null = null;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--from":
        from = parseInt(args[++i], 10);
        break;
      case "--to":
        to = parseInt(args[++i], 10);
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--execute":
        execute = true;
        break;
      case "--file":
        file = resolve(args[++i]);
        break;
    }
  }

  return { from, to, dryRun, execute, file };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readDirSafe(dir: string, filter: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(filter);
}

function readFileSafe(filepath: string): string | null {
  try {
    return readFileSync(filepath, "utf-8");
  } catch {
    return null;
  }
}

function extractHeadingNumber(content: string): number | null {
  const match = /^#\s+Task\s+(\d+)/m.exec(content);
  return match ? parseInt(match[1], 10) : null;
}

function extractFilenameNumber(filename: string): number | null {
  const m = /\d{8}-(\d+)(?:-\d+)?-/.exec(filename);
  return m ? parseInt(m[1], 10) : null;
}

function zeroPad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

function findAllTaskFiles(): TaskMatch[] {
  const matches: TaskMatch[] = [];
  const files = readDirSafe(TASKS_DIR, (n) => n.endsWith(".md"));
  for (const filename of files) {
    const filepath = join(TASKS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    matches.push({
      filepath,
      filename,
      headingNumber: extractHeadingNumber(content),
      fileNumber: extractFilenameNumber(filename),
    });
  }
  return matches;
}

function findMatches(allTasks: TaskMatch[], num: number, explicitFile: string | null): TaskMatch[] {
  if (explicitFile) {
    const m = allTasks.find((t) => t.filepath === explicitFile);
    return m ? [m] : [];
  }
  // Match by heading first, then by filename
  const byHeading = allTasks.filter((t) => t.headingNumber === num);
  if (byHeading.length > 0) return byHeading;
  return allTasks.filter((t) => t.fileNumber === num);
}

function targetExists(allTasks: TaskMatch[], num: number): boolean {
  return allTasks.some((t) => t.headingNumber === num || t.fileNumber === num);
}

// ---------------------------------------------------------------------------
// Patch builders
// ---------------------------------------------------------------------------

function buildTaskFilePatches(
  source: TaskMatch,
  from: number,
  to: number,
): Patch[] {
  const patches: Patch[] = [];
  const content = readFileSafe(source.filepath);
  if (content === null) return patches;

  // Rename file (preserve original padding length)
  const newFilename = source.filename.replace(
    /(\d{8}-)(\d+)(?=-)/,
    (_match, prefix: string, numStr: string) => `${prefix}${zeroPad(to, numStr.length)}`,
  );
  const newPath = join(TASKS_DIR, newFilename);
  patches.push({
    type: "rename",
    file: source.filepath,
    description: `Rename file to ${newFilename}`,
    oldPath: source.filepath,
    newPath: newPath,
  });

  // Edit content
  let newContent = content;

  // Update heading
  newContent = newContent.replace(
    new RegExp(`^(#\\s+Task\\s+)${from}(\\b)`, "gm"),
    `$1${to}$2`,
  );

  // Update front matter arrays (depends_on, blocked_by, closes, supersedes)
  const fmArrays = ["depends_on", "blocked_by", "closes", "supersedes"];
  for (const key of fmArrays) {
    const re = new RegExp(`^(${key}:\\s*\\[.*?\\b)${from}(\\b.*?)`, "gm");
    newContent = newContent.replace(re, `$1${to}$2`);
    // Also handle single-value cases
    const re2 = new RegExp(`^(${key}:\\s*)${from}(\\s*$)`, "gm");
    newContent = newContent.replace(re2, `$1${to}$2`);
  }

  // Update body references: "Task 123" -> "Task 456"
  // Skip lines that look like internal sub-task headings to avoid corrupting
  // assignment structures within a single task file.
  const taskRefRe = new RegExp(`\\bTask\\s+${from}\\b`, "g");
  newContent = newContent
    .split("\n")
    .map((line) => {
      if (/^#{1,6}\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      if (/^\s*[-*]\s+\[\s*[ x]\s*\]\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      return line.replace(taskRefRe, `Task ${to}`);
    })
    .join("\n");

  if (newContent !== content) {
    patches.push({
      type: "edit",
      file: source.filepath,
      description: "Update heading, front matter, and body references",
      oldContent: content,
      newContent: newContent,
    });
  }

  // Append corrections section
  const correctionLine = `\n## Corrections\n\n- **${new Date().toISOString().slice(0, 10)}**: Renumbered from Task ${from} to Task ${to} to resolve collision.\n`;
  if (!newContent.includes("## Corrections")) {
    const correctedContent = newContent + correctionLine;
    // Replace the previous edit patch or add a new one
    const editIdx = patches.findIndex((p) => p.type === "edit" && p.file === source.filepath);
    if (editIdx >= 0) {
      patches[editIdx].newContent = correctedContent;
      patches[editIdx].description += "; append corrections section";
    } else {
      patches.push({
        type: "edit",
        file: source.filepath,
        description: "Append corrections section",
        oldContent: newContent,
        newContent: correctedContent,
      });
    }
  }

  return patches;
}

function buildChapterDagPatches(from: number, to: number): Patch[] {
  const patches: Patch[] = [];
  const files = readDirSafe(TASKS_DIR, (n) => n.endsWith(".md"));
  for (const filename of files) {
    const filepath = join(TASKS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    if (!content.includes("Chapter DAG") && !/Tasks?\s+\d+\s*[-–—]\s*\d+/.test(content)) {
      continue;
    }

    let newContent = content;
    let changed = false;

    // Update range declarations like "Tasks 431–436" where from is the start
    const rangeStartRe = new RegExp(`(Tasks?\\s+)${from}(\\s*[-–—])`, "g");
    if (rangeStartRe.test(newContent)) {
      newContent = newContent.replace(rangeStartRe, `$1${to}$2`);
      changed = true;
    }

    // Update range declarations where from is the end
    const rangeEndRe = new RegExp(`(\\s*[-–—]\\s*)${from}\\b`, "g");
    if (rangeEndRe.test(newContent)) {
      newContent = newContent.replace(rangeEndRe, `$1${to}`);
      changed = true;
    }

    // Update "Task NNN" references in mermaid and body
    const taskRefRe = new RegExp(`\\bTask\\s+${from}\\b`, "g");
    const newLines = newContent.split("\n").map((line) => {
      if (/^#{1,6}\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      if (/^\s*[-*]\s+\[\s*[ x]\s*\]\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      const replaced = line.replace(taskRefRe, `Task ${to}`);
      if (replaced !== line) changed = true;
      return replaced;
    });
    newContent = newLines.join("\n");

    // Update task table entries like | **431** | Title |
    const tableRe = new RegExp(`(\\|\\s*\\*\\*)${from}(\\*\\*\\s*\\|)`, "g");
    if (tableRe.test(newContent)) {
      newContent = newContent.replace(tableRe, `$1${to}$2`);
      changed = true;
    }

    // Update mermaid node IDs that are just the number (e.g., "431[...]")
    const mermaidRe = new RegExp(`\\b${from}(\\[)`, "g");
    if (mermaidRe.test(newContent)) {
      newContent = newContent.replace(mermaidRe, `${to}$1`);
      changed = true;
    }

    if (changed && newContent !== content) {
      patches.push({
        type: "edit",
        file: filepath,
        description: `Update chapter DAG references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  }
  return patches;
}

function buildDecisionPatches(from: number, to: number): Patch[] {
  const patches: Patch[] = [];
  const files = readDirSafe(DECISIONS_DIR, (n) => n.endsWith(".md"));
  for (const filename of files) {
    const filepath = join(DECISIONS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;

    let newContent = content;
    newContent = newContent.replace(
      new RegExp(`\\bTask\\s+${from}\\b`, "g"),
      `Task ${to}`,
    );
    // Also plain number references in lists
    newContent = newContent.replace(
      new RegExp(`^(\\s*[-*]\\s+)${from}(\\s*$)`, "gm"),
      `$1${to}$2`,
    );

    if (newContent !== content) {
      patches.push({
        type: "edit",
        file: filepath,
        description: `Update decision references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  }
  return patches;
}

function buildReviewPatches(from: number, to: number): Patch[] {
  const patches: Patch[] = [];
  const files = readDirSafe(REVIEWS_DIR, (n) => n.endsWith(".md"));
  for (const filename of files) {
    const filepath = join(REVIEWS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;

    let newContent = content;
    newContent = newContent.replace(
      new RegExp(`\\bTask\\s+${from}\\b`, "g"),
      `Task ${to}`,
    );

    if (newContent !== content) {
      patches.push({
        type: "edit",
        file: filepath,
        description: `Update review references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  }
  return patches;
}

function buildRosterPatch(from: number, to: number): Patch[] {
  const patches: Patch[] = [];
  const rosterPath = join(AGENTS_DIR, "roster.json");
  const content = readFileSafe(rosterPath);
  if (content === null) return patches;

  try {
    const roster = JSON.parse(content);
    let changed = false;

    if (Array.isArray(roster.agents)) {
      for (const agent of roster.agents) {
        if (agent && typeof agent === "object") {
          if (agent.task === from) {
            agent.task = to;
            changed = true;
          }
          if (agent.last_done === from) {
            agent.last_done = to;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      const newContent = JSON.stringify(roster, null, 2) + "\n";
      patches.push({
        type: "edit",
        file: rosterPath,
        description: `Update roster references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  } catch {
    // If JSON parse fails, fall back to no patch (roster is malformed)
  }

  return patches;
}

function buildLearningPatches(from: number, to: number): Patch[] {
  const patches: Patch[] = [];
  const files = readDirSafe(LEARNING_DIR, (n) => n.endsWith(".json"));
  for (const filename of files) {
    const filepath = join(LEARNING_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;

    let newContent = content;
    // Replace "Task NNN" references in JSON strings
    newContent = newContent.replace(
      new RegExp(`(Task\\s+)${from}\\b`, "g"),
      `$1${to}`,
    );
    // Also plain number if it appears as a task reference
    newContent = newContent.replace(
      new RegExp(`"task":\\s*${from}\\b`, "g"),
      `"task": ${to}`,
    );

    if (newContent !== content) {
      patches.push({
        type: "edit",
        file: filepath,
        description: `Update learning artifact references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  }
  return patches;
}

function buildOtherTaskPatches(from: number, to: number, sourcePath: string | null): Patch[] {
  const patches: Patch[] = [];
  const files = readDirSafe(TASKS_DIR, (n) => n.endsWith(".md"));
  for (const filename of files) {
    const filepath = join(TASKS_DIR, filename);
    if (sourcePath && filepath === sourcePath) continue; // skip source, handled separately
    const content = readFileSafe(filepath);
    if (content === null) continue;

    let newContent = content;

    // Update front matter references in other tasks
    const fmArrays = ["depends_on", "blocked_by", "closes", "supersedes"];
    let changed = false;
    for (const key of fmArrays) {
      const re = new RegExp(`^(${key}:\\s*\\[.*?\\b)${from}(\\b.*?)`, "gm");
      if (re.test(newContent)) {
        newContent = newContent.replace(re, `$1${to}$2`);
        changed = true;
      }
    }

    // Update body references to the old task number
    const taskRefRe = new RegExp(`\\bTask\\s+${from}\\b`, "g");
    const newLines = newContent.split("\n").map((line) => {
      if (/^#{1,6}\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      if (/^\s*[-*]\s+\[\s*[ x]\s*\]\s+Task\s+\d+(\s*[:—-]|$)/.test(line)) return line;
      const replaced = line.replace(taskRefRe, `Task ${to}`);
      if (replaced !== line) changed = true;
      return replaced;
    });
    newContent = newLines.join("\n");

    if (changed && newContent !== content) {
      patches.push({
        type: "edit",
        file: filepath,
        description: `Update references to Task ${from} -> ${to}`,
        oldContent: content,
        newContent: newContent,
      });
    }
  }
  return patches;
}

// ---------------------------------------------------------------------------
// Apply / print
// ---------------------------------------------------------------------------

function printPatches(patches: Patch[]): void {
  for (const p of patches) {
    if (p.type === "rename") {
      console.log(`[RENAME] ${p.oldPath} -> ${p.newPath}`);
    } else {
      console.log(`[EDIT]   ${p.file}: ${p.description}`);
    }
  }
}

function applyPatches(patches: Patch[]): void {
  // Group edits by file to apply only the final content
  const editsByFile = new Map<string, { description: string; newContent: string }[]>();
  const renames: Patch[] = [];

  for (const p of patches) {
    if (p.type === "rename") {
      renames.push(p);
    } else if (p.newContent !== undefined) {
      const arr = editsByFile.get(p.file) ?? [];
      arr.push({ description: p.description, newContent: p.newContent });
      editsByFile.set(p.file, arr);
    }
  }

  // Apply edits first (before renames, so we edit at old path)
  for (const [file, edits] of editsByFile.entries()) {
    const finalContent = edits[edits.length - 1].newContent;
    writeFileSync(file, finalContent, "utf-8");
    console.log(`[WRITTEN] ${file}`);
  }

  // Apply renames
  for (const p of renames) {
    if (p.oldPath && p.newPath) {
      renameSync(p.oldPath, p.newPath);
      console.log(`[RENAMED] ${p.oldPath} -> ${p.newPath}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  try {
    const args = parseArgs();

    if (args.from === null || args.to === null) {
      console.error("Usage: tsx scripts/task-renumber.ts --from <num> --to <num> [--dry-run | --execute] [--file <path>]");
      return 1;
    }

    if (args.from === args.to) {
      console.error(`error: --from and --to are the same number (${args.from})`);
      return 1;
    }

    const allTasks = findAllTaskFiles();

    // Check target exists
    if (targetExists(allTasks, args.to)) {
      console.error(`error: target task number ${args.to} already exists`);
      return 1;
    }

    // Find source matches
    const matches = findMatches(allTasks, args.from, args.file);

    if (matches.length === 0) {
      console.error(`error: no task file found for number ${args.from}`);
      return 1;
    }

    if (matches.length > 1 && !args.file) {
      console.error(`error: ambiguous: ${matches.length} files match Task ${args.from}:`);
      for (const m of matches) {
        console.error(`  - ${m.filepath} (heading=${m.headingNumber}, fileNumber=${m.fileNumber})`);
      }
      console.error(`Use --file <path> to specify which one to renumber.`);
      return 1;
    }

    const source = matches[0];
    console.log(`Renumbering Task ${args.from} -> ${args.to}`);
    console.log(`Source: ${source.filepath}`);
    console.log("");

    // Build patches
    const patches: Patch[] = [];
    patches.push(...buildTaskFilePatches(source, args.from, args.to));
    patches.push(...buildOtherTaskPatches(args.from, args.to, source.filepath));
    patches.push(...buildChapterDagPatches(args.from, args.to));
    patches.push(...buildDecisionPatches(args.from, args.to));
    patches.push(...buildReviewPatches(args.from, args.to));
    patches.push(...buildRosterPatch(args.from, args.to));
    patches.push(...buildLearningPatches(args.from, args.to));

    if (patches.length === 0) {
      console.log("No changes needed.");
      return 0;
    }

    printPatches(patches);
    console.log("");
    console.log(`Total patches: ${patches.length}`);

    if (args.dryRun || !args.execute) {
      console.log("");
      console.log("Dry-run mode. No files were modified. Use --execute to apply.");
      return 0;
    }

    if (args.execute) {
      applyPatches(patches);
      console.log("");
      console.log("Renumbering complete.");
      return 0;
    }

    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: internal: ${message}`);
    return 2;
  }
}

process.exit(main());
