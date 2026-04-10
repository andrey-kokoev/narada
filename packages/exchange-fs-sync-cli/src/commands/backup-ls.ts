/**
 * List backup contents command - shows what's inside a backup without extracting
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, mkdtemp, readdir } from 'node:fs/promises';
import { createHash, createDecipheriv } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { BackupManifest } from './backup.js';

export interface ListBackupOptions {
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  input: string;
  detailed?: boolean;
  passphrase?: string;
}

interface FileInfo {
  path: string;
  size: number;
  type: 'message' | 'view' | 'config' | 'cursor' | 'applyLog' | 'tombstone' | 'other';
}

interface BackupStats {
  totalFiles: number;
  totalSize: number;
  byType: Record<string, { count: number; size: number }>;
}

const MANIFEST_FILENAME = 'backup-manifest.json';

/**
 * Decrypt a file using AES-256-CBC
 */
async function decryptFile(
  inputPath: string,
  outputPath: string,
  passphrase: string,
): Promise<void> {
  const { createReadStream, createWriteStream } = await import('node:fs');
  const { createHash, createDecipheriv } = await import('node:crypto');
  const input = createReadStream(inputPath);
  
  // Read salt and IV from the beginning of the file
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk as Buffer);
    if (Buffer.concat(chunks).length >= 32) break;
  }
  
  const header = Buffer.concat(chunks);
  const salt = header.slice(0, 16);
  const iv = header.slice(16, 32);
  
  // Derive key from passphrase
  const key = createHash('sha256')
    .update(passphrase + salt.toString('hex'))
    .digest();
  
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  
  // Write remaining data
  const remainingData = header.slice(32);
  const output = createWriteStream(outputPath);
  
  if (remainingData.length > 0) {
    output.write(remainingData);
  }
  
  // Continue with the rest of the stream
  const { Readable } = await import('node:stream');
  const remainingStream = Readable.from(input);
  
  await pipeline(remainingStream, decipher, output);
}

/**
 * Check if a file is a tar archive
 */
function isTarFile(path: string): boolean {
  return path.endsWith('.tar') || path.endsWith('.tar.gz') || path.endsWith('.tgz');
}

/**
 * Check if file is gzip compressed
 */
function isGzipped(path: string): boolean {
  return path.endsWith('.gz') || path.endsWith('.tgz');
}

/**
 * Get file type from path
 */
function getFileType(path: string): FileInfo['type'] {
  if (path.startsWith('messages/')) return 'message';
  if (path.startsWith('views/')) return 'view';
  if (path === 'config.json') return 'config';
  if (path === 'state/cursor.json') return 'cursor';
  if (path === 'state/apply-log.json') return 'applyLog';
  if (path.startsWith('tombstones/')) return 'tombstone';
  return 'other';
}

/**
 * Format file type for display
 */
function formatType(type: FileInfo['type']): string {
  const labels: Record<FileInfo['type'], string> = {
    message: 'Message',
    view: 'View',
    config: 'Config',
    cursor: 'Cursor',
    applyLog: 'Apply Log',
    tombstone: 'Tombstone',
    other: 'Other',
  };
  return labels[type];
}

/**
 * List tar contents with metadata using system tar
 */
async function listTarContents(archivePath: string, gzip: boolean): Promise<Array<{ path: string; size: number }>> {
  return new Promise((resolve, reject) => {
    const args = ['-tv', ...(gzip ? ['-z'] : []), '-f', archivePath];
    const tar = spawn('tar', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    
    let stdout = '';
    let stderr = '';
    
    tar.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    tar.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    tar.on('close', (code) => {
      if (code === 0) {
        const entries: Array<{ path: string; size: number }> = [];
        const lines = stdout.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          // Parse tar -tv output: -rw-r--r-- user/group size date time path
          const match = line.match(/^\S+\s+\S+\/\S+\s+(\d+)\s+\S+\s+\S+\s+(.+)$/);
          if (match) {
            const size = parseInt(match[1], 10);
            const path = match[2];
            if (path && path !== MANIFEST_FILENAME) {
              entries.push({ path, size });
            }
          }
        }
        
        resolve(entries);
      } else {
        reject(new Error(`tar list failed with code ${code}: ${stderr}`));
      }
    });
    
    tar.on('error', (err) => {
      reject(new Error(`Failed to spawn tar: ${err.message}`));
    });
  });
}

/**
 * Extract tar archive using system tar command
 */
