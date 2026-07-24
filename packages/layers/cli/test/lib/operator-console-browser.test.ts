import { describe, expect, it, vi } from 'vitest';
import { openOperatorConsoleWorkspace } from '../../src/lib/operator-console-browser.js';

describe('operator console browser projection', () => {
  it('opens the Operator Workspace URL by default through the governed projection', async () => {
    const openUrl = vi.fn(async () => undefined);

    const result = await openOperatorConsoleWorkspace('http://127.0.0.1:61729/', { openUrl });

    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:61729/');
    expect(result).toMatchObject({
      schema: 'narada.operator_projection_open_request.v1',
      status: 'opened',
      purpose: 'operator_console_workspace',
      target_ref: 'http://127.0.0.1:61729/',
    });
  });

  it('records an explicit no-open policy without invoking the browser', async () => {
    const openUrl = vi.fn(async () => undefined);

    const result = await openOperatorConsoleWorkspace('http://127.0.0.1:61729/', {
      shouldOpen: false,
      openUrl,
    });

    expect(openUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'suppressed',
      admission_reason: 'operator_policy:no_open',
    });
  });
});
