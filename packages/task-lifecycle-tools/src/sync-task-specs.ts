import { enforceMcpGuard } from './mcp-guard.js';
enforceMcpGuard(process.argv);

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { parseFrontMatter } from '@narada2/task-governance/task-governance';
import { parseTaskSpecFromMarkdown } from '@narada2/task-governance/task-spec';

const cwd: any = process.argv[2] || process.cwd();
const tasksDir: any = join(resolve(cwd), '.ai', 'do-not-open', 'tasks');
const dryRun: any = process.argv.includes('--dry-run');

const store: any = openTaskLifecycleStore(cwd);
let synced: any = 0;
let skipped: any = 0;
let errors: any = 0;

try {
  const files: any = await readdir(tasksDir);
  const mdFiles: any = files.filter((f: any )=> f.endsWith('.md') && !f.includes('-closure') && !f.includes('-EXECUTED') && !f.includes('-DONE') && !f.includes('-RESULT') && !f.includes('-FINAL') && !f.includes('-SUPERSEDED'));

  for (const file of mdFiles) {
    const filePath: any = join(tasksDir, file);
    const content: any = await readFile(filePath, 'utf8');
    const { frontMatter, body }: any = parseFrontMatter(content);
    const taskId: any = file.replace(/\.md$/, '');

    // Extract task number from filename: YYYYMMDD-N-slug.md
    const numMatch: any = file.match(/-(\d+)-/);
    const taskNumber: any = numMatch ? Number(numMatch[1]) : null;
    if (!taskNumber) {
      console.error(`Skip: cannot extract task number from ${file}`);
      errors++;
      continue;
    }

    const spec: any = parseTaskSpecFromMarkdown({ taskId, taskNumber, frontMatter, body });

    const existing: any = store.getTaskSpec(taskId);
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
} catch (err: any) {
  console.error(JSON.stringify({
    schema: 'narada.task.spec_sync.v0',
    status: 'error',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
} finally {
  store.db.close();
}