async function extractTarArchive(
  archivePath: string,
  targetDir: string,
  gzip: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-x', ...(gzip ? ['-z'] : []), '-f', archivePath, '-C', targetDir];
    const tar = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stderr = '';
    tar.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    tar.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar extraction failed with code ${code}: ${stderr}`));
      }
    });
    
    tar.on('error', (err) => {
      reject(new Error(`Failed to spawn tar: ${err.message}`));
    });
  });
}

export async function listBackupCommand(
  options: ListBackupOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: unknown }> {
  const { verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });
  
  // Resolve input path
  const inputPath = resolve(options.input);
  
  // Check if input exists
  let stats: ReturnType<typeof stat> extends Promise<infer T> ? T : never;
  try {
    stats = await stat(inputPath);
  } catch {
    throw new Error(`Backup file not found: ${inputPath}`);
  }
  
  logger.info('Listing backup contents', { input: inputPath, size: stats.size });
  
  // Create temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'ls-'));
  
  // Handle decryption if needed
  let archivePath = inputPath;
  let needsCleanup = false;
  
  const isEncrypted = !isTarFile(inputPath);
  
  if (isEncrypted) {
    if (!options.passphrase) {
      await rm(tmpDir, { recursive: true, force: true });
      throw new Error('Passphrase required to decrypt backup (use --passphrase)');
    }
    
    archivePath = join(tmpdir(), `ls.${process.pid}.${Date.now()}.tar`);
    
    try {
      await decryptFile(inputPath, archivePath, options.passphrase);
    } catch (error) {
      await rm(tmpDir, { recursive: true, force: true });
      throw new Error('Failed to decrypt backup: invalid passphrase or corrupted file');
    }
    
    needsCleanup = true;
  }
  
  try {
    // Get archive entries
    const entries = await listTarContents(archivePath, isGzipped(archivePath));
    
    // Extract manifest if available
    let manifest: BackupManifest | null = null;
    try {
      await extractTarArchive(archivePath, tmpDir, isGzipped(archivePath));
      const manifestPath = join(tmpDir, MANIFEST_FILENAME);
      const manifestContent = await readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent) as BackupManifest;
    } catch {
      // Manifest not required for listing
    }
    
    // Build file info
    const fileInfos: FileInfo[] = entries.map(e => ({
      path: e.path,
      size: e.size,
      type: getFileType(e.path),
    }));
    
    // Calculate statistics
    const stats: BackupStats = {
      totalFiles: entries.length,
      totalSize: entries.reduce((sum, f) => sum + f.size, 0),
      byType: {
        message: { count: 0, size: 0 },
        view: { count: 0, size: 0 },
        config: { count: 0, size: 0 },
        cursor: { count: 0, size: 0 },
        applyLog: { count: 0, size: 0 },
        tombstone: { count: 0, size: 0 },
        other: { count: 0, size: 0 },
      },
    };
    
    for (const file of fileInfos) {
      stats.byType[file.type].count++;
      stats.byType[file.type].size += file.size;
    }
    
    logger.debug('Backup stats', stats);
    
    // Output results
    if (fmt.getFormat() === 'json') {
      const result = {
        manifest: manifest || undefined,
        stats,
        files: options.detailed ? fileInfos : undefined,
      };
      return { exitCode: ExitCode.SUCCESS, result };
    }
    
    // Human-readable output
    console.log('');
    fmt.message(`Backup: ${inputPath}`, 'info');
    fmt.kv('Size', fmt.fileSize(stats.totalSize));
    fmt.kv('Files', stats.totalFiles);
    
    if (manifest) {
      fmt.kv('Version', manifest.version);
      fmt.kv('Created', fmt.timestamp(manifest.created));
      fmt.kv('Source mailbox', manifest.sourceMailbox);
      fmt.kv('Source directory', manifest.sourceRootDir);
      fmt.kv('Encrypted', manifest.encrypted);
    }
    
    fmt.section('Contents by Type');
    
    const types: Array<{ key: keyof BackupStats['byType']; label: string }> = [
      { key: 'message', label: 'Messages' },
      { key: 'view', label: 'Views' },
      { key: 'config', label: 'Config' },
      { key: 'cursor', label: 'Cursor' },
      { key: 'applyLog', label: 'Apply Log' },
      { key: 'tombstone', label: 'Tombstones' },
      { key: 'other', label: 'Other' },
    ];
    
    for (const { key, label } of types) {
      const { count, size } = stats.byType[key];
      if (count > 0) {
        console.log(`  ${label.padEnd(12)} ${fmt.formatNumber(count).padStart(8)} files (${fmt.fileSize(size).padStart(10)})`);
      }
    }
    
    // Detailed listing
    if (options.detailed) {
      fmt.section('Files');
      
      const headers = [
        { key: 'type' as const, label: 'Type', width: 12 },
        { key: 'path' as const, label: 'Path', width: 50 },
        { key: 'size' as const, label: 'Size', width: 12 },
      ];
      
      // Format data for table
      const rows = fileInfos.slice(0, 100).map(f => ({
        type: formatType(f.type),
        path: f.path.length > 47 ? '...' + f.path.slice(-44) : f.path,
        size: fmt.fileSize(f.size),
      }));
      
      fmt.table(headers, rows);
      
      if (fileInfos.length > 100) {
        fmt.message(`  ... and ${fileInfos.length - 100} more files`, 'info');
      }
    }
    
    // Summary
    fmt.section('Summary');
    const totalMessages = manifest?.contents?.messages ?? stats.byType.message.count;
    fmt.kv('Total messages', totalMessages);
    fmt.kv('Total views', manifest?.contents?.views ?? stats.byType.view.count);
    fmt.kv('Has config', manifest?.contents?.config ?? stats.byType.config.count > 0);
    fmt.kv('Has cursor', manifest?.contents?.cursor ?? stats.byType.cursor.count > 0);
    
    return { exitCode: ExitCode.SUCCESS, result: { stats, manifest } };
  } finally {
    // Clean up
    await rm(tmpDir, { recursive: true, force: true });
    if (needsCleanup) {
      await rm(archivePath, { force: true });
    }
  }
}
