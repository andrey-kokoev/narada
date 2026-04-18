/**
 * Restore command - restores data from backup archive
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile, mkdtemp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import { loadConfig } from '@narada2/control-plane';
import type { BackupManifest } from './backup.js';

export interface RestoreOptions {
  config?: string;
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  input: string;
  targetDir?: string;
  force: boolean;
  verify: boolean;
  select?: string;  // Restore specific message by ID
  before?: string;  // Restore only messages before date
  passphrase?: string;  // For encrypted backups
}

export interface RestoreResult {
  messagesRestored: number;
  viewsRestored: number;
  errors: Array<{ file: string; error: string }>;
}

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
 * Extract tar archive using system tar command
 */
async function extractTarArchive(
  archivePath: string,
  targetDir: string,
  gzip: boolean,
  logger: CommandContext['logger'],
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

/**
 * List tar contents using system tar command
 */
async function listTarContents(archivePath: string, gzip: boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const args = ['-t', ...(gzip ? ['-z'] : []), '-f', archivePath];
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
        const entries = stdout.split('\n').filter(line => line.trim());
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
 * Decrypt a file using AES-256-CBC
 */
async function decryptFile(
  inputPath: string,
  outputPath: string,
  passphrase: string,
): Promise<void> {
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
  const { createHash } = await import('node:crypto');
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
 * Walk directory recursively
 */
async function walkDirectory(dir: string, baseDir: string): Promise<Array<{ path: string; relativePath: string }>> {
  const files: Array<{ path: string; relativePath: string }> = [];
  
  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    let items: string[];
    try {
      items = await readdir(currentDir);
    } catch {
      return;
    }
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const relPath = relativeDir ? `${relativeDir}/${item}` : item;
      const stats = await stat(fullPath);
      
      if (stats.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (item !== MANIFEST_FILENAME) {
        files.push({ path: fullPath, relativePath: relPath });
      }
    }
  }
  
  await walk(dir, '');
  return files;
}

/**
 * Extract and restore from archive
 */
async function extractAndRestore(
  archivePath: string,
  targetDir: string,
  options: { 
    verify: boolean;
    select?: string;
    before?: string;
    force: boolean;
  },
  manifest: BackupManifest,
  logger: CommandContext['logger'],
): Promise<RestoreResult> {
  const errors: Array<{ file: string; error: string }> = [];
  let messagesRestored = 0;
  let viewsRestored = 0;
  
  // Create extract directory
  const extractDir = await mkdtemp(join(tmpdir(), 'restore-'));
  
  try {
    // Extract archive
    await extractTarArchive(archivePath, extractDir, isGzipped(archivePath), logger);
    
    // Walk extracted files
    const extractedFiles = await walkDirectory(extractDir, extractDir);
    
    // Verify checksums if requested
    if (options.verify) {
      logger.debug('Verifying checksums...');
      for (const file of extractedFiles) {
        const expectedChecksum = manifest.checksums[file.relativePath];
        if (expectedChecksum) {
          const actualChecksum = await calculateChecksum(file.path);
          if (actualChecksum !== expectedChecksum) {
            errors.push({
              file: file.relativePath,
              error: `Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`,
            });
          }
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Checksum verification failed for ${errors.length} file(s)`);
      }
    }
    
    // Filter files if select or before options are specified
    let filesToRestore = extractedFiles;
    
    if (options.select) {
      // Restore only specific message
      const messageId = options.select;
      filesToRestore = extractedFiles.filter(f => 
        f.relativePath.includes(messageId) ||
        f.relativePath.includes(encodeURIComponent(messageId))
      );
      
      if (filesToRestore.length === 0) {
        throw new Error(`Message not found in backup: ${messageId}`);
      }
    }
    
    if (options.before) {
      const beforeDate = new Date(options.before);
      // Filter based on file timestamps
      filesToRestore = await Promise.all(
        extractedFiles.map(async f => {
          const stats = await stat(f.path);
          return { ...f, mtime: stats.mtime };
        })
      ).then(files => files.filter(f => f.mtime < beforeDate));
    }
    
    // Copy files to target directory
    for (const file of filesToRestore) {
      try {
        const targetPath = join(targetDir, file.relativePath);
        
        // Ensure parent directory exists
        await mkdir(dirname(targetPath), { recursive: true });
        
        // Check if file exists
        const exists = await stat(targetPath).then(() => true, () => false);
        if (exists && !options.force) {
          errors.push({
            file: file.relativePath,
            error: 'File already exists (use --force to overwrite)',
          });
          continue;
        }
        
        // Copy file
        const content = await readFile(file.path);
        await writeFile(targetPath, content);
        
        // Track what was restored
        if (file.relativePath.startsWith('messages/')) {
          messagesRestored++;
        } else if (file.relativePath.startsWith('views/')) {
          viewsRestored++;
        }
      } catch (error) {
        errors.push({
          file: file.relativePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return {
      messagesRestored,
      viewsRestored,
      errors,
    };
  } finally {
    // Clean up extract directory
    await rm(extractDir, { recursive: true, force: true });
  }
}

export async function restoreCommand(
  options: RestoreOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: RestoreResult }> {
  const { configPath, verbose, logger } = context;
  const fmt = createFormatter({ format: options.format, verbose });
  
  // Resolve input path
  const inputPath = resolve(options.input);
  
  // Check if input exists
  try {
    await stat(inputPath);
  } catch {
    throw new Error(`Backup file not found: ${inputPath}`);
  }
  
  // Determine target directory
  let targetDir: string;
  if (options.targetDir) {
    targetDir = resolve(options.targetDir);
  } else {
    // Load config to get root directory
    const config = await loadConfig({ path: configPath });
    targetDir = resolve(config.root_dir);
  }
  
  logger.info('Starting restore', {
    input: inputPath,
    targetDir,
    verify: options.verify,
    force: options.force,
  });
  
  fmt.message(`Restoring from ${inputPath}`, 'info');
  
  // Check target directory
  const targetExists = await stat(targetDir).then(() => true, () => false);
  if (!targetExists) {
    if (options.force) {
      await mkdir(targetDir, { recursive: true });
    } else {
      throw new Error(`Target directory does not exist: ${targetDir} (use --force to create)`);
    }
  }
  
  // Check if target directory has existing data
  if (!options.force && targetExists) {
    const existingFiles = await readdir(targetDir).catch(() => []);
    const hasData = existingFiles.some(f => f !== 'tmp' && !f.startsWith('.'));
    if (hasData) {
      fmt.message('Target directory contains existing data', 'warning');
      fmt.message('Use --force to overwrite existing files', 'info');
    }
  }
  
  // Handle decryption if needed
  let archivePath = inputPath;
  let needsCleanup = false;
  
  // Check if file is encrypted (doesn't look like a tar)
  const isEncrypted = !isTarFile(inputPath);
  
  if (isEncrypted) {
    if (!options.passphrase) {
      throw new Error('Passphrase required to decrypt backup (use --passphrase)');
    }
    
    fmt.message('Decrypting backup...', 'info');
    archivePath = join(tmpdir(), `restore.${process.pid}.${Date.now()}.tar`);
    
    await decryptFile(inputPath, archivePath, options.passphrase);
    needsCleanup = true;
  }
  
  try {
    // Extract just the manifest to check integrity
    const tmpDir = await mkdtemp(join(tmpdir(), 'manifest-'));
    
    let manifest: BackupManifest;
    try {
      // Extract only manifest file
      await extractTarArchive(archivePath, tmpDir, isGzipped(archivePath), logger);
      
      const manifestPath = join(tmpDir, MANIFEST_FILENAME);
      const manifestContent = await readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent) as BackupManifest;
    } catch {
      throw new Error('Invalid backup file: manifest not found');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
    
    fmt.message(`Backup created: ${fmt.timestamp(manifest.created)}`, 'info');
    fmt.message(`Source mailbox: ${manifest.sourceMailbox}`, 'info');
    
    // Extract and restore
    const result = await extractAndRestore(
      archivePath,
      targetDir,
      {
        verify: options.verify,
        select: options.select,
        before: options.before,
        force: options.force,
      },
      manifest,
      logger,
    );
    
    logger.info('Restore complete', result);
    
    // Output results
    if (fmt.getFormat() === 'json') {
      return { exitCode: ExitCode.SUCCESS, result };
    }
    
    if (result.errors.length > 0) {
      fmt.message(`Restore completed with ${result.errors.length} error(s)`, 'warning');
      fmt.section('Errors');
      for (const error of result.errors.slice(0, 10)) {
        fmt.message(`  ${error.file}: ${error.error}`, 'error');
      }
      if (result.errors.length > 10) {
        fmt.message(`  ... and ${result.errors.length - 10} more`, 'info');
      }
    } else {
      fmt.message('Restore completed successfully', 'success');
    }
    
    fmt.section('Summary');
    fmt.kv('Messages restored', result.messagesRestored);
    fmt.kv('Views restored', result.viewsRestored);
    fmt.kv('Target directory', targetDir);
    
    return { exitCode: ExitCode.SUCCESS, result };
  } finally {
    // Clean up temp files
    if (needsCleanup) {
      await rm(archivePath, { force: true });
    }
  }
}
