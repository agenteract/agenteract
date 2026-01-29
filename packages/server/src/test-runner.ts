/**
 * Test Runner Engine
 *
 * Executes YAML test definitions server-side, reducing round-trips
 * by handling waitFor polling and assertions internally.
 */

import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import {
  TestDefinition,
  TestResult,
  StepResult,
  Step,
  isTapStep,
  isInputStep,
  isWaitForStep,
  isAssertStep,
  isScrollStep,
  isSwipeStep,
  isLongPressStep,
  isSleepStep,
  isLogStep,
  isPhaseStep,
  isLaunchStep,
  isStopStep,
  isSetupStep,
  isBuildStep,
  isAgentLinkStep,
  isPairStep,
  isCustomStep,
  getStepAction,
  getStepTarget,
  AssertExistsCondition,
  AssertNotExistsCondition,
  AssertTextCondition,
  AssertLogCondition,
} from './test-types.js';
import {
  detectPlatform,
  PlatformInfo,
  resolveBundleIds,
  BundleInfo,
  selectDevice,
  Device,
  launchApp,
  stopApp,
  buildApp,
  performSetup,
  LaunchResult,
} from '@agenteract/core/node';

// Hierarchy node from app
interface HierarchyNode {
  name?: string;
  testID?: string;
  text?: string;
  children?: HierarchyNode[];
  [key: string]: unknown;
}

// Function to send command and wait for response
type SendCommandFn = (command: Record<string, unknown>) => Promise<Record<string, unknown>>;

// Function to get hierarchy
type GetHierarchyFn = () => Promise<HierarchyNode | null>;

// Function to get logs
type GetLogsFn = (since?: number) => Promise<Array<{ level: string; message: string; timestamp: number }>>;

export interface TestRunnerContext {
  project: string;
  device?: string;
  projectPath?: string;
  lifecycleConfig?: {
    bundleId?: {
      ios?: string;
      android?: string;
    };
    mainActivity?: string;
    launchTimeout?: number;
    requiresInstall?: boolean;
  };
  sendCommand: SendCommandFn;
  getHierarchy: GetHierarchyFn;
  getLogs: GetLogsFn;
  defaultTimeout: number;
  log: (message: string) => void;
  lifecycleState?: {
    platform?: PlatformInfo;
    bundleInfo?: BundleInfo;
    selectedDevice?: Device;
    launchResult?: LaunchResult;
  };
}

/**
 * Find a node in the hierarchy by testID
 */
