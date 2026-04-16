/**
 * Interactive configuration command using @clack/prompts
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import * as p from '@clack/prompts';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { buildGraphTokenProvider } from '@narada/exchange-fs-sync';
import { GraphHttpClient } from '@narada/exchange-fs-sync';
import type { GraphListResponse, GraphMessage } from '@narada/exchange-fs-sync';

export interface ConfigInteractiveOptions {
  output?: string;
  force?: boolean;
  format?: 'json' | 'human' | 'auto';
  testConnection?: boolean;
}

interface ConfigValues {
  scope_id: string;
  root_dir: string;
  graph_user_id: string;
  container_ref: string;
  test_connection: boolean;
  config_path: string;
}

const DEFAULT_CONFIG = {
  graph: {
    prefer_immutable_ids: true,
  },
  scope: {
    included_item_kinds: ['message'],
  },
  normalize: {
    attachment_policy: 'metadata_only',
    body_policy: 'text_only',
    include_headers: false,
    tombstones_enabled: true,
  },
  runtime: {
    polling_interval_ms: 60000,
    acquire_lock_timeout_ms: 30000,
    cleanup_tmp_on_startup: true,
    rebuild_views_after_sync: false,
  },
  lifecycle: {
    tombstone_retention_days: 30,
    archive_after_days: 90,
    archive_dir: 'archive',
    compress_archives: true,
    retention: {
      preserve_flagged: true,
      preserve_unread: true,
    },
    schedule: {
      frequency: 'manual',
      max_run_time_minutes: 60,
    },
  },
  charter: {
    runtime: 'mock',
  },
  policy: {
    primary_charter: 'support_steward',
    allowed_actions: ['draft_reply', 'send_reply', 'mark_read', 'no_action'],
  },
};

/**
 * Test Graph API connection with provided credentials
 */
