/**
 * Verify backup command - checks backup integrity without extracting
 */

import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import { createHash, createDecipheriv } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import type { CommandContext } from '../lib/command-wrapper.js';
import { ExitCode } from '../lib/exit-codes.js';
import { createFormatter } from '../lib/formatter.js';
import type { BackupManifest } from './backup.js';

export interface VerifyBackupOptions {
  verbose?: boolean;
  format?: 'json' | 'human' | 'auto';
  input: string;
  passphrase?: string;
}

export interface VerifyBackupResult {
  valid: boolean;
  manifest: BackupManifest | null;
  checksumErrors: string[];
  missingFiles: string[];
  corruptFiles: string[];
  warnings: string[];
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
 * Walk directory recursively
 */
async function walkDirectory(dir: string): Promise<Array<{ path: string; relativePath: string }>> {
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

export async function verifyBackupCommand(
  options: VerifyBackupOptions,
  context: CommandContext,
): Promise<{ exitCode: ExitCode; result: VerifyBackupResult }> {
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
  
  logger.info('Verifying backup', { input: inputPath, size: stats.size });
  fmt.message(`Verifying backup: ${inputPath}`, 'info');
  fmt.kv('File size', fmt.fileSize(stats.size));
  
  const checksumErrors: string[] = [];
  const missingFiles: string[] = [];
  const corruptFiles: string[] = [];
  const warnings: string[] = [];
  let manifest: BackupManifest | null = null;
  
  // Create temp directory for extraction
  const tmpDir = await mkdtemp(join(tmpdir(), 'verify-'));
  
  // Handle decryption if needed
  let archivePath = inputPath;
  let needsCleanup = false;
  
  const isEncrypted = !isTarFile(inputPath);
  
  if (isEncrypted) {
    if (!options.passphrase) {
      await rm(tmpDir, { recursive: true, force: true });
      throw new Error('Passphrase required to decrypt backup (use --passphrase)');
    }
    
    fmt.message('Decrypting backup...', 'info');
    archivePath = join(tmpdir(), `verify.${process.pid}.${Date.now()}.tar`);
    
    try {
      await decryptFile(inputPath, archivePath, options.passphrase);
    } catch (error) {
      await rm(tmpDir, { recursive: true, force: true });
      throw new Error('Failed to decrypt backup: invalid passphrase or corrupted file');
    }
    
    needsCleanup = true;
    fmt.message('Decryption successful', 'success');
  }
  
  try {
    // First, verify archive structure by listing contents
    fmt.message('Checking archive structure...', 'info');
    let entries: string[];
    try {
      entries = await listTarContents(archivePath, isGzipped(archivePath));
    } catch (error) {
      throw new Error(`Invalid archive format: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    if (entries.length === 0) {
      throw new Error('Archive is empty');
    }
    
    fmt.message(`Archive contains ${entries.length} entries`, 'info');
    
    // Check for manifest
    if (!entries.includes(MANIFEST_FILENAME)) {
      throw new Error(`Backup manifest (${MANIFEST_FILENAME}) not found in archive`);
    }
    
    // Extract manifest
    await extractTarArchive(archivePath, tmpDir, isGzipped(archivePath));
    
    // Parse manifest
    try {
      const manifestPath = join(tmpDir, MANIFEST_FILENAME);
      const manifestContent = await readFile(manifestPath, 'utf8');
      manifest = JSON.parse(manifestContent) as BackupManifest;
    } catch (error) {
      throw new Error(`Invalid manifest: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Validate manifest structure
    if (!manifest.version) {
      warnings.push('Manifest missing version field');
    }
    if (!manifest.created) {
      warnings.push('Manifest missing created timestamp');
    }
    if (!manifest.sourceMailbox) {
      warnings.push('Manifest missing source mailbox');
    }
    if (!manifest.checksums) {
      warnings.push('Manifest missing checksums');
    }
    
    fmt.message(`Backup version: ${manifest.version || 'unknown'}`, 'info');
    fmt.message(`Created: ${manifest.created ? fmt.timestamp(manifest.created) : 'unknown'}`, 'info');
    fmt.message(`Source mailbox: ${manifest.sourceMailbox || 'unknown'}`, 'info');
    
    // Verify all files referenced in checksums exist in archive
    const filesInManifest = Object.keys(manifest.checksums || {});
    const filesInArchive = entries.filter(e => e !== MANIFEST_FILENAME);
    
    for (const file of filesInManifest) {
      if (!filesInArchive.includes(file)) {
        missingFiles.push(file);
      }
    }
    
    for (const file of filesInArchive) {
      if (!filesInManifest.includes(file)) {
        warnings.push(`File in archive not listed in manifest: ${file}`);
      }
    }
    
    if (missingFiles.length > 0) {
      fmt.message(`${missingFiles.length} file(s) referenced in manifest but missing from archive`, 'warning');
    }
    
    // Extract and verify checksums
    if (filesInManifest.length > 0) {
      fmt.message('Verifying file checksums...', 'info');
      
      // Walk extracted files
      const extractedFiles = await walkDirectory(tmpDir);
      
      // Verify checksums
      let checked = 0;
      for (const file of extractedFiles) {
        const expectedChecksum = manifest.checksums[file.relativePath];
        if (!expectedChecksum) continue;
        
        checked++;
        if (verbose && checked % 100 === 0) {
          logger.debug(`Verified ${checked}/${filesInManifest.length} files`);
        }
        
        try {
          const actualChecksum = await calculateChecksum(file.path);
          if (actualChecksum !== expectedChecksum) {
            checksumErrors.push(file.relativePath);
          }
        } catch (error) {
          corruptFiles.push(file.relativePath);
        }
      }
    }
    
    // Determine validity
    const valid = missingFiles.length === 0 && 
                  checksumErrors.length === 0 && 
                  corruptFiles.length === 0;
    
    const result: VerifyBackupResult = {
      valid,
      manifest,
      checksumErrors,
      missingFiles,
      corruptFiles,
      warnings,
    };
    
    logger.info('Verification complete', {
      valid,
      checksumErrors: checksumErrors.length,
      missingFiles: missingFiles.length,
      corruptFiles: corruptFiles.length,
      warnings: warnings.length,
    });
    
    // Output results
    if (fmt.getFormat() === 'json') {
      return { exitCode: valid ? ExitCode.SUCCESS : ExitCode.INTEGRITY_ISSUES, result };
    }
    
    if (valid && warnings.length === 0) {
      fmt.message('Backup is valid', 'success');
    } else if (valid) {
      fmt.message('Backup is valid with warnings', 'warning');
    } else {
      fmt.message('Backup verification failed', 'error');
    }
    
    fmt.section('Verification Summary');
    fmt.kv('Status', valid ? 'Valid' : 'Invalid');
    fmt.kv('Files checked', filesInManifest.length);
    fmt.kv('Checksum errors', checksumErrors.length);
    fmt.kv('Missing files', missingFiles.length);
    fmt.kv('Corrupt files', corruptFiles.length);
    fmt.kv('Warnings', warnings.length);
    
    if (warnings.length > 0) {
      fmt.section('Warnings');
      for (const warning of warnings.slice(0, 10)) {
        fmt.message(`  ${warning}`, 'warning');
      }
      if (warnings.length > 10) {
        fmt.message(`  ... and ${warnings.length - 10} more`, 'info');
      }
    }
    
    if (checksumErrors.length > 0) {
      fmt.section('Checksum Errors');
      for (const file of checksumErrors.slice(0, 10)) {
        fmt.message(`  ${file}`, 'error');
      }
      if (checksumErrors.length > 10) {
        fmt.message(`  ... and ${checksumErrors.length - 10} more`, 'info');
      }
    }
    
    if (missingFiles.length > 0) {
      fmt.section('Missing Files');
      for (const file of missingFiles.slice(0, 10)) {
        fmt.message(`  ${file}`, 'error');
      }
      if (missingFiles.length > 10) {
        fmt.message(`  ... and ${missingFiles.length - 10} more`, 'info');
      }
    }
    
    return { 
      exitCode: valid ? ExitCode.SUCCESS : ExitCode.INTEGRITY_ISSUES, 
      result 
    };
  } finally {
    // Clean up temp directory and decrypted file
    await rm(tmpDir, { recursive: true, force: true });
    if (needsCleanup) {
      await rm(archivePath, { force: true });
    }
  }
}
