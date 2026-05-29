import { openTaskLifecycleStore } from '@narada2/task-governance/task-lifecycle-store';

const store = openTaskLifecycleStore(process.argv[2] || process.cwd());
try {
  const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const t of tables) {
    if (t.name.includes('task') || t.name.includes('spec') || t.name.includes('assign') || t.name.includes('roster')) {
      console.log('Table:', t.name);
      const cols = store.db.prepare(`PRAGMA table_info(${t.name})`).all();
      for (const c of cols) {
        console.log('  ' + c.name + ' ' + c.type);
      }
    }
  }
} finally {
  store.db.close();
}
