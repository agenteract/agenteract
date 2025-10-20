// packages/cli/src/config.ts
import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

export async function loadConfig(rootDir: string): Promise<any> {
  const configPath = path.join(rootDir, 'agenteract.config.js');
  
  try {
    await fs.access(configPath);
  } catch (error) {
    throw new Error('Agenteract config file not found');
  }

  // In a Jest environment, dynamic import() of file URLs can be tricky.
  // A simple and effective workaround is to read the file and evaluate it.
  // This avoids the module resolution issues within the test runner.
  const configContent = await fs.readFile(configPath, 'utf-8');
  
  // A simple regex to extract the default export object.
  // This is not a full parser, but it's robust enough for our config file format.
  const match = configContent.match(/export default (\{[\s\S]*\});/);
  if (!match) {
    throw new Error('Could not parse agenteract.config.js. Make sure it has a default export.');
  }
  
  // We can use Function to evaluate the object literal.
  // It's safer than eval() because it doesn't have access to the outer scope.
  return new Function(`return ${match[1]}`)();
}