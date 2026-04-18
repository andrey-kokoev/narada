/**
 * Backup command - creates archive of sync data with integrity verification
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig } from '@narada2/control-plane';

export type BackupComponent = 'messages' | 'views' | 'config' | 'cursor' | 'applyLog' | 'tombstones';
export type CompressionType = 'gzip' | 'none';

export interface BackupOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  output: string;
  include?: BackupComponent[];
  excludePattern?: string;
  compression?: CompressionType;
  encrypt?: boolean;
  passphrase?: string;
}

export interface BackupManifest {
  version: string;
  created: string;
  sourceMailbox: string;
  sourceRootDir: string;
  contents: {
    messages: number;
    views: number;
    config: boolean;
    cursor: boolean;
    applyLog: boolean;
    tombstones: number;
  };
  checksums: Record<string, string>;
  encrypted: boolean;
}

export interface BackupResult {
  outputPath: string;
  sizeBytes: number;
  manifest: BackupManifest;
}

interface FileEntry {
  path: string;
  relativePath: string;
  size: number;
}

const BACKUP_VERSION = '1.0.0';
const MANIFEST_FILENAME = 'backup-manifest.json';

/**
 * Calculate SHA-256 checksum of a file
 */
async function calculateChecksum(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Walk directory recursively and collect file entries
 */
async function walkDirectory(
  dir: string,
  rootDir: string,
  excludePattern?: RegExp,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  
  async function walk(currentDir: string): Promise<void> {
    let items: string[];
    try {
      items = await readdir(currentDir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      throw error;
    }
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const relPath = relative(rootDir, fullPath);
      
      // Skip tmp directory and lock files
      if (relPath.startsWith('tmp/') || relPath.endsWith('.lock')) {
        continue;
      }
      
      // Apply exclude pattern
      if (excludePattern && excludePattern.test(relPath)) {
        continue;
      }
      
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await walk(fullPath);
      } else {
        entries.push({
          path: fullPath,
          relativePath: relPath,
          size: stats.size,
        });
      }
    }
  }
  
  await walk(dir);
  return entries;
}

/**
 * Create tar archive using system tar command
 */
