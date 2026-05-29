import { enforceMcpGuard } from './mcp-guard.mjs';
enforceMcpGuard(process.argv);

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openTaskLifecycleStore } from './vendor/task-governance/dist/task-lifecycle-store.js';
import { parseFrontMatter } from './vendor/task-governance/dist/task-governance.js';
import { parseTaskSpecFromMarkdown } from './vendor/task-governance/dist/task-spec.js';

const cwd = process.argv[2] || process.cwd();
const tasksDir = join(resolve(cwd), '.ai', 'do-not-open', 'tasks');
const dryRun = process.argv.includes('--dry-run');

const store = openTaskLifecycleStore(cwd);
let synced = 0;
let skipped = 0;
let errors = 0;

try {
  const files = await readdir(tasksDir);
  const mdFiles = files.filter(f => f.endsWith('.md') && !f.includes('-closure') && !f.includes('-EXECUTED') && !f.includes('-DONE') && !f.includes('-RESULT') && !f.includes('-FINAL') && !f.includes('-SUPERSEDED'));

  for (const file of mdFiles) {
    const filePath = join(tasksDir, file);
    const content = await readFile(filePath, 'utf8');
    const { frontMatter, body } = parseFrontMatter(content);
    const taskId = file.replace(/\.md$/, '');

    // Extract task number from filename: YYYYMMDD-N-slug.md
    const numMatch = file.match(/-(\d+)-/);
    const taskNumber = numMatch ? Number(numMatch[1]) : null;
    if (!taskNumber) {
      console.error(`Skip: cannot extract task number from ${file}`);
      errors++;
      continue;
    }

    const spec = parseTaskSpecFromMarkdown({ taskId, taskNumber, frontMatter, body });

    const existing = store.getTaskSpec(taskId);
    if (existing && existing.title === spec.title && existing.updated_at === spec.updated_at) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`Would sync: #${taskNumber} ${taskId} -> "${spec.title}"`);
      synced++;
      continue;
    }

    store.upsertTaskSpec({
      task_id: taskId,
      task_number: taskNumber,
      title: spec.title,
      chapter_markdown: spec.chapter || null,
      goal_markdown: spec.goal || null,
      context_markdown: spec.context || null,
      required_work_markdown: spec.required_work || null,
      non_goals_markdown: spec.non_goals || null,
      acceptance_criteria_json: JSON.stringify(spec.acceptance_criteria),
      dependencies_json: JSON.stringify(spec.dependencies),
      updated_at: spec.updated_at,
    });

    console.log(`Synced: #${taskNumber} ${taskId} -> "${spec.title}"`);
    synced++;
  }

  console.log(JSON.stringify({
    schema: 'narada.task.spec_sync.v0',
    dry_run: dryRun,
    synced,
    skipped,
    errors,
    total_scanned: mdFiles.length,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    schema: 'narada.task.spec_sync.v0',
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
} finally {
  store.db.close();
}
