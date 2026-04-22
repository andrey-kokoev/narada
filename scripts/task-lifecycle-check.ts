#!/usr/bin/env tsx
/**
 * Task Lifecycle Check
 *
 * Validates consistency between task lifecycle states and review/closure artifacts.
 *
 * Exit codes:
 *   0 — no inconsistencies
 *   1 — one or more inconsistencies found
 *   2 — internal tool failure
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const TASKS_DIR = join(ROOT, ".ai", "tasks");
const REVIEWS_DIR = join(ROOT, ".ai", "reviews");
const DECISIONS_DIR = join(ROOT, ".ai", "decisions");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Inconsistency {
  severity: "error" | "warning";
  checkId: string;
  file: string;
  message: string;
}

interface TaskFile {
  number: number;
  filepath: string;
  filename: string;
  frontMatter: Record<string, unknown>;
  body: string;
}

interface ReviewFile {
  filepath: string;
  filename: string;
  frontMatter: Record<string, unknown>;
  body: string;
  reviewOf: number | null;
  verdict: string | null;
}

interface ClosureFile {
  filepath: string;
  filename: string;
  frontMatter: Record<string, unknown>;
  body: string;
  closesTasks: number[];
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

function parseFrontMatter(content: string): {
  frontMatter: Record<string, unknown>;
  body: string;
} {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = fmRegex.exec(content);
  if (!match) {
    return { frontMatter: {}, body: content };
  }
  const raw = match[1];
  const body = match[2];
  const frontMatter: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      try {
        frontMatter[key] = JSON.parse(val.replace(/'/g, '"'));
      } catch {
        frontMatter[key] = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else if (val === "true") {
      frontMatter[key] = true;
    } else if (val === "false") {
      frontMatter[key] = false;
    } else if (val === "null") {
      frontMatter[key] = null;
    } else {
      frontMatter[key] = val;
    }
  }
  return { frontMatter, body };
}

function extractHeadingNumber(body: string): number | null {
  const match = /^#\s+Task\s+(\d+)/m.exec(body);
  return match ? parseInt(match[1], 10) : null;
}

function extractTaskRefsFromBody(body: string): number[] {
  const refs: number[] = [];
  const seen = new Set<number>();
  const re = /\b[Tt]ask\s+(\d{3,})/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const n = parseInt(m[1], 10);
    if (!seen.has(n)) {
      seen.add(n);
      refs.push(n);
    }
  }
  return refs;
}

function isChapterDag(body: string): boolean {
  if (/^#\s+Chapter\s+DAG/m.test(body)) return true;
  if (/^#\s+.*Tasks?\s+\d+\s*[-–—]\s*\d+/m.test(body)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------

function scanTasks(): { tasks: TaskFile[]; inconsistencies: Inconsistency[] } {
  const inconsistencies: Inconsistency[] = [];
  const tasks: TaskFile[] = [];
  const files = readDirSafe(TASKS_DIR, (n) => n.endsWith(".md"));

  for (const filename of files) {
    const filepath = join(TASKS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    const { frontMatter, body } = parseFrontMatter(content);
    const headingNumber = extractHeadingNumber(body);

    if (headingNumber === null && isChapterDag(body)) continue;
    if (headingNumber === null) continue;

    tasks.push({
      number: headingNumber,
      filepath,
      filename,
      frontMatter,
      body,
    });

    // Validate status values
    const status = frontMatter["status"];
    const validStatuses = [
      "draft",
      "opened",
      "claimed",
      "needs_continuation",
      "in_review",
      "closed",
      "confirmed",
    ];
    if (status !== undefined && typeof status === "string" && !validStatuses.includes(status)) {
      inconsistencies.push({
        severity: "warning",
        checkId: "invalid-status",
        file: filepath,
        message: `Task has invalid status '${status}'`,
      });
    }
  }

  return { tasks, inconsistencies };
}

function scanReviews(): ReviewFile[] {
  const reviews: ReviewFile[] = [];
  const files = readDirSafe(REVIEWS_DIR, (n) => n.endsWith(".md"));

  for (const filename of files) {
    const filepath = join(REVIEWS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    const { frontMatter, body } = parseFrontMatter(content);

    const reviewOf =
      typeof frontMatter["review_of"] === "number"
        ? frontMatter["review_of"]
        : null;

    const verdict =
      typeof frontMatter["verdict"] === "string"
        ? frontMatter["verdict"]
        : null;

    reviews.push({
      filepath,
      filename,
      frontMatter,
      body,
      reviewOf,
      verdict,
    });
  }

  return reviews;
}

function scanClosures(): ClosureFile[] {
  const closures: ClosureFile[] = [];
  const files = readDirSafe(DECISIONS_DIR, (n) => n.endsWith(".md"));

  for (const filename of files) {
    const filepath = join(DECISIONS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    const { frontMatter, body } = parseFrontMatter(content);

    const closesTasks: number[] = [];
    const ct = frontMatter["closes_tasks"];
    if (Array.isArray(ct)) {
      for (const item of ct) {
        const num =
          typeof item === "number"
            ? item
            : typeof item === "string"
              ? parseInt(item, 10)
              : null;
        if (num !== null && !Number.isNaN(num)) {
          closesTasks.push(num);
        }
      }
    }

    // Also infer from body text if front matter is absent
    if (closesTasks.length === 0) {
      const bodyRefs = extractTaskRefsFromBody(body);
      // For closure decisions, check if the body mentions "closure" or "closed"
      if (/\b[Cc]losure\b/.test(body) || /\b[Cc]losed\b/.test(body)) {
        for (const num of bodyRefs) {
          if (!closesTasks.includes(num)) {
            closesTasks.push(num);
          }
        }
      }
    }

    closures.push({
      filepath,
      filename,
      frontMatter,
      body,
      closesTasks,
    });
  }

  return closures;
}

// ---------------------------------------------------------------------------
// Consistency checks
// ---------------------------------------------------------------------------

function checkReviewTaskConsistency(
  tasks: TaskFile[],
  reviews: ReviewFile[],
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];
  const taskByNumber = new Map<number, TaskFile>();
  for (const t of tasks) taskByNumber.set(t.number, t);

  // Map: task number -> review files referencing it
  const reviewsByTask = new Map<number, ReviewFile[]>();
  for (const r of reviews) {
    // Primary: front matter review_of
    if (r.reviewOf !== null) {
      const arr = reviewsByTask.get(r.reviewOf) ?? [];
      arr.push(r);
      reviewsByTask.set(r.reviewOf, arr);
      continue;
    }
    // Fallback: body text references
    const bodyRefs = extractTaskRefsFromBody(r.body);
    for (const num of bodyRefs) {
      const arr = reviewsByTask.get(num) ?? [];
      arr.push(r);
      reviewsByTask.set(num, arr);
    }
  }

  for (const task of tasks) {
    const status = task.frontMatter["status"];
    const taskReviews = reviewsByTask.get(task.number) ?? [];

    // Task in_review but review verdict says rejected
    if (status === "in_review") {
      for (const review of taskReviews) {
        if (review.verdict === "rejected") {
          inconsistencies.push({
            severity: "error",
            checkId: "status-review-mismatch",
            file: task.filepath,
            message: `Task ${task.number} is in_review but review ${basename(review.filepath)} verdict is rejected`,
          });
        }
      }
    }

    // Task marked closed/confirmed but review says rejected
    if (status === "closed" || status === "confirmed") {
      for (const review of taskReviews) {
        if (review.verdict === "rejected") {
          inconsistencies.push({
            severity: "error",
            checkId: "status-review-mismatch",
            file: task.filepath,
            message: `Task ${task.number} is ${status} but review ${basename(review.filepath)} verdict is rejected`,
          });
        }
      }
    }

    // Task is opened/claimed but has an accepted review (review happened before closure?)
    if (status === "opened" || status === "claimed") {
      for (const review of taskReviews) {
        if (review.verdict === "accepted") {
          inconsistencies.push({
            severity: "warning",
            checkId: "premature-review",
            file: task.filepath,
            message: `Task ${task.number} is ${status} but already has accepted review ${basename(review.filepath)}`,
          });
        }
      }
    }
  }

  return inconsistencies;
}

function checkClosureTaskConsistency(
  tasks: TaskFile[],
  closures: ClosureFile[],
): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];

  // Map: task number -> closure files referencing it
  const closuresByTask = new Map<number, ClosureFile[]>();
  for (const c of closures) {
    for (const num of c.closesTasks) {
      const arr = closuresByTask.get(num) ?? [];
      arr.push(c);
      closuresByTask.set(num, arr);
    }
  }

  for (const task of tasks) {
    const status = task.frontMatter["status"];
    const taskClosures = closuresByTask.get(task.number) ?? [];

    // Task confirmed but no closure decision
    if (status === "confirmed" && taskClosures.length === 0) {
      inconsistencies.push({
        severity: "warning",
        checkId: "missing-closure",
        file: task.filepath,
        message: `Task ${task.number} is confirmed but has no matching closure decision`,
      });
    }
  }

  return inconsistencies;
}

function checkOrphanReviews(tasks: TaskFile[], reviews: ReviewFile[]): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];
  const reviewedTasks = new Set<number>();

  for (const r of reviews) {
    if (r.reviewOf !== null) {
      reviewedTasks.add(r.reviewOf);
    } else {
      const bodyRefs = extractTaskRefsFromBody(r.body);
      for (const num of bodyRefs) reviewedTasks.add(num);
    }
  }

  for (const task of tasks) {
    const status = task.frontMatter["status"];
    if (status === "in_review" && !reviewedTasks.has(task.number)) {
      inconsistencies.push({
        severity: "warning",
        checkId: "orphan-review",
        file: task.filepath,
        message: `Task ${task.number} is in_review but has no matching review file`,
      });
    }
  }

  return inconsistencies;
}

function checkOrphanClosures(tasks: TaskFile[], closures: ClosureFile[]): Inconsistency[] {
  const inconsistencies: Inconsistency[] = [];
  const closedTasks = new Set<number>();

  for (const c of closures) {
    for (const num of c.closesTasks) {
      closedTasks.add(num);
    }
  }

  for (const task of tasks) {
    const status = task.frontMatter["status"];
    if ((status === "closed" || status === "confirmed") && !closedTasks.has(task.number)) {
      inconsistencies.push({
        severity: "warning",
        checkId: "orphan-closure",
        file: task.filepath,
        message: `Task ${task.number} is ${status} but has no matching closure decision`,
      });
    }
  }

  return inconsistencies;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  try {
    const { tasks, inconsistencies } = scanTasks();
    const reviews = scanReviews();
    const closures = scanClosures();

    inconsistencies.push(...checkReviewTaskConsistency(tasks, reviews));
    inconsistencies.push(...checkClosureTaskConsistency(tasks, closures));
    inconsistencies.push(...checkOrphanReviews(tasks, reviews));
    inconsistencies.push(...checkOrphanClosures(tasks, closures));

    // Sort: errors first, then by file
    inconsistencies.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "error" ? -1 : 1;
      }
      return a.file.localeCompare(b.file);
    });

    for (const i of inconsistencies) {
      console.log(`${i.severity}: ${i.checkId}: ${i.file}: ${i.message}`);
    }

    const errors = inconsistencies.filter((i) => i.severity === "error");
    const warnings = inconsistencies.filter((i) => i.severity === "warning");

    console.log("");
    console.log(
      `Task Lifecycle Check complete. ${errors.length} error(s), ${warnings.length} warning(s).`,
    );

    if (errors.length > 0) {
      return 1;
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: internal: ${message}`);
    return 2;
  }
}

process.exit(main());
