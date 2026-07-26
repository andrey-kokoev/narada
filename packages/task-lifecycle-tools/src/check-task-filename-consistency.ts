import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const cwd: any = process.argv[2] || process.cwd();
const TASKS_DIR: any = '.ai/do-not-open/tasks';

function extractTaskNumberFromFileName(fileName: any) : any {
  const base: any = fileName.replace(/\.md$/, '');
  const match: any = base.match(/-(\d+)-/);
  return match ? Number(match[1]) : null;
}

try {
  const dir: any = join(resolve(cwd), TASKS_DIR);
  const files: any = await readdir(dir).catch(() : any => []);
  const mdFiles: any = files.filter((f: any) : any => f.endsWith('.md'));
  const fileByNumber: any = new Map();
  for (const f of mdFiles) {
    const num: any = extractTaskNumberFromFileName(f);
    if (num !== null) {
      fileByNumber.set(num, f);
    }
  }

  const store: any = openTaskLifecycleStore(cwd);
  const mismatches: any = [];
  try {
    const rows: any = store.db.prepare('SELECT task_id, task_number FROM task_lifecycle').all();
    for (const row of rows) {
      const lifecycleNum: any = Number(row.task_number);
      const expectedFile: any = fileByNumber.get(lifecycleNum);
      if (!expectedFile) {
        // Check if any file matches the task_id
        const taskIdFile: any = mdFiles.find((f: any) : any => f.replace(/\.md$/, '') === row.task_id);
        if (!taskIdFile) {
          mismatches.push({
            type: 'lifecycle_without_file',
            task_id: row.task_id,
            task_number: lifecycleNum,
            detail: `Lifecycle task ${lifecycleNum} (${row.task_id}) has no matching task file`,
          });
        } else {
          const fileNum: any = extractTaskNumberFromFileName(taskIdFile);
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
} catch (err: any) {
  console.error(JSON.stringify({
    schema: 'narada.task.filename_consistency.v0',
    ok: false,
    mismatch_count: -1,
    error: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
}
