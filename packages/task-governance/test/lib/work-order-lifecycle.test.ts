import { describe, expect, it } from 'vitest';
import {
  createWorkOrderLifecycle,
  isTerminalWorkOrderLifecycleState,
  transitionWorkOrderLifecycle,
} from '../../src/work-order-lifecycle.js';

describe('work-order lifecycle', () => {
  it('models dispatch, review, repair, and completion as distinct phases', () => {
    let lifecycle = createWorkOrderLifecycle();
    for (const state of ['admitted', 'planned', 'dispatched', 'running', 'review', 'repaired', 'completed'] as const) {
      lifecycle = transitionWorkOrderLifecycle(lifecycle, state);
    }
    expect(lifecycle.state).toBe('completed');
    expect(isTerminalWorkOrderLifecycleState(lifecycle.state)).toBe(true);
  });

  it('rejects dispatch before planning and reopening completion', () => {
    expect(() => transitionWorkOrderLifecycle(createWorkOrderLifecycle(), 'dispatched')).toThrow(
      'invalid_work_order_lifecycle_transition: requested->dispatched',
    );
    expect(() => transitionWorkOrderLifecycle(createWorkOrderLifecycle('completed'), 'running')).toThrow(
      'invalid_work_order_lifecycle_transition: completed->running',
    );
  });
});
