/**
 * CPU Profiling Script
 *
 * Generates CPU profiles for performance analysis.
 *
 * Usage:
 *   node --inspect scripts/profile.ts [duration]
 *   npx tsx --inspect scripts/profile.ts [duration]
 */

import { writeFileSync } from 'node:fs';
import { Session } from 'node:inspector';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface ProfileOptions {
  /** Profile duration in milliseconds */
  durationMs: number;
  /** Output file path */
  outputPath: string;
  /** Whether to include sample intervals */
  sampleInterval: number;
}

/**
 * Start CPU profiling
 */
async function startProfiling(session: Session): Promise<void> {
  return new Promise((resolve, reject) => {
    session.post('Profiler.enable', err => {
      if (err) {
        reject(err);
        return;
      }
      session.post('Profiler.start', err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Stop CPU profiling and get profile data
 */
async function stopProfiling(session: Session): Promise<unknown> {
  return new Promise((resolve, reject) => {
    session.post('Profiler.stop', (err, params) => {
      if (err) {
        reject(err);
        return;
      }
      resolve((params as { profile: unknown }).profile);
    });
  });
}

/**
 * Profile a sync operation
 */
async function profileSync(options: ProfileOptions): Promise<void> {
  const session = new Session();
  session.connect();

  console.log(`Starting profile for ${options.durationMs}ms...`);
  console.log('Output:', options.outputPath);

  // Import required modules
  const { createMockAdapter } = await import(
    '../packages/layers/control-plane/src/adapter/graph/mock-adapter.js'
  );
  const { DefaultSyncRunner } = await import(
    '../packages/layers/control-plane/src/runner/sync-once.js'
  );
  const { FileCursorStore } = await import(
    '../packages/layers/control-plane/src/persistence/cursor.js'
  );
  const { FileApplyLogStore } = await import(
    '../packages/layers/control-plane/src/persistence/apply-log.js'
  );
  const { DefaultProjector } = await import(
    '../packages/layers/control-plane/src/projector/apply-event.js'
  );
  const { FileLock } = await import(
    '../packages/layers/control-plane/src/persistence/lock.js'
  );

  const rootDir = await mkdtemp(join(tmpdir(), 'profile-'));

  try {
    // Setup sync components
    const adapter = createMockAdapter({ initialMessageCount: 100 });
    const cursorStore = new FileCursorStore({ rootDir, mailboxId: 'profile@example.com' });
    const applyLogStore = new FileApplyLogStore({ rootDir });
    const projector = new DefaultProjector({ rootDir, tombstonesEnabled: false });
    const lock = new FileLock({ rootDir, acquireTimeoutMs: 5000 });

    const runner = new DefaultSyncRunner({
      rootDir,
      adapter,
      cursorStore,
      applyLogStore,
      projector,
      acquireLock: () => lock.acquire(),
    });

    // Start profiling
    await startProfiling(session);

    // Run sync operation
    console.log('Running sync operation...');
    const startTime = performance.now();

    // Run multiple sync cycles during profiling
    while (performance.now() - startTime < options.durationMs) {
      await runner.syncOnce();
    }

    // Stop profiling
    console.log('Stopping profile...');
    const profile = await stopProfiling(session);

    // Save profile
    writeFileSync(options.outputPath, JSON.stringify(profile));
    console.log('Profile saved to:', options.outputPath);

    // Print summary
    const duration = performance.now() - startTime;
    console.log(`\nProfiled for ${duration.toFixed(0)}ms`);
    console.log('Profile size:', (JSON.stringify(profile).length / 1024).toFixed(1), 'KB');
  } finally {
    session.disconnect();
    await rm(rootDir, { recursive: true, force: true });
  }
}

/**
 * Profile normalization operations
 */
async function profileNormalization(options: ProfileOptions): Promise<void> {
  const session = new Session();
  session.connect();

  console.log(`Starting normalization profile for ${options.durationMs}ms...`);

  const { normalizeMessage } = await import(
    '../packages/layers/control-plane/src/normalize/message.js'
  );
  const { buildEventId } = await import(
    '../packages/layers/control-plane/src/ids/event-id.js'
  );

  const message = {
    id: 'test-123',
    createdDateTime: new Date().toISOString(),
    receivedDateTime: new Date().toISOString(),
    subject: 'Test Subject for Profiling',
    bodyPreview: 'This is a preview of the message body content...',
    body: {
      contentType: 'html',
      content: '<html><body><h1>Test</h1><p>Content</p></body></html>',
    },
    isRead: false,
    from: {
      emailAddress: { name: 'Test User', address: 'test@example.com' },
    },
    toRecipients: [
      { emailAddress: { name: 'Recipient', address: 'recipient@example.com' } },
    ],
  };

  // Start profiling
  await startProfiling(session);

  const startTime = performance.now();
  let iterations = 0;

  while (performance.now() - startTime < options.durationMs) {
    const normalized = normalizeMessage(message, {
      mailbox_id: 'test@example.com',
      body_policy: 'full',
      attachment_policy: 'metadata',
      include_headers: false,
    });

    buildEventId(normalized, 'create');
    iterations++;
  }

  // Stop profiling
  const profile = await stopProfiling(session);

  const outputPath = options.outputPath.replace('.cpuprofile', '-normalization.cpuprofile');
  writeFileSync(outputPath, JSON.stringify(profile));

  console.log('Iterations:', iterations);
  console.log('Profile saved to:', outputPath);

  session.disconnect();
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const durationMs = parseInt(args[0], 10) || 5000;
  const operation = args[1] || 'sync';

  const outputPath = join(process.cwd(), `profile-${operation}-${Date.now()}.cpuprofile`);

  const options: ProfileOptions = {
    durationMs,
    outputPath,
    sampleInterval: 1000, // 1ms sample interval
  };

  console.log('Exchange FS Sync - CPU Profiler');
  console.log('================================\n');

  try {
    if (operation === 'sync') {
      await profileSync(options);
    } else if (operation === 'normalization') {
      await profileNormalization(options);
    } else {
      console.error('Unknown operation:', operation);
      console.log('Usage: node --inspect scripts/profile.ts [duration_ms] [sync|normalization]');
      process.exit(1);
    }

    console.log('\nTo analyze:');
    console.log('1. Open Chrome DevTools');
    console.log('2. Go to Performance tab');
    console.log('3. Click "Load Profile"');
    console.log('4. Select:', outputPath);
  } catch (error) {
    console.error('Profiling failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { profileSync, profileNormalization };
