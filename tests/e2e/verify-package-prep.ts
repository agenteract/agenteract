#!/usr/bin/env node
/**
 * Verification script to test preparePackageForVerdaccio helper
 * without running full e2e tests
 */

import { existsSync, readFileSync, rmSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  info,
  success,
  error,
  startVerdaccio,
  publishPackages,
  preparePackageForVerdaccio,
} from './common/helpers.js';

async function main() {
  try {
    info('Starting verification test for preparePackageForVerdaccio...');

    // 1. Start Verdaccio
    await startVerdaccio();

    // 2. Publish packages
    await publishPackages();

    // 3. Test with expo example
    info('Testing with expo-example...');
    const tmpDir = `/tmp/agenteract-verify-${Date.now()}`;
    const expoDir = join(tmpDir, 'expo-example');
    
    mkdirSync(tmpDir, { recursive: true });
    cpSync('examples/expo-example', expoDir, { recursive: true });
    
    // 4. Prepare package
    const result = await preparePackageForVerdaccio(expoDir);
    
    // 5. Verify package.json was updated
    const pkgJson = JSON.parse(readFileSync(join(expoDir, 'package.json'), 'utf8'));
    
    let hasWorkspace = false;
    let hasE2E = false;
    
    ['dependencies', 'devDependencies'].forEach(depType => {
      if (pkgJson[depType]) {
        Object.keys(pkgJson[depType]).forEach(key => {
          if (pkgJson[depType][key].includes('workspace:')) {
            hasWorkspace = true;
            error(`Found workspace:* in ${key}: ${pkgJson[depType][key]}`);
          }
          if (pkgJson[depType][key].includes('-e2e.')) {
            hasE2E = true;
            info(`Found e2e version in ${key}: ${pkgJson[depType][key]}`);
          }
        });
      }
    });
    
    // 6. Verify .npmrc was created
    const npmrcExists = existsSync(join(expoDir, '.npmrc'));
    
    // 7. Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
    
    // 8. Report results
    if (hasWorkspace) {
      throw new Error('workspace:* dependencies were not replaced!');
    }
    
    if (!hasE2E) {
      throw new Error('No e2e versions found - preparePackageForVerdaccio may have failed');
    }
    
    if (!npmrcExists) {
      throw new Error('.npmrc was not created!');
    }
    
    if (result.replacedCount === 0) {
      throw new Error('No dependencies were replaced!');
    }
    
    success('✅ All verifications passed!');
    success(`   - Replaced ${result.replacedCount} workspace:* dependencies`);
    success(`   - Found e2e versions in package.json`);
    success(`   - .npmrc created with auth token`);
    success(`   - No workspace:* dependencies remaining`);
    
    process.exit(0);
  } catch (err) {
    error(`Verification failed: ${err}`);
    process.exit(1);
  }
}

main();
