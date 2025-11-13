#!/usr/bin/env node
/**
 * E2E Test: FastAPI App Launch
 *
 * Tests that the FastAPI example app:
 * 1. FastAPI backend starts successfully
 * 2. Vite frontend builds and starts
 * 3. AgentDebugBridge connects
 * 4. UI hierarchy can be fetched
 * 5. Can interact with UI elements that call FastAPI endpoints
 */

import { ChildProcess, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import puppeteer, { Browser } from 'puppeteer';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const exec = promisify(execCallback);
import {
  info,
  success,
  error,
  startVerdaccio,
  stopVerdaccio,
  publishPackages,
  runCommand,
  runAgentCommand,
  assertContains,
  spawnBackground,
  killProcess,
  waitFor,
  sleep,
  setupCleanup,
} from '../common/helpers.js';

let agentServer: ChildProcess | null = null;
let fastapiBackend: ChildProcess | null = null;
let browser: Browser | null = null;
let testConfigDir: string | null = null;
let exampleAppDir: string | null = null;

async function cleanup() {
  info('Cleaning up...');

  if (browser) {
    try {
      await browser.close();
      info('Browser closed');
    } catch (err) {
      // Ignore browser cleanup errors
    }
  }

  if (fastapiBackend) {
    await killProcess(fastapiBackend, 'FastAPI backend');
  }

  if (agentServer) {
    await killProcess(agentServer, 'Agenteract dev');
  }

  // Clean up temp directories (skip in CI to preserve artifacts)
  if (!process.env.CI) {
    await stopVerdaccio();

    if (testConfigDir) {
      try {
        await runCommand(`rm -rf ${testConfigDir}`);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    if (exampleAppDir) {
      try {
        await runCommand(`rm -rf ${exampleAppDir}`);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
}

async function main() {
  setupCleanup(cleanup);

  try {
    info('Starting FastAPI E2E test: App Launch');

    // 1. Clean up any existing processes on agenteract and app ports
    info('Cleaning up any existing processes...');
    try {
      await runCommand('lsof -ti:8765,8766,8790,8791,8792,5174,8000 | xargs kill -9 2>/dev/null || true');
      await sleep(2000);
    } catch (err) {
      // Ignore cleanup errors
    }

    // 2. Start Verdaccio
    await startVerdaccio();

    // 3. Publish packages
    await publishPackages();

    // 4. Copy fastapi-example to /tmp and prepare for Verdaccio
    info('Copying fastapi-example to /tmp and preparing for Verdaccio...');
    exampleAppDir = `/tmp/agenteract-e2e-fastapi-app-${Date.now()}`;
    await runCommand(`rm -rf ${exampleAppDir}`);
    await runCommand(`cp -r examples/fastapi-example ${exampleAppDir}`);

    // Remove node_modules to avoid workspace symlinks
    await runCommand(`rm -rf ${exampleAppDir}/node_modules package-lock.json`);

    // Replace workspace:* dependencies with * for Verdaccio
    info('Replacing workspace:* dependencies...');
    const pkgJsonPath = `${exampleAppDir}/package.json`;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));

    ['dependencies', 'devDependencies'].forEach(depType => {
      if (pkgJson[depType]) {
        Object.keys(pkgJson[depType]).forEach(key => {
          if (pkgJson[depType][key] === 'workspace:*') {
            pkgJson[depType][key] = '*';
          }
        });
      }
    });

    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
    success('Workspace dependencies replaced');

    // Fix vite.config.ts to remove monorepo-specific paths
    info('Fixing vite.config.ts...');
    const viteConfigPath = `${exampleAppDir}/vite.config.ts`;
    const newViteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
`;
    writeFileSync(viteConfigPath, newViteConfig);
    success('Vite config fixed');

    // Install Node dependencies from Verdaccio
    info('Installing fastapi-example dependencies from Verdaccio...');
    await runCommand(`cd ${exampleAppDir} && npm install --registry http://localhost:4873`);
    success('FastAPI example prepared with Verdaccio packages');

    // Check if Python and pip are available
    info('Checking Python installation...');
    try {
      const pythonVersion = await runCommand('python3 --version');
      info(`Python version: ${pythonVersion.trim()}`);
    } catch (err) {
      error('Python 3 is not installed. Please install Python 3 to run this test.');
      throw err;
    }

    // Install Python dependencies
    info('Installing Python dependencies...');
    await runCommand(`cd ${exampleAppDir} && pip3 install -r requirements.txt --quiet`);
    success('Python dependencies installed');

    // 5. Start FastAPI backend
    info('Starting FastAPI backend on port 8000...');
    fastapiBackend = spawnBackground(
      'python3',
      ['-m', 'uvicorn', 'main:app', '--reload', '--port', '8000'],
      'fastapi-backend',
      { cwd: exampleAppDir }
    );

    // Wait for FastAPI to be ready
    await waitFor(
      async () => {
        try {
          await runCommand('curl -s http://localhost:8000/health');
          return true;
        } catch {
          return false;
        }
      },
      'FastAPI backend to start',
      30000,
      1000
    );
    success('FastAPI backend is running');

    // 6. Install CLI packages in separate config directory
    info('Installing CLI packages from Verdaccio...');
    testConfigDir = `/tmp/agenteract-e2e-test-fastapi-${Date.now()}`;
    await runCommand(`rm -rf ${testConfigDir}`);
    await runCommand(`mkdir -p ${testConfigDir}`);
    await runCommand(`cd ${testConfigDir} && npm init -y`);
    await runCommand(
      `cd ${testConfigDir} && npm install @agenteract/cli @agenteract/agents @agenteract/server @agenteract/vite --registry http://localhost:4873`
    );
    success('CLI packages installed from Verdaccio');

    // 7. Create agenteract config pointing to the /tmp app
    info('Creating agenteract config for fastapi-app in /tmp...');
    await runCommand(
      `cd ${testConfigDir} && npx @agenteract/cli add-config ${exampleAppDir} fastapi-app 'npm run dev'`
    );
    success('Config created');

    // 8. Start agenteract dev from test directory (starts Vite dev server and agent bridge)
    info('Starting agenteract dev...');
    info('This will start the Vite dev server and AgentDebugBridge');
    agentServer = spawnBackground(
      'npx',
      ['@agenteract/cli', 'dev'],
      'agenteract-dev',
      { cwd: testConfigDir }
    );

    // Give servers time to start
    await sleep(5000);

    // Check dev logs
    info('Checking Vite dev server logs...');
    try {
      const devLogs = await runAgentCommand(`cwd:${testConfigDir}`, 'dev-logs', 'fastapi-app', '--since', '50');
      info('Vite dev logs:');
      console.log(devLogs);
    } catch (err) {
      error(`Failed to get dev logs: ${err}`);
    }

    // 9. Launch headless browser with Puppeteer
    info('Launching headless browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    info('Opening http://localhost:5174 in headless browser...');
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle0' });
    success('Browser loaded Vite app');

    // Give AgentDebugBridge time to connect
    await sleep(3000);

    // 10. Wait for AgentDebugBridge connection
    await waitFor(
      async () => {
        try {
          await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'fastapi-app');
          return true;
        } catch {
          return false;
        }
      },
      'AgentDebugBridge to connect',
      30000,
      2000
    );

    // 11. Get hierarchy and verify UI loaded
    info('Fetching UI hierarchy...');
    const hierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'fastapi-app');

    // Basic assertions - verify app loaded correctly
    assertContains(hierarchy, 'Agenteract FastAPI Demo', 'UI contains app title');
    assertContains(hierarchy, 'add-task-button', 'UI contains add task button');
    assertContains(hierarchy, 'task-input', 'UI contains task input');
    assertContains(hierarchy, 'api-status', 'UI contains API status indicator');
    success('UI hierarchy fetched successfully');

    // 12. Test that API is healthy
    info('Verifying API health status in UI...');
    assertContains(hierarchy, 'healthy', 'API reports healthy status');
    success('FastAPI backend is healthy');

    // 13. Test adding a task via UI
    info('Testing task creation via UI...');
    await runAgentCommand(`cwd:${testConfigDir}`, 'input', 'fastapi-app', 'task-input', 'Test Task from E2E');
    await sleep(500);
    await runAgentCommand(`cwd:${testConfigDir}`, 'tap', 'fastapi-app', 'add-task-button');
    await sleep(1000); // Wait for API call to complete

    // 14. Verify task was created
    info('Verifying task was created...');
    const logs = await runAgentCommand(`cwd:${testConfigDir}`, 'logs', 'fastapi-app', '--since', '10');
    assertContains(logs, 'Task created', 'Task creation was logged');
    success('Task created successfully through FastAPI backend');

    // 15. Fetch hierarchy again to verify task appears
    const updatedHierarchy = await runAgentCommand(`cwd:${testConfigDir}`, 'hierarchy', 'fastapi-app');
    assertContains(updatedHierarchy, 'Test Task from E2E', 'New task appears in UI');
    success('Task verified in UI');

    // 16. Verify we can see the task in the API directly
    info('Verifying task in FastAPI backend...');
    const apiResponse = await runCommand('curl -s http://localhost:8000/api/tasks');
    assertContains(apiResponse, 'Test Task from E2E', 'Task exists in FastAPI backend');
    success('Task verified in backend');

    success('✅ All tests passed! FastAPI + Agenteract integration working!');

  } catch (err) {
    error(`Test failed: ${err}`);
    process.exit(1);
  } finally {
    await cleanup();
    process.exit(0);
  }
}

main();
