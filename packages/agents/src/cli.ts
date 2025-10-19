#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This path is relative to the dist/cli.js file after compilation
const sourcePath = path.resolve(__dirname, 'AGENTS.md');
const destPath = path.join(process.cwd(), 'AGENTS.md');

try {

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, fs.readFileSync(sourcePath, 'utf8'));
  } else {
    fs.appendFileSync(destPath, '\n' + fs.readFileSync(sourcePath, 'utf8'));
  }
  console.log('AGENTS.md has been created in your project root.');
} catch (error) {
  console.error('Error creating AGENTS.md:', error);
  process.exit(1);
}
