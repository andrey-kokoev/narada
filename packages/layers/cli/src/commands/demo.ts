import { createFormatter } from '../lib/formatter.js';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createMockAdapter } from '@narada2/control-plane';

export interface DemoOptions {
  count?: number;
  format?: 'json' | 'human' | 'auto';
}

export async function demoCommand(
  options: DemoOptions,
  _context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const fmt = createFormatter({ format: options.format ?? 'human', verbose: false });

  const count = options.count ?? 5;

  fmt.message('Narada Demo', 'info');
  fmt.message('This demo shows what Narada does with synthetic mailbox data.', 'info');
  fmt.message('No real mailbox or credentials are required.', 'info');

  const adapter = createMockAdapter({ messageCount: count, delayMs: 0 });
  const batch = await adapter.fetch_since(null);

  fmt.section('What Narada ingests');
  fmt.message(`Fetched ${batch.events.length} message(s) from the mock source.`, 'info');
  fmt.kv('Cursor', batch.next_cursor ?? 'none');

  fmt.section('Normalized events');
  for (const event of batch.events.slice(0, count)) {
    const payload = event.payload;
    fmt.message(`  • [${event.event_kind}] ${payload?.subject ?? '(no subject)'}`, 'info');
    fmt.kv('From', payload?.from ?? 'unknown', { indent: 4 });
    fmt.kv('ID', event.event_id, { indent: 4 });
  }

  fmt.section('What Narada would do next');
  fmt.message('1. Persist each event to the apply-log (idempotent)', 'info');
  fmt.message('2. Project events into the local filesystem state', 'info');
  fmt.message('3. Extract facts and admit contexts into the work queue', 'info');
  fmt.message('4. Run the primary charter against each context', 'info');
  fmt.message('5. Create durable draft proposals (safe by default)', 'info');

  fmt.message('In draft-only posture, no message is ever sent without operator approval.', 'warning');
  fmt.message('To try a real operation:', 'info');
  fmt.message('  narada init-repo ~/src/my-ops', 'info');
  fmt.message('  cd ~/src/my-ops', 'info');
  fmt.message('  narada want-mailbox help@company.com', 'info');

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      messageCount: batch.events.length,
      events: batch.events.map((e) => ({
        id: e.event_id,
        kind: e.event_kind,
        subject: e.payload?.subject,
      })),
    },
  };
}
