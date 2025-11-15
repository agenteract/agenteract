#!/usr/bin/env node
// Cross-platform script to write package.json files with type field
import fs from 'fs';
import path from 'path';

const [type, outputPath] = process.argv.slice(2);

if (!type || !outputPath) {
  console.error('Usage: node write-package-json.js <type> <output-path>');
  console.error('Example: node write-package-json.js commonjs dist/cjs/package.json');
  process.exit(1);
}

const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const content = JSON.stringify({ type }, null, 2) + '\n';
fs.writeFileSync(outputPath, content, 'utf8');

