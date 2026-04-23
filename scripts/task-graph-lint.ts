#!/usr/bin/env tsx
/**
 * Task Graph Lint
 *
 * Scans the task graph and reports structural findings per
 * docs/governance/task-graph-evolution-boundary.md §7.
 *
 * Exit codes:
 *   0 — no errors (warnings OK)
 *   1 — one or more errors
 *   2 — internal tool failure
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const TASKS_DIR = join(ROOT, ".ai", "tasks");
const REVIEWS_DIR = join(ROOT, ".ai", "reviews");
const DECISIONS_DIR = join(ROOT, ".ai", "decisions");
const AGENTS_DIR = join(ROOT, ".ai", "agents");
const LEARNING_DIR = join(ROOT, ".ai", "learning", "accepted");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Finding {
  severity: "error" | "warning";
  checkId: string;
  file: string;
  message: string;
}

interface TaskFile {
  filepath: string;
  filename: string;
  headingNumber: number | null;
  frontMatter: Record<string, unknown>;
  body: string;
  isChapterDag: boolean;
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

function isChapterDag(body: string): boolean {
  // Chapter DAGs don't have "# Task NNN" but may have "# Chapter DAG"
  if (/^#\s+Chapter\s+DAG/m.test(body)) return true;
  // Also check for range notation in heading like "Tasks 431–436"
  if (/^#\s+.*Tasks?\s+\d+\s*[-–—]\s*\d+/m.test(body)) return true;
  return false;
}

function extractChapterRange(body: string): { start: number; end: number } | null {
  const m = /^#\s+.*Tasks?\s+(\d+)\s*[-–—]\s*(\d+)/m.exec(body);
  if (m) {
    return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  }
  // Try inline range like "Tasks 431–436" in body
  const m2 = /Tasks?\s+(\d+)\s*[-–—]\s*(\d+)/m.exec(body);
  if (m2) {
    return { start: parseInt(m2[1], 10), end: parseInt(m2[2], 10) };
  }
  return null;
}

function extractFilenameNumber(filename: string): number | null {
  // Pattern: YYYYMMDD-NNN-... or YYYYMMDD-NNN-MMM-...
  const m = /\d{8}-(\d+)(?:-\d+)?-/.exec(filename);
  return m ? parseInt(m[1], 10) : null;
}

function extractTaskRefsFromBody(body: string): number[] {
  const refs: number[] = [];
  const seen = new Set<number>();
  // Match "Task NNN" or "task NNN" or standalone NNN in mermaid/task tables
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

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------

function scanTasks(): { tasks: TaskFile[]; findings: Finding[] } {
  const findings: Finding[] = [];
  const tasks: TaskFile[] = [];
  const files = readDirSafe(TASKS_DIR, (n) => n.endsWith(".md"));

  for (const filename of files) {
    const filepath = join(TASKS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    const { frontMatter, body } = parseFrontMatter(content);
    const headingNumber = extractHeadingNumber(body);
    const chapterDag = isChapterDag(body);
    const fileNum = extractFilenameNumber(filename);

    tasks.push({
      filepath,
      filename,
      headingNumber,
      frontMatter,
      body,
      isChapterDag: chapterDag,
    });

    // derivative-file
    if (
      /-EXECUTED\.md$/i.test(filename) ||
      /-DONE\.md$/i.test(filename) ||
      /-RESULT\.md$/i.test(filename) ||
      /-FINAL\.md$/i.test(filename) ||
      /-SUPERSEDED\.md$/i.test(filename)
    ) {
      findings.push({
        severity: "error",
        checkId: "derivative-file",
        file: filepath,
        message: `Forbidden derivative filename pattern: ${filename}`,
      });
    }
  }

  return { tasks, findings };
}

function checkDuplicateTaskNumbers(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  const byHeading = new Map<number, TaskFile[]>();
  const byFilename = new Map<number, TaskFile[]>();

  for (const t of tasks) {
    if (t.headingNumber !== null) {
      const arr = byHeading.get(t.headingNumber) ?? [];
      arr.push(t);
      byHeading.set(t.headingNumber, arr);
    }
    const fileNum = extractFilenameNumber(t.filename);
    if (fileNum !== null) {
      const arr = byFilename.get(fileNum) ?? [];
      arr.push(t);
      byFilename.set(fileNum, arr);
    }
  }

  // Heading-based duplicates
  for (const [num, arr] of byHeading.entries()) {
    if (arr.length > 1) {
      const others = arr.map((a) => a.filename).join(", ");
      for (const t of arr) {
        findings.push({
          severity: "error",
          checkId: "duplicate-task-number",
          file: t.filepath,
          message: `Task ${num} also claimed by ${others}`,
        });
      }
    }
  }

  // Filename-based duplicates for files without headings
  // Only report when: (a) same-date collision, or (b) same-heading collision
  for (const [num, arr] of byFilename.entries()) {
    if (arr.length > 1) {
      // Check if already reported via heading check
      if (byHeading.has(num)) continue;

      // Group by date prefix (YYYYMMDD)
      const byDate = new Map<string, TaskFile[]>();
      for (const t of arr) {
        const dateMatch = /^(\d{8})-/.exec(t.filename);
        const date = dateMatch ? dateMatch[1] : "unknown";
        const group = byDate.get(date) ?? [];
        group.push(t);
        byDate.set(date, group);
      }

      // Report same-date collisions
      for (const [date, dateArr] of byDate.entries()) {
        if (dateArr.length > 1) {
          const others = dateArr.map((a) => a.filename).join(", ");
          for (const t of dateArr) {
            findings.push({
              severity: "error",
              checkId: "duplicate-task-number",
              file: t.filepath,
              message: `Filename number ${num} (date ${date}) also claimed by ${others}`,
            });
          }
        }
      }
    }
  }

  return findings;
}

function checkFilenameHeadingMismatch(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (t.headingNumber === null) continue; // chapter DAGs skip
    const fileNum = extractFilenameNumber(t.filename);
    if (fileNum !== null && fileNum !== t.headingNumber) {
      findings.push({
        severity: "error",
        checkId: "filename-heading-mismatch",
        file: t.filepath,
        message: `Filename number ${fileNum} does not match heading Task ${t.headingNumber}`,
      });
    }
  }
  return findings;
}

function checkStaleDependencies(
  tasks: TaskFile[],
  allTaskNumbers: Set<number>,
): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (t.headingNumber === null) continue;
    const deps = t.frontMatter["depends_on"];
    if (!Array.isArray(deps)) continue;
    for (const dep of deps) {
      const depNum =
        typeof dep === "string" && dep.startsWith("ext:")
          ? null
          : typeof dep === "number"
            ? dep
            : typeof dep === "string"
              ? parseInt(dep, 10)
              : null;
      if (depNum !== null && !allTaskNumbers.has(depNum)) {
        findings.push({
          severity: "warning",
          checkId: "stale-dependency",
          file: t.filepath,
          message: `depends_on references non-existent task ${depNum}`,
        });
      }
    }
  }
  return findings;
}

function checkStaleBlockers(
  tasks: TaskFile[],
  allTaskNumbers: Set<number>,
): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (t.headingNumber === null) continue;
    const blockers = t.frontMatter["blocked_by"];
    if (!Array.isArray(blockers)) continue;
    for (const b of blockers) {
      const bNum = typeof b === "number" ? b : typeof b === "string" ? parseInt(b, 10) : null;
      if (bNum !== null && !allTaskNumbers.has(bNum)) {
        findings.push({
          severity: "warning",
          checkId: "stale-blocker",
          file: t.filepath,
          message: `blocked_by references non-existent task ${bNum}`,
        });
      }
    }
  }
  return findings;
}

function checkMissingHeading(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (t.headingNumber === null && !t.isChapterDag) {
      findings.push({
        severity: "warning",
        checkId: "missing-heading",
        file: t.filepath,
        message: `Markdown file lacks "# Task NNN" heading and is not a declared chapter DAG`,
      });
    }
  }
  return findings;
}

function checkMissingSelfStandingContext(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  const requiredSections = ["## Context", "## Goal", "## Acceptance Criteria"];
  for (const t of tasks) {
    if (t.headingNumber === null) continue; // only for executable tasks
    for (const section of requiredSections) {
      if (!t.body.includes(section)) {
        findings.push({
          severity: "warning",
          checkId: "missing-self-standing-context",
          file: t.filepath,
          message: `Task file missing required section: ${section}`,
        });
      }
    }
  }
  return findings;
}

function checkRangeCollisions(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  const executableNumbers = new Set<number>();
  for (const t of tasks) {
    if (t.headingNumber !== null) {
      executableNumbers.add(t.headingNumber);
    }
  }

  for (const t of tasks) {
    if (!t.isChapterDag) continue;
    const range = extractChapterRange(t.body);
    if (!range) continue;
    for (let n = range.start; n <= range.end; n++) {
      if (executableNumbers.has(n)) {
        // Check if this executable task is actually part of the chapter
        const taskFile = tasks.find((tf) => tf.headingNumber === n);
        if (taskFile) {
          // It's okay if the task is inside the chapter range
          continue;
        }
        findings.push({
          severity: "error",
          checkId: "range-collision",
          file: t.filepath,
          message: `Chapter DAG range ${range.start}–${range.end} collides with executable task ${n} outside chapter`,
        });
      }
    }
  }
  return findings;
}

function checkChapterRangeMatch(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (!t.isChapterDag) continue;
    const bodyRange = extractChapterRange(t.body);
    const filenameRange = extractFilenameChapterRange(t.filename);
    if (bodyRange && filenameRange) {
      if (bodyRange.start !== filenameRange.start || bodyRange.end !== filenameRange.end) {
        findings.push({
          severity: "error",
          checkId: "chapter-range-mismatch",
          file: t.filepath,
          message: `Chapter body declares range ${bodyRange.start}–${bodyRange.end} but filename declares ${filenameRange.start}–${filenameRange.end}`,
        });
      }
    }
  }
  return findings;
}

function extractFilenameChapterRange(filename: string): { start: number; end: number } | null {
  const m = /\d{8}-(\d+)-(\d+)-/.exec(filename);
  if (m) {
    return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  }
  return null;
}

function checkChapterTasksExist(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  const fileNumbers = new Set<number>();
  for (const t of tasks) {
    const fn = extractFilenameNumber(t.filename);
    if (fn !== null) fileNumbers.add(fn);
  }

  for (const t of tasks) {
    if (!t.isChapterDag) continue;
    const range = extractChapterRange(t.body);
    if (!range) continue;
    for (let n = range.start; n <= range.end; n++) {
      if (!fileNumbers.has(n)) {
        findings.push({
          severity: "warning",
          checkId: "chapter-missing-task",
          file: t.filepath,
          message: `Chapter range ${range.start}–${range.end} references missing task file for ${n}`,
        });
      }
    }
  }
  return findings;
}

function checkChapterHeadingConsistency(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const t of tasks) {
    if (!t.isChapterDag) continue;
    const range = extractChapterRange(t.body);
    if (!range) continue;
    for (const tf of tasks) {
      if (tf.headingNumber !== null && tf.headingNumber >= range.start && tf.headingNumber <= range.end) {
        // This task file's heading is inside the chapter range — that's fine
        continue;
      }
      if (tf.headingNumber !== null) {
        const fn = extractFilenameNumber(tf.filename);
        if (fn !== null && fn >= range.start && fn <= range.end && tf.headingNumber !== fn) {
          findings.push({
            severity: "error",
            checkId: "chapter-heading-inconsistent",
            file: tf.filepath,
            message: `Filename number ${fn} is inside chapter range ${range.start}–${range.end} but heading is Task ${tf.headingNumber}`,
          });
        }
      }
    }
  }
  return findings;
}

function checkChapterOverlap(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];
  const chapters: Array<{ filepath: string; range: { start: number; end: number } }> = [];

  for (const t of tasks) {
    if (!t.isChapterDag) continue;
    const range = extractChapterRange(t.body);
    if (!range) continue;
    chapters.push({ filepath: t.filepath, range });
  }

  for (let i = 0; i < chapters.length; i++) {
    for (let j = i + 1; j < chapters.length; j++) {
      const a = chapters[i];
      const b = chapters[j];
      if (a.range.start <= b.range.end && b.range.start <= a.range.end) {
        findings.push({
          severity: "error",
          checkId: "chapter-range-overlap",
          file: a.filepath,
          message: `Chapter range ${a.range.start}–${a.range.end} overlaps with ${b.filepath} range ${b.range.start}–${b.range.end}`,
        });
      }
    }
  }
  return findings;
}

function scanReviews(
  allTaskNumbers: Set<number>,
  taskByNumber: Map<number, TaskFile>,
): Finding[] {
  const findings: Finding[] = [];
  const files = readDirSafe(REVIEWS_DIR, (n) => n.endsWith(".md"));

  // Track which tasks have reviews (by task number)
  const tasksWithReviews = new Set<number>();

  for (const filename of files) {
    const filepath = join(REVIEWS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;

    // Check front matter review_of first
    const { frontMatter } = parseFrontMatter(content);
    const reviewOf = frontMatter["review_of"];
    if (typeof reviewOf === "number") {
      if (!allTaskNumbers.has(reviewOf)) {
        findings.push({
          severity: "warning",
          checkId: "stale-review-reference",
          file: filepath,
          message: `Review front matter references non-existent task ${reviewOf}`,
        });
      } else {
        tasksWithReviews.add(reviewOf);
      }
    }

    // Also check body text references
    const nums = extractTaskRefsFromBody(content);
    for (const num of nums) {
      if (!allTaskNumbers.has(num)) {
        findings.push({
          severity: "warning",
          checkId: "stale-review-reference",
          file: filepath,
          message: `Review references non-existent task ${num}`,
        });
      } else {
        tasksWithReviews.add(num);
      }
    }
  }

  // Orphan review check: tasks in in_review with no review file
  for (const [num, task] of taskByNumber.entries()) {
    const status = task.frontMatter["status"];
    if (status === "in_review" && !tasksWithReviews.has(num)) {
      findings.push({
        severity: "warning",
        checkId: "orphan-review",
        file: task.filepath,
        message: `Task ${num} is in_review but has no matching review file`,
      });
    }
  }

  return findings;
}

function scanDecisions(
  allTaskNumbers: Set<number>,
  taskByNumber: Map<number, TaskFile>,
): Finding[] {
  const findings: Finding[] = [];
  const files = readDirSafe(DECISIONS_DIR, (n) => n.endsWith(".md"));

  // Track which tasks have closure decisions (by task number)
  const tasksWithClosures = new Set<number>();

  for (const filename of files) {
    const filepath = join(DECISIONS_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;

    // Check front matter closes_tasks first
    const { frontMatter } = parseFrontMatter(content);
    const closesTasks = frontMatter["closes_tasks"];
    if (Array.isArray(closesTasks)) {
      for (const ct of closesTasks) {
        const num = typeof ct === "number" ? ct : typeof ct === "string" ? parseInt(ct, 10) : null;
        if (num !== null) {
          if (!allTaskNumbers.has(num)) {
            findings.push({
              severity: "warning",
              checkId: "stale-closure-reference",
              file: filepath,
              message: `Decision front matter closes_tasks references non-existent task ${num}`,
            });
          } else {
            tasksWithClosures.add(num);
          }
        }
      }
    }

    // Also check body text references
    const nums = extractTaskRefsFromBody(content);
    for (const num of nums) {
      if (!allTaskNumbers.has(num)) {
        findings.push({
          severity: "warning",
          checkId: "stale-decision-reference",
          file: filepath,
          message: `Decision references non-existent task ${num}`,
        });
      } else {
        tasksWithClosures.add(num);
      }
    }
  }

  // Orphan closure check: tasks marked closed with no closure decision
  for (const [num, task] of taskByNumber.entries()) {
    const status = task.frontMatter["status"];
    if (status === "closed" && !tasksWithClosures.has(num)) {
      findings.push({
        severity: "warning",
        checkId: "orphan-closure",
        file: task.filepath,
        message: `Task ${num} is closed but has no matching closure decision`,
      });
    }
  }

  return findings;
}

function scanRoster(allTaskNumbers: Set<number>): Finding[] {
  const findings: Finding[] = [];
  const rosterPath = join(AGENTS_DIR, "roster.json");
  const content = readFileSafe(rosterPath);
  if (content === null) {
    findings.push({
      severity: "warning",
      checkId: "stale-assignment",
      file: rosterPath,
      message: "roster.json not found",
    });
    return findings;
  }
  let roster: unknown;
  try {
    roster = JSON.parse(content);
  } catch {
    findings.push({
      severity: "error",
      checkId: "stale-assignment",
      file: rosterPath,
      message: "roster.json is invalid JSON",
    });
    return findings;
  }
  if (typeof roster !== "object" || roster === null || !("agents" in roster)) {
    return findings;
  }
  const agents = (roster as Record<string, unknown>).agents;
  if (!Array.isArray(agents)) return findings;
  for (const agent of agents) {
    if (typeof agent !== "object" || agent === null) continue;
    const task = (agent as Record<string, unknown>).task;
    if (task === null || task === undefined) continue;
    const taskNum = typeof task === "number" ? task : typeof task === "string" ? parseInt(task, 10) : null;
    if (taskNum !== null && !allTaskNumbers.has(taskNum)) {
      findings.push({
        severity: "warning",
        checkId: "stale-assignment",
        file: rosterPath,
        message: `Roster entry references non-existent task ${taskNum}`,
      });
    }
  }
  return findings;
}

function checkCrossingRegimeDeclarations(tasks: TaskFile[]): Finding[] {
  const findings: Finding[] = [];

  // Keywords that suggest a task is introducing a new durable authority-changing boundary.
  // This is a heuristic — it will produce false positives on tasks that mention these
  // terms without introducing a new crossing. The warning message acknowledges this.
  const crossingKeywords =
    /\b(new\s+durable|authority\s+owner|boundary\s+crossing|crossing\s+artifact|new\s+boundary|new\s+crossing|durable\s+artifact\s+(from|across|between))\b/i;

  // References that indicate the task acknowledges the crossing regime contract.
  const regimeReferences =
    /\b(crossing\s+regime|SEMANTICS\.md\s+§2\.15|Task\s+49[567])\b/i;

  for (const t of tasks) {
    if (t.headingNumber === null) continue; // only executable tasks

    if (crossingKeywords.test(t.body) && !regimeReferences.test(t.body)) {
      findings.push({
        severity: "warning",
        checkId: "crossing-regime-missing-declaration",
        file: t.filepath,
        message:
          "Task appears to introduce a durable authority-changing boundary but does not reference the crossing regime declaration contract (SEMANTICS.md §2.15, Task 495). If this task does not introduce a new crossing, this warning is a false positive and may be ignored.",
      });
    }
  }

  return findings;
}

function scanLearning(allTaskNumbers: Set<number>): Finding[] {
  const findings: Finding[] = [];
  const files = readDirSafe(LEARNING_DIR, (n) => n.endsWith(".json"));
  for (const filename of files) {
    const filepath = join(LEARNING_DIR, filename);
    const content = readFileSafe(filepath);
    if (content === null) continue;
    let artifact: unknown;
    try {
      artifact = JSON.parse(content);
    } catch {
      continue;
    }
    if (typeof artifact !== "object" || artifact === null) continue;
    const source = (artifact as Record<string, unknown>).source;
    if (typeof source !== "object" || source === null) continue;
    const kind = (source as Record<string, unknown>).kind;
    if (kind !== "task") continue;
    // Try to find task references in the artifact
    const nums = extractTaskRefsFromBody(content);
    for (const num of nums) {
      if (!allTaskNumbers.has(num)) {
        findings.push({
          severity: "warning",
          checkId: "stale-learning-reference",
          file: filepath,
          message: `Learning artifact references non-existent task ${num}`,
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  try {
    const { tasks, findings } = scanTasks();
    const allTaskNumbers = new Set<number>();
    for (const t of tasks) {
      if (t.headingNumber !== null) {
        allTaskNumbers.add(t.headingNumber);
      }
    }

    findings.push(...checkDuplicateTaskNumbers(tasks));
    findings.push(...checkFilenameHeadingMismatch(tasks));
    findings.push(...checkStaleDependencies(tasks, allTaskNumbers));
    findings.push(...checkStaleBlockers(tasks, allTaskNumbers));
    findings.push(...checkMissingHeading(tasks));
    findings.push(...checkMissingSelfStandingContext(tasks));
    findings.push(...checkRangeCollisions(tasks));
    findings.push(...checkChapterRangeMatch(tasks));
    findings.push(...checkChapterTasksExist(tasks));
    findings.push(...checkChapterHeadingConsistency(tasks));
    findings.push(...checkChapterOverlap(tasks));
    const taskByNumber = new Map<number, TaskFile>();
    for (const t of tasks) {
      if (t.headingNumber !== null) {
        taskByNumber.set(t.headingNumber, t);
      }
    }

    findings.push(...scanReviews(allTaskNumbers, taskByNumber));
    findings.push(...scanDecisions(allTaskNumbers, taskByNumber));
    findings.push(...scanRoster(allTaskNumbers));
    findings.push(...scanLearning(allTaskNumbers));
    findings.push(...checkCrossingRegimeDeclarations(tasks));

    // Sort: errors first, then by file
    findings.sort((a, b) => {
      if (a.severity !== b.severity) {
        return a.severity === "error" ? -1 : 1;
      }
      return a.file.localeCompare(b.file);
    });

    for (const f of findings) {
      console.log(`${f.severity}: ${f.checkId}: ${f.file}: ${f.message}`);
    }

    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");

    console.log("");
    console.log(`Task Graph Lint complete. ${errors.length} error(s), ${warnings.length} warning(s).`);

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
