#!/usr/bin/env node
/**
 * exchange-fs-sync-daemon
 * 
 * Long-running polling daemon for continuous mailbox synchronization.
 * Uses the core exchange-fs-sync package for actual sync operations.
 */

import { setTimeout } from 'node:timers/promises';
import { createSyncService, type SyncServiceConfig } from './service.js';

interface DaemonConfig {
  configPath: string;
  shutdownTimeoutMs: number;
}

function loadDaemonConfig(): DaemonConfig {
  const configPath = process.env.CONFIG_PATH || './config.json';
  const shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '30000', 10);
  
  return {
    configPath,
    shutdownTimeoutMs,
  };
}

async function main(): Promise<void> {
  const daemonConfig = loadDaemonConfig();
  
  console.log('[daemon] Starting exchange-fs-sync-daemon...');
  console.log(`[daemon] Config: ${daemonConfig.configPath}`);
  
  const service = await createSyncService({
    configPath: daemonConfig.configPath,
  });
  
  // Graceful shutdown handling
  let shuttingDown = false;
  
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      console.log('[daemon] Shutdown already in progress...');
      return;
    }
    
    shuttingDown = true;
    console.log(`[daemon] Received ${signal}, shutting down...`);
    
    const timeout = setTimeout(daemonConfig.shutdownTimeoutMs, 'timeout');
    
    try {
      await Promise.race([
        service.stop(),
        timeout,
      ]);
      console.log('[daemon] Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('[daemon] Shutdown error:', error);
      process.exit(1);
    }
  }
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Start the service
  try {
    await service.start();
  } catch (error) {
    console.error('[daemon] Failed to start service:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[daemon] Fatal error:', error);
  process.exit(1);
});
