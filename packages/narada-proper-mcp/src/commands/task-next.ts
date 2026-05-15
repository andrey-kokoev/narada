import { runNaradaJson, type CommandEnvelope } from './process.js';

export interface TaskNextOptions {
  cwd: string;
  agent: string;
  format?: string;
}

export async function taskPeekNextCommand(options: TaskNextOptions): Promise<CommandEnvelope> {
  return runNaradaJson(['task', 'peek-next', '--agent', options.agent], options.cwd);
}

export async function taskWorkNextCommand(options: TaskNextOptions): Promise<CommandEnvelope> {
  return runNaradaJson(['task', 'work-next', '--agent', options.agent], options.cwd);
}
