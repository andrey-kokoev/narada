import { describe, expect, it } from 'vitest';
import { classifyTaskHandoffActionability } from '../../src/lib/task-actionability.js';

describe('task handoff actionability', () => {
  it('blocks numbered TBD Required Work for executable tasks', () => {
    expect(classifyTaskHandoffActionability({
      taskNumber: 1133,
      status: 'open',
      requiredWork: '1. TBD',
    })).toMatchObject({
      status: 'underspecified',
      reason: expect.stringContaining('Required Work'),
      repair_command: 'narada task amend 1133 --required-work <actionable-work-plan>',
    });
  });

  it('blocks empty Required Work for executable tasks', () => {
    expect(classifyTaskHandoffActionability({
      taskNumber: 1138,
      status: 'claimed',
      requiredWork: '   ',
    })).toMatchObject({
      status: 'underspecified',
      repair_command: 'narada task amend 1138 --required-work <actionable-work-plan>',
    });
  });

  it('allows concrete multi-step Required Work', () => {
    expect(classifyTaskHandoffActionability({
      taskNumber: 1138,
      status: 'claimed',
      requiredWork: '1. Add the guard.\n2. Verify the regression.\n3. Record evidence.',
    })).toMatchObject({
      status: 'actionable',
      reason: null,
      repair_command: null,
    });
  });

  it('does not apply executable handoff checks to deferred tasks', () => {
    expect(classifyTaskHandoffActionability({
      taskNumber: 403,
      status: 'deferred',
      requiredWork: '1. TBD',
    })).toMatchObject({
      status: 'not_applicable',
      reason: 'deferred task is not executable handoff work',
      repair_command: null,
    });
  });
});
