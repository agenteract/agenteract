#!/usr/bin/env tsx
/**
 * Dependency Graph Analysis for Workspace Packages
 * 
 * Analyzes workspace dependencies to determine:
 * - Which packages depend on other packages
 * - Build order (topological sort)
 * - Transitive dependents (what needs rebuild when a package changes)
 * 
 * Usage:
 *   import { buildDependencyGraph, getDependents, getPublishOrder } from './dependency-graph.js'
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export interface DependencyGraph {
  [packageName: string]: {
    dependencies: Set<string>;    // Direct dependencies
    dependents: Set<string>;      // Packages that depend on this
    packagePath: string;
  };
}

/**
 * Build dependency graph from workspace packages
 */
export function buildDependencyGraph(packagesDir: string = join(process.cwd(), 'packages')): DependencyGraph {
  const graph: DependencyGraph = {};

  // First pass: Collect all packages
  const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => join(packagesDir, dirent.name))
    .filter((dir) => existsSync(join(dir, 'package.json')));

  const allPackageNames = new Set<string>();

  for (const packageDir of packageDirs) {
    const packageJsonPath = join(packageDir, 'package.json');
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const packageName = packageJson.name;

      if (!packageName) continue;

      allPackageNames.add(packageName);
      
      graph[packageName] = {
        dependencies: new Set<string>(),
        dependents: new Set<string>(),
        packagePath: packageDir,
      };
    } catch (error) {
      console.error(`Error reading ${packageJsonPath}:`, error);
    }
  }

  // Second pass: Build dependency relationships
  for (const packageName of allPackageNames) {
    const packageDir = graph[packageName].packagePath;
    const packageJsonPath = join(packageDir, 'package.json');
    
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Check all dependency types
      const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
      
      for (const depType of depTypes) {
        if (packageJson[depType]) {
          for (const dep of Object.keys(packageJson[depType])) {
            // Only track workspace dependencies (other packages in our monorepo)
            if (allPackageNames.has(dep)) {
              graph[packageName].dependencies.add(dep);
              graph[dep].dependents.add(packageName);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error analyzing dependencies for ${packageName}:`, error);
    }
  }

  return graph;
}

/**
 * Get all packages that depend on the given package (directly or transitively)
 */
export function getDependents(packageName: string, graph: DependencyGraph): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();

  function visit(pkg: string) {
    if (visited.has(pkg)) return;
    visited.add(pkg);

    if (!graph[pkg]) return;

    for (const dependent of graph[pkg].dependents) {
      result.add(dependent);
      visit(dependent); // Recursively get transitive dependents
    }
  }

  visit(packageName);
  return result;
}

/**
 * Get all packages that the given package depends on (directly or transitively)
 */
export function getDependencies(packageName: string, graph: DependencyGraph): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();

  function visit(pkg: string) {
    if (visited.has(pkg)) return;
    visited.add(pkg);

    if (!graph[pkg]) return;

    for (const dependency of graph[pkg].dependencies) {
      result.add(dependency);
      visit(dependency); // Recursively get transitive dependencies
    }
  }

  visit(packageName);
  return result;
}

/**
 * Topological sort for build/publish order
 * Returns packages in order such that dependencies come before dependents
 */
export function getPublishOrder(packagesToPublish: string[], graph: DependencyGraph): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(pkg: string) {
    if (visited.has(pkg)) return;
    
    if (visiting.has(pkg)) {
      throw new Error(`Circular dependency detected involving ${pkg}`);
    }

    visiting.add(pkg);

    if (!graph[pkg]) {
      console.warn(`Warning: Package ${pkg} not found in dependency graph`);
      visited.add(pkg);
      visiting.delete(pkg);
      return;
    }

    // Visit dependencies first
    for (const dep of graph[pkg].dependencies) {
      // Only visit dependencies that are in our publish list
      if (packagesToPublish.includes(dep)) {
        visit(dep);
      }
    }

    visiting.delete(pkg);
    visited.add(pkg);
    result.push(pkg);
  }

  for (const pkg of packagesToPublish) {
    visit(pkg);
  }

  return result;
}

/**
 * Get packages in the order they should be built (considering all dependencies)
 * This includes dependencies that might not be in the packagesToPublish list
 */
export function getBuildOrder(packagesToPublish: string[], graph: DependencyGraph): string[] {
  // Expand to include all dependencies
  const allPackages = new Set<string>(packagesToPublish);
  
  for (const pkg of packagesToPublish) {
    const deps = getDependencies(pkg, graph);
    deps.forEach(dep => allPackages.add(dep));
  }

  return getPublishOrder([...allPackages], graph);
}

/**
 * Print dependency graph for debugging
 */
export function printDependencyGraph(graph: DependencyGraph): void {
  console.log('📊 Workspace Dependency Graph\n');

  const packages = Object.keys(graph).sort();

  for (const pkg of packages) {
    const info = graph[pkg];
    console.log(`${pkg}`);
    
    if (info.dependencies.size > 0) {
      console.log(`  Dependencies: ${[...info.dependencies].join(', ')}`);
    }
    
    if (info.dependents.size > 0) {
      console.log(`  Dependents: ${[...info.dependents].join(', ')}`);
    }
    
    if (info.dependencies.size === 0 && info.dependents.size === 0) {
      console.log('  (no workspace dependencies)');
    }
    
    console.log();
  }
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  const graph = buildDependencyGraph();
  printDependencyGraph(graph);

  // Test publish order
  const allPackages = Object.keys(graph);
  console.log('📦 Publish Order (all packages):');
  const order = getPublishOrder(allPackages, graph);
  order.forEach((pkg, i) => console.log(`  ${i + 1}. ${pkg}`));
}
