import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

const ADRS_DIR = resolve(process.cwd(), 'docs', 'architecture', 'adrs');
const OUTPUT_PATH = resolve(process.cwd(), 'docs', 'architecture', 'adrs.json');

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const lines = match[1].trim().split(/\r?\n/);
  const meta = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      value = value.replace(/^["']|["']$/g, '');
    }
    meta[key] = value;
  }
  return meta;
}

const adrs = [];
for (const file of readdirSync(ADRS_DIR)) {
  if (!file.endsWith('.md')) continue;
  const text = readFileSync(join(ADRS_DIR, file), 'utf-8');
  const meta = parseFrontmatter(text);
  if (meta) adrs.push(meta);
}

adrs.sort((a, b) => (a.adr_id || '').localeCompare(b.adr_id || ''));

writeFileSync(OUTPUT_PATH, JSON.stringify({ schema: 'narada.adr.index.v0', generated_at: new Date().toISOString(), count: adrs.length, adrs }, null, 2));
console.log(`Generated adrs.json with ${adrs.length} ADRs`);
