import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { buildMermaidHtml, writeRenderArtifacts, renderAndMaybeOpen } from '../../src/lib/browser-render.js';
import { statSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('browser-render helper', () => {
  const sampleMermaid = 'flowchart TD\n  T100["100<br/>Alpha<br/>opened"]\n';

  describe('buildMermaidHtml', () => {
    it('wraps mermaid source in a valid HTML document', () => {
      const html = buildMermaidHtml(sampleMermaid, 'Test Graph');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Test Graph</title>');
      expect(html).toContain('mermaid@10');
      expect(html).toContain('class="mermaid"');
      expect(html).toContain('flowchart TD');
    });

    it('escapes HTML special chars in the mermaid source', () => {
      const tricky = 'graph TD\n  A["<script>alert(1)</script>"]\n';
      const html = buildMermaidHtml(tricky, 'XSS Test');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes HTML special chars in the title', () => {
      const html = buildMermaidHtml(sampleMermaid, 'A < B & C > D');
      expect(html).toContain('<title>A &lt; B &amp; C &gt; D</title>');
    });
  });

  describe('writeRenderArtifacts', () => {
    let artifactDir: string;

    afterEach(() => {
      if (artifactDir) {
        rmSync(artifactDir, { recursive: true, force: true });
      }
    });

    it('writes both .mmd and .html files', async () => {
      const result = await writeRenderArtifacts(sampleMermaid, 'Test Graph');
      artifactDir = result.artifactDir;

      expect(statSync(result.mermaidPath).isFile()).toBe(true);
      expect(statSync(result.htmlPath).isFile()).toBe(true);

      const mmdContent = readFileSync(result.mermaidPath, 'utf8');
      expect(mmdContent).toBe(sampleMermaid);

      const htmlContent = readFileSync(result.htmlPath, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
    });

    it('uses a timestamped directory under os.tmpdir()', async () => {
      const result = await writeRenderArtifacts(sampleMermaid, 'Test Graph');
      artifactDir = result.artifactDir;

      expect(result.artifactDir.startsWith(tmpdir())).toBe(true);
      expect(result.artifactDir).toContain('narada-task-graph-');
    });
  });

  describe('renderAndMaybeOpen', () => {
    let artifactDir: string;

    afterEach(() => {
      if (artifactDir) {
        rmSync(artifactDir, { recursive: true, force: true });
      }
    });

    it('creates artifacts when shouldOpen is false', async () => {
      const result = await renderAndMaybeOpen(sampleMermaid, 'Test', false);
      artifactDir = result.artifactDir;

      expect(result.opened).toBe(false);
      expect(result.message).toContain('Artifacts written to');
      expect(statSync(result.mermaidPath).isFile()).toBe(true);
      expect(statSync(result.htmlPath).isFile()).toBe(true);
    });

    it('skips open in headless environment (CI)', async () => {
      const originalCi = process.env.CI;
      process.env.CI = 'true';
      try {
        const result = await renderAndMaybeOpen(sampleMermaid, 'Test', true);
        artifactDir = result.artifactDir;

        expect(result.opened).toBe(false);
        expect(result.message).toContain('Headless environment detected');
        expect(statSync(result.mermaidPath).isFile()).toBe(true);
      } finally {
        if (originalCi === undefined) {
          delete process.env.CI;
        } else {
          process.env.CI = originalCi;
        }
      }
    });

    it('skips open in headless environment (NARADA_NO_BROWSER)', async () => {
      const original = process.env.NARADA_NO_BROWSER;
      process.env.NARADA_NO_BROWSER = '1';
      try {
        const result = await renderAndMaybeOpen(sampleMermaid, 'Test', true);
        artifactDir = result.artifactDir;

        expect(result.opened).toBe(false);
        expect(result.message).toContain('Headless environment detected');
      } finally {
        if (original === undefined) {
          delete process.env.NARADA_NO_BROWSER;
        } else {
          process.env.NARADA_NO_BROWSER = original;
        }
      }
    });
  });
});
