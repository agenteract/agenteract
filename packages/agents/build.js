import fs from 'fs';
import path from 'path';

const docsPath = path.resolve('../../docs/AGENTS.md');
const distPath = path.resolve('dist/AGENTS.md');

const content = fs.readFileSync(docsPath, 'utf8');

const transformedContent = content
  .replace(/pnpm agenteract-agents/g, 'npx @agenteract/agents')
  .replace(/pnpm agenterexpo/g, 'npx @agenteract/expo')
  .replace(/pnpm agentervite/g, 'npx @agenteract/vite')
  .replace(/pnpm agenterserve/g, 'npx @agenteract/server');

fs.writeFileSync(distPath, transformedContent);