async function testGraphConnection(config: {
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  user_id: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const tenantId = config.tenant_id || process.env.GRAPH_TENANT_ID;
    const clientId = config.client_id || process.env.GRAPH_CLIENT_ID;
    const clientSecret = config.client_secret || process.env.GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      return {
        success: false,
        message: 'Missing credentials. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET environment variables.',
      };
    }

    const tokenProvider = buildGraphTokenProvider({
      config: {
        graph: {
          tenant_id: tenantId,
          client_id: clientId,
          client_secret: clientSecret,
          user_id: config.user_id,
          prefer_immutable_ids: true,
        },
      } as any,
    });

    const client = new GraphHttpClient({
      tokenProvider,
      preferImmutableIds: true,
    });

    // Try a lightweight mailbox read to validate auth and mailbox access.
    await client.getJson<GraphListResponse<GraphMessage>>(
      `/users/${encodeURIComponent(config.user_id)}/messages?$top=1&$select=id`,
    );

    return { success: true, message: 'Connection successful!' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Connection failed: ${message}` };
  }
}

/**
 * Run interactive prompts to collect configuration
 */
async function runPrompts(defaultOutputPath: string): Promise<ConfigValues | null> {
  p.intro('Exchange FS Sync - Interactive Configuration');

  const group = await p.group(
    {
      scope_id: () =>
        p.text({
          message: 'Scope ID (e.g. email address):',
          placeholder: 'user@example.com',
          validate(value) {
            if (!value) return 'Scope ID is required';
          },
        }),

      root_dir: () =>
        p.text({
          message: 'Data directory:',
          placeholder: './data',
          defaultValue: './data',
        }),

      graph_user_id: ({ results }) =>
        p.text({
          message: 'Graph API User ID:',
          placeholder: results.scope_id || 'user@example.com',
          defaultValue: results.scope_id || 'user@example.com',
        }),

      container_ref: () =>
        p.text({
          message: 'Folder to sync:',
          placeholder: 'inbox',
          defaultValue: 'inbox',
        }),

      test_connection: () =>
        p.confirm({
          message: 'Test connection before saving?',
          initialValue: true,
        }),

      config_path: () =>
        p.text({
          message: 'Config file path:',
          placeholder: defaultOutputPath,
          defaultValue: defaultOutputPath,
        }),
    },
    {
      onCancel: () => {
        p.cancel('Configuration cancelled.');
        process.exit(0);
      },
    }
  );

  return group as ConfigValues;
}

export async function configInteractiveCommand(
  options: ConfigInteractiveOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { logger } = context;
  const fmt = createFormatter({ format: options.format, verbose: false });

  // Run interactive prompts
  const values = await runPrompts(options.output || './config.json');
  if (!values) {
    return { exitCode: ExitCode.SUCCESS, result: { status: 'cancelled' } };
  }

  const outputPath = resolve(values.config_path);

  // Check if file exists
  if (existsSync(outputPath) && !options.force) {
    const overwrite = await p.confirm({
      message: `File ${outputPath} already exists. Overwrite?`,
      initialValue: false,
    });

    if (!overwrite) {
      p.cancel('Configuration cancelled.');
      return { exitCode: ExitCode.SUCCESS, result: { status: 'cancelled' } };
    }
  }

  // Build config object
  const config = {
    root_dir: values.root_dir,
    scopes: [
      {
        scope_id: values.scope_id,
        root_dir: values.root_dir,
        sources: [
          {
            type: 'graph',
            ...DEFAULT_CONFIG.graph,
            user_id: values.graph_user_id,
          },
        ],
        context_strategy: 'mailbox',
        scope: {
          ...DEFAULT_CONFIG.scope,
          included_container_refs: [values.container_ref.trim()].filter(Boolean),
        },
        normalize: DEFAULT_CONFIG.normalize,
        runtime: DEFAULT_CONFIG.runtime,
        charter: DEFAULT_CONFIG.charter,
        policy: DEFAULT_CONFIG.policy,
      },
    ],
    lifecycle: DEFAULT_CONFIG.lifecycle,
    charter: DEFAULT_CONFIG.charter,
    policy: DEFAULT_CONFIG.policy,
  };

  // Test connection if requested
  if (values.test_connection) {
    const spinner = p.spinner();
    spinner.start('Testing Graph API connection...');

    const testResult = await testGraphConnection({
      user_id: values.graph_user_id,
    });

    if (testResult.success) {
      spinner.stop('Connection successful! ✓');
    } else {
      spinner.stop('Connection failed ✗');
      p.log.warn(testResult.message);

      const continueAnyway = await p.confirm({
        message: 'Save configuration anyway?',
        initialValue: false,
      });

      if (!continueAnyway) {
        p.cancel('Configuration cancelled.');
        return { exitCode: ExitCode.SUCCESS, result: { status: 'cancelled' } };
      }
    }
  }

  // Write config file
  try {
    await writeFile(outputPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    logger.info('Config written', { outputPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`Failed to write config file: ${message}`);
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: { status: 'error', error: message },
    };
  }

  // Success output
  p.outro(`Configuration saved to ${outputPath}`);

  if (fmt.getFormat() === 'json') {
    return {
      exitCode: ExitCode.SUCCESS,
      result: {
        status: 'success',
        path: outputPath,
        config,
      },
    };
  }

  // Human-readable output
  fmt.section('Configuration Summary');
  const scope = config.scopes[0];
  const graphSource = scope?.sources.find((s) => s.type === 'graph');
  fmt.kv('Scope', scope?.scope_id ?? 'unknown');
  fmt.kv('Data directory', config.root_dir);
  fmt.kv('Graph User ID', graphSource?.user_id ?? 'unknown');
  fmt.kv('Folders', scope?.scope.included_container_refs.join(', ') ?? '');

  console.log('');
  fmt.message('Next Steps:', 'info');
  console.log('  1. Set environment variables for Graph API auth:');
  console.log('     export GRAPH_TENANT_ID=your-tenant-id');
  console.log('     export GRAPH_CLIENT_ID=your-client-id');
  console.log('     export GRAPH_CLIENT_SECRET=your-client-secret');
  console.log('  2. Run: exchange-sync sync');

  return {
    exitCode: ExitCode.SUCCESS,
    result: {
      status: 'success',
      path: outputPath,
    },
  };
}