function findNodeByTestID(node: HierarchyNode | null, testID: string): HierarchyNode | null {
  if (!node) return null;

  if (node.testID === testID) {
    return node;
  }

  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByTestID(child, testID);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Get text content from a node (including nested Text children)
 */
function getNodeText(node: HierarchyNode): string | null {
  if (node.text) return node.text;
  
  // For Swift/iOS: fall back to accessibilityLabel if no text property
  // SwiftUI Text views often only expose text via accessibilityLabel
  if ((node as any).accessibilityLabel) {
    return (node as any).accessibilityLabel;
  }

  // Collect text from child Text nodes
  const collectText = (n: HierarchyNode): string[] => {
    const texts: string[] = [];
    // Check both 'type' (Flutter) and 'name' (other platforms) properties
    const nodeType = (n as any).type || n.name;
    if (n.text && nodeType === 'Text') {
      texts.push(n.text);
    }
    if (n.children) {
      for (const child of n.children) {
        texts.push(...collectText(child));
      }
    }
    return texts;
  };

  const childTexts = collectText(node);
  return childTexts.length > 0 ? childTexts.join(' ') : null;
}

/**
 * Check if hierarchy contains a testID (searches full JSON string for speed)
 */
function hierarchyContainsTestID(hierarchy: HierarchyNode | null, testID: string): boolean {
  if (!hierarchy) return false;
  // Fast path: search the serialized hierarchy
  const json = JSON.stringify(hierarchy);
  return json.includes(`"testID":"${testID}"`);
}

/**
 * Execute a single step
 */
async function executeStep(
  step: Step,
  stepIndex: number,
  ctx: TestRunnerContext
): Promise<StepResult> {
  const startTime = Date.now();
  const action = getStepAction(step);
  const target = getStepTarget(step);

  // Format step for logging
  const stepStr = JSON.stringify(step, null, 2).split('\n').map(line => `  ${line}`).join('\n');
  console.log(`[Test] Step ${stepIndex}: ${action} ${target ? `(${target})` : ''}`);
  console.log(`[Test] Step definition:\n${stepStr}`);

  try {
    // Handle each step type
    if (isTapStep(step)) {
      await ctx.sendCommand({
        project: ctx.project,
        action: 'tap',
        testID: step.tap,
        device: ctx.device,
      });

      if (step.wait && step.wait > 0) {
        await sleep(step.wait);
      }

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isInputStep(step)) {
      // Resolve environment variables in value
      let value = step.value;
      const envMatch = value.match(/\$\{\{\s*env\.(\w+)\s*\}\}/);
      if (envMatch) {
        const envVar = process.env[envMatch[1]];
        if (envVar === undefined) {
          throw new Error(`Environment variable ${envMatch[1]} is not set`);
        }
        value = value.replace(envMatch[0], envVar);
      }

      await ctx.sendCommand({
        project: ctx.project,
        action: 'input',
        testID: step.input,
        value,
        device: ctx.device,
      });

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isWaitForStep(step)) {
      const timeout = step.timeout || ctx.defaultTimeout;
      const pollInterval = 500;
      const startWait = Date.now();

      // Wait for console log to appear
      if (step.logContains) {
        console.log(`[Test] Waiting for log containing: "${step.logContains}"`);
        let pollCount = 0;
        while (Date.now() - startWait < timeout) {
          pollCount++;
          const logs = await ctx.getLogs();  // Get all logs, not since timestamp 30
          console.log(`[Test] Poll ${pollCount}: Got ${logs.length} logs`);
          if (logs.length > 0) {
            console.log(`[Test] Poll ${pollCount} last log: ${logs[logs.length - 1].message}`);
          }
          const logText = logs.map(l => l.message).join('\n');
          
          if (logText.includes(step.logContains)) {
            console.log(`[Test] ✓ Found log containing: "${step.logContains}"`);
            return {
              step: stepIndex,
              action,
              target: step.logContains,
              status: 'passed',
              duration: Date.now() - startTime,
            };
          }

          console.log(`[Test] Log not found yet, waiting ${pollInterval}ms...`);
          await sleep(pollInterval);
        }

        throw new Error(`Timeout waiting for log: "${step.logContains}"`);
      }

      // Wait for element (with optional text match)
      if (!step.waitFor || step.waitFor === "") {
        throw new Error('waitFor step requires either "waitFor" (testID) or "logContains"');
      }

      console.log(`[Test] Waiting for element: "${step.waitFor}"${step.text ? ` with text "${step.text}"` : ''}`);
      let pollCount = 0;
      while (Date.now() - startWait < timeout) {
        pollCount++;
        if (pollCount % 5 === 1) {  // Log every 5th poll to reduce spam
          console.log(`[Test] Poll ${pollCount}: Checking hierarchy for "${step.waitFor}"...`);
        }
        const hierarchy = await ctx.getHierarchy();

        if (step.text) {
          // Wait for element with specific text
          const node = findNodeByTestID(hierarchy, step.waitFor);
          if (node) {
            const nodeText = getNodeText(node);
            if (nodeText && nodeText.includes(step.text)) {
              console.log(`[Test] ✓ Found element "${step.waitFor}" with text "${step.text}"`);
              return {
                step: stepIndex,
                action,
                target,
                status: 'passed',
                duration: Date.now() - startTime,
              };
            }
          }
        } else {
          // Wait for element to exist
          if (hierarchyContainsTestID(hierarchy, step.waitFor)) {
            console.log(`[Test] ✓ Found element "${step.waitFor}"`);
            return {
              step: stepIndex,
              action,
              target,
              status: 'passed',
              duration: Date.now() - startTime,
            };
          }
        }

        await sleep(pollInterval);
      }

      throw new Error(`Timeout waiting for element: ${step.waitFor}${step.text ? ` with text "${step.text}"` : ''}`);
    }

    if (isAssertStep(step)) {
      const condition = step.assert;
      let conditionStr: string;

      if ('exists' in condition) {
        conditionStr = `exists:${(condition as AssertExistsCondition).exists}`;
        const hierarchy = await ctx.getHierarchy();
        if (!hierarchyContainsTestID(hierarchy, (condition as AssertExistsCondition).exists)) {
          throw new Error(`Element not found: ${(condition as AssertExistsCondition).exists}`);
        }
      } else if ('notExists' in condition) {
        conditionStr = `notExists:${(condition as AssertNotExistsCondition).notExists}`;
        const hierarchy = await ctx.getHierarchy();
        if (hierarchyContainsTestID(hierarchy, (condition as AssertNotExistsCondition).notExists)) {
          throw new Error(`Element should not exist: ${(condition as AssertNotExistsCondition).notExists}`);
        }
      } else if ('text' in condition) {
        const textCond = (condition as AssertTextCondition).text;
        conditionStr = `text:${textCond.testID}`;
        const hierarchy = await ctx.getHierarchy();
        const node = findNodeByTestID(hierarchy, textCond.testID);
        if (!node) {
          throw new Error(`Element not found for text assertion: ${textCond.testID}`);
        }
        const nodeText = getNodeText(node);
        if (textCond.contains && (!nodeText || !nodeText.includes(textCond.contains))) {
          throw new Error(`Text "${nodeText || ''}" does not contain "${textCond.contains}"`);
        }
        if (textCond.equals && nodeText !== textCond.equals) {
          throw new Error(`Text "${nodeText || ''}" does not equal "${textCond.equals}"`);
        }
      } else if ('logContains' in condition) {
        conditionStr = `logContains:${(condition as AssertLogCondition).logContains}`;
        const logs = await ctx.getLogs();  // Get all logs, not since timestamp 30
        const logText = logs.map(l => l.message).join('\n');
        if (!logText.includes((condition as AssertLogCondition).logContains)) {
          throw new Error(`Logs do not contain: ${(condition as AssertLogCondition).logContains}`);
        }
      } else {
        throw new Error('Unknown assert condition');
      }

      return {
        step: stepIndex,
        action,
        condition: conditionStr,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isScrollStep(step)) {
      await ctx.sendCommand({
        project: ctx.project,
        action: 'scroll',
        testID: step.scroll,
        direction: step.direction,
        amount: step.amount || 100,
        device: ctx.device,
      });

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isSwipeStep(step)) {
      await ctx.sendCommand({
        project: ctx.project,
        action: 'swipe',
        testID: step.swipe,
        direction: step.direction,
        velocity: step.velocity || 'medium',
        device: ctx.device,
      });

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isLongPressStep(step)) {
      await ctx.sendCommand({
        project: ctx.project,
        action: 'longPress',
        testID: step.longPress,
        device: ctx.device,
      });

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isSleepStep(step)) {
      await sleep(step.sleep);

      return {
        step: stepIndex,
        action,
        target: `${step.sleep}ms`,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isLogStep(step)) {
      ctx.log(step.log);

      return {
        step: stepIndex,
        action,
        target: step.log,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isPhaseStep(step)) {
      console.log(`\n[Test] --- Phase: ${step.phase} ---\n`);
      ctx.log(`--- Phase: ${step.phase} ---`);

      return {
        step: stepIndex,
        action,
        target: step.phase,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isLaunchStep(step)) {
      if (!ctx.projectPath) {
        throw new Error('Project path is required for launch step');
      }

      // 1. Detect platform
      const platformInfo = await detectPlatform(ctx.projectPath);
      console.log(`[Test] Detected platform: ${platformInfo.type}`);

      // 2. Extract bundle IDs
      const bundleInfo = await resolveBundleIds(ctx.projectPath, platformInfo.type, ctx.lifecycleConfig);
      console.log(`[Test] Bundle IDs:`, bundleInfo);

      // 3. Select device
      const platformForDevice = platformInfo.type.includes('android')
        ? 'android'
        : platformInfo.type === 'kmp-desktop'
        ? 'desktop'
        : platformInfo.type === 'vite'
        ? 'web'
        : 'ios';

      const device = await selectDevice(step.device || ctx.device, platformForDevice);

      if (!device) {
        throw new Error(`No device available for platform ${platformInfo.type}`);
      }

      console.log(`[Test] Selected device:`, device);

      // 4. Launch app
      const launchResult = await launchApp(
        platformInfo.type,
        device,
        bundleInfo,
        ctx.projectPath,
        { timeout: step.timeout, waitForReady: step.waitForReady }
      );

      console.log(`[Test] App launched successfully`);

      // 5. Store state for cleanup
      ctx.lifecycleState = {
        platform: platformInfo,
        bundleInfo,
        selectedDevice: device || undefined,
        launchResult,
      };

      // 6. Wait for connection if requested
      if (step.waitForReady !== false) {
        const connectionTimeout = step.timeout || 60000;
        const pollInterval = 1000;
        const startWait = Date.now();

        console.log(`[Test] Waiting for app connection (timeout: ${connectionTimeout}ms)...`);

        while (Date.now() - startWait < connectionTimeout) {
          try {
            const hierarchy = await ctx.getHierarchy();
            if (hierarchy) {
              console.log(`[Test] App connected successfully`);
              break;
            }
          } catch (error) {
            // App not connected yet
          }

          if (Date.now() - startWait >= connectionTimeout) {
            throw new Error(`Timeout waiting for app connection (${connectionTimeout}ms)`);
          }

          await sleep(pollInterval);
        }
      }

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isStopStep(step)) {
      if (!ctx.lifecycleState || !ctx.lifecycleState.platform || !ctx.lifecycleState.bundleInfo) {
        throw new Error('No app is running. Use launch step first.');
      }

      const force = step.stop === 'kill';
      await stopApp(
        ctx.lifecycleState.platform.type,
        ctx.lifecycleState.selectedDevice || null,
        ctx.lifecycleState.bundleInfo,
        ctx.lifecycleState.launchResult,
        force
      );

      console.log(`[Test] App stopped (${force ? 'force' : 'graceful'})`);

      return {
        step: stepIndex,
        action,
        target,
        status: 'passed',
        duration: Date.now() - startTime,
        stepDefinition: step,
      };
    }

    if (isSetupStep(step)) {
      if (!ctx.projectPath) {
        throw new Error('Project path is required for setup step');
      }

      if (!ctx.lifecycleState) {
        // Initialize lifecycle state if not already done
        const platformInfo = await detectPlatform(ctx.projectPath);
        const bundleInfo = await resolveBundleIds(ctx.projectPath, platformInfo.type, ctx.lifecycleConfig);
        const platformForDevice = platformInfo.type.includes('android')
          ? 'android'
          : platformInfo.type === 'kmp-desktop'
          ? 'desktop'
          : platformInfo.type === 'vite'
          ? 'web'
          : 'ios';
        const device = await selectDevice(ctx.device, platformForDevice);

        ctx.lifecycleState = {
          platform: platformInfo,
          bundleInfo,
          selectedDevice: device || undefined,
        };
      }

      await performSetup(
        ctx.projectPath,
        ctx.lifecycleState.platform!.type,
        ctx.lifecycleState.selectedDevice || null,
        ctx.lifecycleState.bundleInfo!,
        { action: step.setup, platform: step.platform }
      );

      console.log(`[Test] Setup completed: ${step.setup}`);

      return {
        step: stepIndex,
        action,
        target: step.setup,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isBuildStep(step)) {
      if (!ctx.projectPath) {
        throw new Error('Project path is required for build step');
      }

      if (!ctx.lifecycleState) {
        const platformInfo = await detectPlatform(ctx.projectPath);
        ctx.lifecycleState = { platform: platformInfo };
      }

      await buildApp(
        ctx.projectPath,
        ctx.lifecycleState.platform!.type,
        { configuration: step.build, platform: step.platform }
      );

      console.log(`[Test] Build completed: ${step.build}`);

      return {
        step: stepIndex,
        action,
        target: step.build,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isAgentLinkStep(step)) {
      // Send agentLink payload via AgentDebugBridge
      await ctx.sendCommand({
        project: ctx.project,
        action: 'agentLink',
        payload: step.agentLink,
        device: ctx.device,
      });

      // Optional: wait for response if timeout specified
      if (step.timeout) {
        await sleep(step.timeout);
      }

      console.log(`[Test] AgentLink sent: ${step.agentLink}`);

      return {
        step: stepIndex,
        action,
        target: step.agentLink,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isPairStep(step)) {
      // Generate and send pairing deep link to simulator/emulator
      // This tests deep link pairing for app initialization
      
      const { loadConfig, loadRuntimeConfig, findConfigRoot } = await import('@agenteract/core/node');
      
      // Load runtime config to get server details
      const runtimeConfig = await loadRuntimeConfig(ctx.projectPath || process.cwd());
      if (!runtimeConfig) {
        throw new Error('Runtime config not found. Is the Agenteract dev server running?');
      }

      // Load project config to get scheme
      const configRoot = await findConfigRoot(ctx.projectPath || process.cwd());
      if (!configRoot) {
        throw new Error('Could not find agenteract.config.js');
      }

      const agenteractConfig = await loadConfig(configRoot);
      const project = agenteractConfig.projects.find(p => p.name === ctx.project);
      if (!project || !project.scheme) {
        throw new Error(`Project "${ctx.project}" not found or has no scheme configured`);
      }

      const scheme = project.scheme;
      
      // Determine host based on device type
      // For simulators/emulators, use localhost
      // For physical devices, we'd need to use the machine's IP address
      const host = step.pair === 'physical' ? 'REQUIRES_MACHINE_IP' : 'localhost';
      
      // Generate pairing deep link
      let pairingUrl: string;
      if (scheme === 'exp' || scheme === 'exps') {
        // Expo Go format
        const expoPort = 8081;
        pairingUrl = `${scheme}://${host}:${expoPort}/--/agenteract/config?host=${host}&port=${runtimeConfig.port}&token=${runtimeConfig.token}`;
      } else {
        // Standard deep link format
        pairingUrl = `${scheme}://agenteract/config?host=${host}&port=${runtimeConfig.port}&token=${runtimeConfig.token}`;
      }

      console.log(`[Test] Pairing with ${step.pair} device using deep link: ${pairingUrl}`);

      // Send deep link to device based on platform
      if (step.platform === 'ios' && step.pair === 'simulator') {
        try {
          // Use xcrun simctl openurl to send deep link to iOS Simulator
          execSync(`xcrun simctl openurl booted "${pairingUrl}"`, { stdio: 'inherit' });
          console.log(`[Test] Sent pairing deep link to iOS Simulator`);
        } catch (error) {
          throw new Error(`Failed to send deep link to iOS Simulator: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (step.platform === 'android' && step.pair === 'emulator') {
        try {
          // Use adb to send deep link to Android Emulator
          execSync(`adb shell am start -a android.intent.action.VIEW -d "${pairingUrl}"`, { stdio: 'inherit' });
          console.log(`[Test] Sent pairing deep link to Android Emulator`);
        } catch (error) {
          throw new Error(`Failed to send deep link to Android Emulator: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else if (step.pair === 'physical') {
        // For physical devices, we just log the URL - user needs to scan QR code manually
        console.log(`[Test] Physical device pairing URL generated. User must scan QR code.`);
        console.log(`[Test] URL: ${pairingUrl}`);
      } else {
        throw new Error(`Unsupported pairing configuration: platform=${step.platform}, type=${step.pair}`);
      }

      // Wait for connection (give app time to process deep link and connect)
      const waitTime = step.timeout || 5000;
      console.log(`[Test] Waiting ${waitTime}ms for app to pair...`);
      await sleep(waitTime);

      return {
        step: stepIndex,
        action,
        target: `${step.pair}-${step.platform || 'auto'}`,
        status: 'passed',
        duration: Date.now() - startTime,
      };
    }

    if (isCustomStep(step)) {
      // Custom steps require TypeScript extensions - not implemented in MVP
      throw new Error('Custom steps require TypeScript extensions (not yet implemented)');
    }

    throw new Error(`Unknown step type: ${action}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Test] ❌ Step ${stepIndex} FAILED: ${action} ${target ? `(${target})` : ''}`);
    console.error(`[Test] Error: ${errorMessage}`);
    console.error(`[Test] Failed step definition:\n${JSON.stringify(step, null, 2)}`);
    
    return {
      step: stepIndex,
      action,
      target,
      status: 'failed',
      duration: Date.now() - startTime,
      error: errorMessage,
      stepDefinition: step,
    };
  }
}

/**
 * Run a test definition
 */
export async function runTest(
  definition: TestDefinition,
  ctx: Omit<TestRunnerContext, 'project' | 'device' | 'defaultTimeout'>
): Promise<TestResult> {
  const startTime = Date.now();
  const results: StepResult[] = [];
  const logs: Array<{ level: string; message: string; timestamp: number }> = [];

  const fullCtx: TestRunnerContext = {
    ...ctx,
    project: definition.project,
    device: definition.device,
    defaultTimeout: definition.timeout || 10000,
  };

  try {
    for (let i = 0; i < definition.steps.length; i++) {
      const step = definition.steps[i];
      const result = await executeStep(step, i + 1, fullCtx);
      results.push(result);

      if (result.status === 'failed') {
        // Stop on first failure
        console.error(`\n[Test] ═══════════════════════════════════════════════════════`);
        console.error(`[Test] TEST FAILED AT STEP ${i + 1}/${definition.steps.length}`);
        console.error(`[Test] ═══════════════════════════════════════════════════════`);
        console.error(`[Test] Action: ${result.action} ${result.target ? `(${result.target})` : ''}`);
        console.error(`[Test] Error: ${result.error}`);
        console.error(`[Test] Step definition:\n${JSON.stringify(result.stepDefinition, null, 2)}`);
        console.error(`[Test] ═══════════════════════════════════════════════════════\n`);
        
        // Mark remaining steps as skipped
        for (let j = i + 1; j < definition.steps.length; j++) {
          results.push({
            step: j + 1,
            action: getStepAction(definition.steps[j]),
            target: getStepTarget(definition.steps[j]),
            status: 'skipped',
            duration: 0,
            stepDefinition: definition.steps[j],
          });
        }

        // Collect recent logs for debugging
        try {
          const recentLogs = await fullCtx.getLogs(50);
          logs.push(...recentLogs);
        } catch {
          // Ignore log collection errors
        }

        return {
          status: 'failed',
          duration: Date.now() - startTime,
          steps: results,
          logs,
          failedAt: i + 1,
          error: result.error,
        };
      }
    }

    // All steps passed
    console.log(`\n[Test] ═══════════════════════════════════════════════════════`);
    console.log(`[Test] ✅ ALL TESTS PASSED`);
    console.log(`[Test] ═══════════════════════════════════════════════════════`);
    console.log(`[Test] Total steps: ${results.length}`);
    console.log(`[Test] Duration: ${Date.now() - startTime}ms`);
    console.log(`[Test] ═══════════════════════════════════════════════════════\n`);

    return {
      status: 'passed',
      duration: Date.now() - startTime,
      steps: results,
    };
  } finally {
    // Cleanup: Ensure browser/app is stopped if test launched it
    if (fullCtx.lifecycleState?.launchResult) {
      try {
        console.log('[Test] Cleaning up launched app/browser...');
        const { loadConfig, findConfigRoot } = await import('@agenteract/core/node');
        const configRoot = await findConfigRoot(fullCtx.projectPath || process.cwd());
        if (configRoot) {
          const config = await loadConfig(configRoot);
          const project = config.projects.find(p => p.name === definition.project);
          if (project && fullCtx.lifecycleState.platform && fullCtx.lifecycleState.bundleInfo) {
            await stopApp(
              fullCtx.lifecycleState.platform.type,
              fullCtx.lifecycleState.selectedDevice || null,
              fullCtx.lifecycleState.bundleInfo,
              fullCtx.lifecycleState.launchResult,
              false
            );
          }
        }
      } catch (err) {
        console.error(`[Test] Error during cleanup: ${err}`);
        // Don't throw - we're cleaning up
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
