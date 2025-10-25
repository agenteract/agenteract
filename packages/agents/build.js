import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

async function createBuild() {
    const docsPath = path.resolve('../../docs/AGENTS.md');
    const distPath = path.resolve('dist/AGENTS.md');

    const packageJsonFiles = await glob('../../packages/**/package.json', {
        ignore: ['**/node_modules/**', '**/agents/**'], // Ignore the agents package itself
    });

    let content = fs.readFileSync(docsPath, 'utf8');

    // Specific replacement for the main CLI commands
    content = content.replace(/pnpm agenteract-agents/g, 'npx @agenteract/agents');

    // Dynamic replacements for other tools
    for (const file of packageJsonFiles) {
        const packageJson = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (packageJson.bin) {
            for (const binName in packageJson.bin) {
                const packageName = packageJson.name;
                // Make sure we don't re-replace the command we just fixed
                if (binName !== 'agenteract-agents') {
                    const pnpmCommand = `pnpm ${binName} `;
                    const npxCommand = `npx ${packageName} `;
                    content = content.replace(new RegExp(pnpmCommand, 'g'), npxCommand);
                }
            }
        }
    }

    fs.writeFileSync(distPath, content);
}

createBuild();