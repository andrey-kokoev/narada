import type { TaskAdmissionWriteOperation, TaskDbAdapter, TaskDbSchemaStatement } from '../../src/index.js';

export class NeutralInMemoryTaskDbAdapter implements TaskDbAdapter {
  readonly schemaStatements: TaskDbSchemaStatement[] = [];
  readonly admissionOperations: TaskAdmissionWriteOperation[] = [];

  constructor(readonly adapterId: string) {}

  async executeSchemaStatement(statement: TaskDbSchemaStatement): Promise<void> {
    this.schemaStatements.push(statement);
  }

  async executeAdmissionWriteOperation(operation: TaskAdmissionWriteOperation): Promise<void> {
    this.admissionOperations.push(operation);
  }
}
