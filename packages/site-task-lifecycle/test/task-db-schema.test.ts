import { describe, expect, it } from 'vitest';
import { TASK_DB_SCHEMA_STATEMENTS, buildTaskDbInitPlan } from '../src/index.js';

describe('task DB schema init plan', () => {
  it('returns neutral schema statements for receiving-Site task lifecycle records', () => {
    const plan = buildTaskDbInitPlan('D:\\code\\narada\\.ai\\task-lifecycle.db');

    expect(plan.schema).toBe('narada.site_task_lifecycle.task_db_init_plan.v0');
    expect(plan.statements).toBe(TASK_DB_SCHEMA_STATEMENTS);
    expect(plan.statements.map((statement) => statement.name)).toEqual([
      'task_records',
      'task_evidence_refs',
      'task_admission_events',
    ]);
    expect(plan.statements.map((statement) => statement.sql).join('\n')).not.toContain('narada_andrey');
  });

  it('records denied source import findings without using source databases', () => {
    const plan = buildTaskDbInitPlan('D:\\code\\narada\\.ai\\task-lifecycle.db', [
      'C:\\Users\\Andrey\\Narada\\.ai\\task-lifecycle.db',
      'C:\\ProgramData\\Narada\\sites\\pc\\desktop-sunroom-2\\runtime\\pc.db',
    ]);

    expect(plan.sourceImportFindings.map((finding) => finding.reason)).toEqual([
      'source task lifecycle database',
      'PC-locus runtime state',
    ]);
    expect(plan.deniedSourceImports).toContain('source task lifecycle databases');
  });
});