async function createTarArchive(
  sourceDir: string,
  outputPath: string,
  files: string[],
  gzip: boolean,
  logger: CommandContext['logger'],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-c', ...(gzip ? ['-z'] : []), '-f', outputPath, '-C', sourceDir, ...files];
    const tar = spawn('tar', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stderr = '';
    tar.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    tar.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar failed with code ${code}: ${stderr}`));
      }
    });
    
    tar.on('error', (err) => {
      reject(new Error(`Failed to spawn tar: ${err.message}`));
    });
  });
}

/**
 * Encrypt a file using AES-256-CBC
 */
async function encryptFile(
  inputPath: string,
  outputPath: string,
  passphrase: string,
): Promise<void> {
  // Derive key from passphrase
  const salt = randomBytes(16);
  const key = createHash('sha256')
    .update(passphrase + salt.toString('hex'))
    .digest();
  
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  
  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);
  
  // Write salt and IV first
  output.write(salt);
  output.write(iv);
  
  await pipeline(input, cipher, output);
}

export async function backupCommand(
  options: BackupOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: BackupResult }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });
  
  // Resolve output path
  const outputPath = resolve(options.output);
  
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  
  // Load config to get root directory
  logger.debug('Loading config', { path: configPath });
  const config = await loadConfig({ path: configPath });
  const scopeId = config.scopes[0]?.scope_id ?? 'unknown';
  const rootDir = resolve(config.root_dir);
  
  // Default to all components if not specified
  const include = options.include || ['messages', 'views', 'config', 'cursor', 'applyLog', 'tombstones'];
  const excludeRegex = options.excludePattern ? new RegExp(options.excludePattern) : undefined;
  
  logger.info('Starting backup', {
    rootDir,
    output: outputPath,
    include,
    compression: options.compression || 'gzip',
    encrypt: options.encrypt || false,
  });
  
  fmt.message(`Creating backup from ${rootDir}`, 'info');
  
  // Collect files to backup
  const filesToBackup: FileEntry[] = [];
  const contents = {
    messages: 0,
    views: 0,
    config: false,
    cursor: false,
    applyLog: false,
    tombstones: 0,
  };
  
  // Check each component
  if (include.includes('messages')) {
    const messagesDir = join(rootDir, 'messages');
    const messageFiles = await walkDirectory(messagesDir, rootDir, excludeRegex);
    filesToBackup.push(...messageFiles);
    contents.messages = messageFiles.length;
    logger.debug(`Found ${messageFiles.length} message files`);
  }
  
  if (include.includes('views')) {
    const viewsDir = join(rootDir, 'views');
    const viewFiles = await walkDirectory(viewsDir, rootDir, excludeRegex);
    filesToBackup.push(...viewFiles);
    contents.views = viewFiles.length;
    logger.debug(`Found ${viewFiles.length} view files`);
  }
  
  if (include.includes('config')) {
    const configFile = join(rootDir, 'config.json');
    try {
      const stats = await stat(configFile);
      if (stats.isFile()) {
        filesToBackup.push({
          path: configFile,
          relativePath: 'config.json',
          size: stats.size,
        });
        contents.config = true;
      }
    } catch {
      // Config file not required
    }
  }
  
  if (include.includes('cursor')) {
    const cursorFile = join(rootDir, 'state', 'cursor.json');
    try {
      const stats = await stat(cursorFile);
      if (stats.isFile()) {
        filesToBackup.push({
          path: cursorFile,
          relativePath: 'state/cursor.json',
          size: stats.size,
        });
        contents.cursor = true;
      }
    } catch {
      // Cursor file not required
    }
  }
  
  if (include.includes('applyLog')) {
    const applyLogFile = join(rootDir, 'state', 'apply-log.json');
    try {
      const stats = await stat(applyLogFile);
      if (stats.isFile()) {
        filesToBackup.push({
          path: applyLogFile,
          relativePath: 'state/apply-log.json',
          size: stats.size,
        });
        contents.applyLog = true;
      }
    } catch {
      // Apply log not required
    }
  }
  
  if (include.includes('tombstones')) {
    const tombstonesDir = join(rootDir, 'tombstones');
    const tombstoneFiles = await walkDirectory(tombstonesDir, rootDir, excludeRegex);
    filesToBackup.push(...tombstoneFiles);
    contents.tombstones = tombstoneFiles.length;
    logger.debug(`Found ${tombstoneFiles.length} tombstone files`);
  }
  
  if (filesToBackup.length === 0) {
    fmt.message('No files found to backup', 'warning');
    return {
      exitCode: ExitCode.GENERAL_ERROR,
      result: {
        outputPath,
        sizeBytes: 0,
        manifest: {
          version: BACKUP_VERSION,
          created: new Date().toISOString(),
          sourceMailbox: scopeId,
          sourceRootDir: rootDir,
          contents,
          checksums: {},
          encrypted: false,
        },
      },
    };
  }
  
  fmt.message(`Found ${fmt.formatNumber(filesToBackup.length)} files to backup`, 'info');
  
  // Calculate checksums
  fmt.message('Calculating checksums...', 'info');
  const checksums: Record<string, string> = {};
  
  for (let i = 0; i < filesToBackup.length; i++) {
    const file = filesToBackup[i];
    if (verbose && i % 100 === 0) {
      logger.debug(`Checksumming ${i + 1}/${filesToBackup.length}`);
    }
    checksums[file.relativePath] = await calculateChecksum(file.path);
  }
  
  // Create manifest
  const manifest: BackupManifest = {
    version: BACKUP_VERSION,
    created: new Date().toISOString(),
    sourceMailbox: scopeId,
    sourceRootDir: rootDir,
    contents,
    checksums,
    encrypted: options.encrypt || false,
  };
  
  // Create temp directory for staging
  const stagingDir = await mkdtemp(join(tmpdir(), 'backup-'));
  
  try {
    // Write manifest to staging
    const manifestPath = join(stagingDir, MANIFEST_FILENAME);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    
    // Create list of files for tar (use relative paths from rootDir)
    const tarFiles = filesToBackup.map(f => f.relativePath);
    tarFiles.push(MANIFEST_FILENAME);
    
    // Create tar archive
    const tarPath = options.encrypt ? `${outputPath}.tmp.tar` : outputPath;
    
    fmt.message('Creating archive...', 'info');
    
    // Use system tar command
    await createTarArchive(rootDir, tarPath, tarFiles, options.compression !== 'none', logger);
    
    // Encrypt if requested
    if (options.encrypt) {
      if (!options.passphrase) {
        throw new Error('Passphrase required for encryption');
      }
      
      fmt.message('Encrypting backup...', 'info');
      await encryptFile(tarPath, outputPath, options.passphrase);
      
      // Remove unencrypted temp file
      await rm(tarPath);
    }
    
    // Get final file size
    const finalPath = options.encrypt ? outputPath : tarPath;
    const finalStats = await stat(finalPath);
    
    const result: BackupResult = {
      outputPath: finalPath,
      sizeBytes: finalStats.size,
      manifest,
    };
    
    logger.info('Backup complete', {
      outputPath: result.outputPath,
      sizeBytes: result.sizeBytes,
      files: filesToBackup.length,
    });
    
    // Output results
    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    
    fmt.message('Backup created successfully', 'success');
    fmt.section('Backup Summary');
    fmt.kv('Output file', result.outputPath);
    fmt.kv('Size', fmt.fileSize(result.sizeBytes));
    fmt.kv('Files', filesToBackup.length);
    fmt.kv('Encrypted', options.encrypt || false);
    fmt.kv('Compression', options.compression || 'gzip');
    fmt.section('Contents');
    fmt.kv('Messages', contents.messages);
    fmt.kv('Views', contents.views);
    fmt.kv('Config', contents.config);
    fmt.kv('Cursor', contents.cursor);
    fmt.kv('Apply log', contents.applyLog);
    fmt.kv('Tombstones', contents.tombstones);
    
    return { exitCode: ExitCode.SUCCESS, result };
  } finally {
    // Clean up staging directory
    await rm(stagingDir, { recursive: true, force: true });
  }
}
