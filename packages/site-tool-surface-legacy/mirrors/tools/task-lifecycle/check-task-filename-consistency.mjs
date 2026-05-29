import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const cwd = process.argv[2] || process.cwd();
const TASKS_DIR = '.ai/do-not-open/tasks';

function extractTaskNumberFromFileName(fileName) {
  const base = fileName.replace(/\.md$/, '');
  const match = base.match(/-(\d+)-/);
  return match ? Number(match[1]) : null;
}

try {
  const dir = join(resolve(cwd), TASKS_DIR);
  const files = await readdir(dir).catch(() => []);
  const mdFiles = files.filter((f) => f.endsWith('.md'));
  const fileByNumber = new Map();
  for (const f of mdFiles) {
    const num = extractTaskNumberFromFileName(f);
    if (num !== null) {
      fileByNumber.set(num, f);
    }
  }

  const store = openTaskLifecycleStore(cwd);
  const mismatches = [];
  try {
    const rows = store.db.prepare('SELECT task_id, task_number FROM task_lifecycle').all();
    for (const row of rows) {
      const lifecycleNum = Number(row.task_number);
      const expectedFile = fileByNumber.get(lifecycleNum);
      if (!expectedFile) {
        // Check if any file matches the task_id
        const taskIdFile = mdFiles.find((f) => f.replace(/\.md$/, '') === row.task_id);
        if (!taskIdFile) {
          mismatches.push({
            type: 'lifecycle_without_file',
            task_id: row.task_id,
            task_number: lifecycleNum,
            detail: `Lifecycle task ${lifecycleNum} (${row.task_id}) has no matching task file`,
          });
        } else {
          const fileNum = extractTaskNumberFromFileName(taskIdFile);
          mismatches.push({
            type: 'filename_lifecycle_number_mismatch',
            task_id: row.task_id,
            task_number: lifecycleNum,
            file: taskIdFile,
            file_number: fileNum,
            detail: `Filename number ${fileNum} does not match lifecycle task_number ${lifecycleNum} for ${row.task_id}`,
          });
        }
      }
    }
  } finally {
    store.db.close();
  }

  console.log(JSON.stringify({
    schema: 'narada.task.filename_consistency.v0',
    ok: mismatches.length === 0,
    mismatch_count: mismatches.length,
    mismatches,
  }, null, 2));
} catch (err) {
  console.error(JSON.stringify({
    schema: 'narada.task.filename_consistency.v0',
    ok: false,
    mismatch_count: -1,
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
}
