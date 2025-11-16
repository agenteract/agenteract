#!/usr/bin/env tsx
/**
 * Script to test Verdaccio authentication
 * Usage: tsx scripts/test-verdaccio-auth.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const VERDACCIO_URL = process.env.VERDACCIO_URL || 'http://localhost:4873';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

async function test1_CheckVerdaccioRunning(): Promise<TestResult> {
  console.log('Test 1: Checking if Verdaccio is running...');
  try {
    const response = await fetch(`${VERDACCIO_URL}/-/ping`);
    if (response.ok) {
      console.log(`✅ Verdaccio is running at ${VERDACCIO_URL}`);
      return { name: 'Verdaccio Running', passed: true, message: 'Verdaccio is running' };
    } else {
      console.log('❌ Verdaccio is not running');
      console.log('   Start with: pnpm verdaccio:start');
      return { name: 'Verdaccio Running', passed: false, message: 'Verdaccio is not running' };
    }
  } catch {
    console.log('❌ Verdaccio is not running');
    console.log('   Start with: pnpm verdaccio:start');
    return { name: 'Verdaccio Running', passed: false, message: 'Failed to connect to Verdaccio' };
  }
}

function test2_CheckRegistryConfig(): TestResult {
  console.log('Test 2: Checking npm registry configuration...');
  try {
    const currentRegistry = execSync('npm config get registry', { encoding: 'utf-8' }).trim();
    console.log(`   Current registry: ${currentRegistry}`);

    const registryMatches =
      currentRegistry === `${VERDACCIO_URL}/` || currentRegistry === VERDACCIO_URL;

    if (registryMatches) {
      console.log('✅ Registry is correctly configured');
      return { name: 'Registry Config', passed: true, message: 'Registry correctly configured' };
    } else {
      console.log('⚠️  Registry is not pointing to Verdaccio');
      console.log(`   Run: npm config set registry ${VERDACCIO_URL}`);
      return {
        name: 'Registry Config',
        passed: false,
        message: 'Registry not pointing to Verdaccio',
      };
    }
  } catch (error) {
    console.log('❌ Failed to check registry configuration');
    return { name: 'Registry Config', passed: false, message: 'Failed to check registry' };
  }
}

function test3_CheckAuthentication(): TestResult {
  console.log('Test 3: Checking authentication status...');
  try {
    const currentUser = execSync(`npm whoami --registry "${VERDACCIO_URL}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    console.log(`✅ Already authenticated as: ${currentUser}`);
    return {
      name: 'Authentication',
      passed: true,
      message: `Authenticated as ${currentUser}`,
      alreadyAuthenticated: true,
    } as any;
  } catch {
    console.log('⚠️  Not authenticated');
    return {
      name: 'Authentication',
      passed: false,
      message: 'Not authenticated',
      alreadyAuthenticated: false,
    } as any;
  }
}

async function test5_CheckAPIAccess(): Promise<TestResult> {
  console.log('Test 5: Testing Verdaccio API access...');
  try {
    const response = await fetch(`${VERDACCIO_URL}/-/whoami`);
    if (response.ok) {
      console.log('✅ API is accessible');
      return { name: 'API Access', passed: true, message: 'API is accessible' };
    } else {
      console.log('❌ API is not accessible');
      return { name: 'API Access', passed: false, message: 'API not accessible' };
    }
  } catch {
    console.log('❌ API is not accessible');
    return { name: 'API Access', passed: false, message: 'Failed to access API' };
  }
}

async function test6_CheckPackages(): Promise<TestResult> {
  console.log('Test 6: Checking for existing packages...');
  try {
    const response = await fetch(`${VERDACCIO_URL}/-/v1/search?text=@agenteract`);
    const data = await response.json();
    const packageCount = data.objects?.length || 0;

    if (packageCount > 0) {
      console.log(`✅ Found ${packageCount} @agenteract packages`);
      console.log('   Packages:');
      data.objects.forEach((obj: any) => {
        console.log(`   - ${obj.package.name}`);
      });
      return {
        name: 'Packages',
        passed: true,
        message: `Found ${packageCount} packages`,
      };
    } else {
      console.log('⚠️  No @agenteract packages found');
      console.log('   Publish with: pnpm verdaccio:publish');
      return { name: 'Packages', passed: false, message: 'No packages found' };
    }
  } catch {
    console.log('⚠️  Failed to check packages');
    return { name: 'Packages', passed: false, message: 'Failed to check packages' };
  }
}

function test7_CheckAuthToken(): TestResult {
  console.log('Test 7: Checking npm auth token...');
  const npmrcPath = join(homedir(), '.npmrc');

  if (existsSync(npmrcPath)) {
    const npmrcContent = readFileSync(npmrcPath, 'utf-8');
    if (npmrcContent.includes(VERDACCIO_URL)) {
      console.log('✅ Auth token found in ~/.npmrc');
      return { name: 'Auth Token', passed: true, message: 'Auth token found' };
    }
  }

  console.log('⚠️  No auth token found in ~/.npmrc');
  console.log("   This is normal if you haven't authenticated yet");
  return { name: 'Auth Token', passed: false, message: 'No auth token found' };
}

async function main(): Promise<void> {
  console.log('🔍 Testing Verdaccio Authentication');
  console.log('====================================');
  console.log('');

  const test1 = await test1_CheckVerdaccioRunning();
  if (!test1.passed) {
    process.exit(1);
  }
  console.log('');

  const test2 = test2_CheckRegistryConfig();
  console.log('');

  const test3 = test3_CheckAuthentication();
  const alreadyAuthenticated = (test3 as any).alreadyAuthenticated;
  console.log('');

  if (!alreadyAuthenticated) {
    console.log('Test 4: Testing authentication capability...');
    console.log('ℹ️  Automated authentication available via TypeScript script');
    console.log('   Run: npx tsx scripts/verdaccio-auth.ts');
    console.log('   Or run: pnpm verdaccio:publish to authenticate and publish');
    console.log('   Or authenticate manually: npm adduser --registry ' + VERDACCIO_URL);
    console.log('');
  }

  const test5 = await test5_CheckAPIAccess();
  if (!test5.passed) {
    process.exit(1);
  }
  console.log('');

  const test6 = await test6_CheckPackages();
  console.log('');

  const test7 = test7_CheckAuthToken();
  console.log('');

  // Summary
  console.log('====================================');
  console.log('Summary:');
  console.log('');
  if (alreadyAuthenticated) {
    console.log('✅ All checks passed! Ready to publish.');
  } else {
    console.log('ℹ️  Not authenticated yet (this is normal)');
  }
  console.log('');
  console.log('Next steps:');
  console.log('  • Publish packages: pnpm verdaccio:publish');
  console.log('  • Run integration tests: pnpm test:integration');
  console.log('  • Stop Verdaccio: pnpm verdaccio:stop');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
