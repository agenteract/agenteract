#!/usr/bin/env tsx
/**
 * Clear Build Cache
 * 
 * Clears the build cache for e2e tests.
 * Optionally can clear Verdaccio storage as well.
 * 
 * Usage:
 *   pnpm cache:clear                 # Clear build cache only
 *   pnpm cache:clear --verdaccio     # Clear build cache and Verdaccio storage
 *   pnpm cache:clear --package core  # Clear cache for specific package
 */

import { clearCache } from './build-cache.js';
import { execSync } from 'child_process';

async function main() {
  const args = process.argv.slice(2);
  
  console.log('🧹 Clear Cache Utility');
  console.log();

  // Check for package-specific clear
  const packageIndex = args.indexOf('--package');
  if (packageIndex !== -1 && args[packageIndex + 1]) {
    const packageName = args[packageIndex + 1];
    const fullName = packageName.startsWith('@') ? packageName : `@agenteract/${packageName}`;
    
    console.log(`Clearing cache for ${fullName}...`);
    clearCache(fullName);
  } else {
    // Clear all cache
    console.log('Clearing all build cache...');
    clearCache();
  }

  // Optionally clear Verdaccio storage
  if (args.includes('--verdaccio')) {
    console.log();
    console.log('Clearing Verdaccio storage...');
    
    try {
      // Stop Verdaccio
      console.log('   Stopping Verdaccio...');
      execSync('pnpm verdaccio:stop', { stdio: 'inherit' });
      
      // Start with --clean flag
      console.log('   Starting Verdaccio with clean storage...');
      execSync('pnpm verdaccio:start -- --clean', { stdio: 'inherit' });
      
      console.log('✅ Verdaccio storage cleared and restarted');
    } catch (error) {
      console.error('⚠️  Error managing Verdaccio:', error);
      console.log('   You may need to manually restart Verdaccio');
    }
  }

  console.log();
  console.log('✅ Cache cleared!');
  console.log();
  console.log('Next steps:');
  console.log('  • Run e2e test: pnpm test:e2e:vite');
  console.log('  • This will rebuild and cache packages fresh');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
