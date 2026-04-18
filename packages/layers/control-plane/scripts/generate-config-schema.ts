import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema } from '../src/config/schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(__dirname, '..', 'config.schema.json');

const generated = zodToJsonSchema(ConfigSchema, {
  target: 'jsonSchema7',
  $refStrategy: 'none',
});

const schema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Narada Config',
  description: 'Generated from packages/layers/control-plane/src/config/schema.ts',
  ...generated,
};

fs.writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
console.log(`wrote ${outPath}`);
