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
  isDeepLinkStep,
  isCustomStep,
  getStepAction,
  getStepTarget,
  AssertExistsCondition,
  AssertNotExistsCondition,
  AssertTextCondition,
  AssertLogCondition,
} from './test-types.js';

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
  sendCommand: SendCommandFn;
  getHierarchy: GetHierarchyFn;
  getLogs: GetLogsFn;
  defaultTimeout: number;
  log: (message: string) => void;
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

  console.log(`[Test] Step ${stepIndex}: ${action} ${target ? `(${target})` : ''}`);

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

    if (isDeepLinkStep(step)) {
      // Detect platform and execute appropriate command
      // For now, try iOS first, then Android
      // Add 5-second timeout to prevent hanging
      const deepLinkTimeout = 5000;
      const deviceId = ctx.device || 'booted';
      
      console.log(`[Test] Attempting deep link: ${step.deepLink} on device: ${deviceId}`);
      
      let iosError: Error | null = null;
      try {
        const output = execSync(`xcrun simctl openurl "${deviceId}" "${step.deepLink}"`, { 
          stdio: 'pipe',
          timeout: deepLinkTimeout 
        });
        console.log(`[Test] iOS deep link command succeeded: ${output.toString().trim()}`);
        return {
          step: stepIndex,
          action,
          target,
          status: 'passed',
          duration: Date.now() - startTime,
        };
      } catch (e) {
        iosError = e as Error;
        console.log(`[Test] iOS deep link failed: ${iosError.message}`);
        if ((iosError as any).stderr) {
          console.log(`[Test] iOS deep link stderr: ${(iosError as any).stderr.toString()}`);
        }
      }

      try {
        console.log(`[Test] Attempting Android deep link fallback...`);
        const output = execSync(`adb shell am start -a android.intent.action.VIEW -d "${step.deepLink}"`, { 
          stdio: 'pipe',
          timeout: deepLinkTimeout 
        });
        console.log(`[Test] Android deep link command succeeded: ${output.toString().trim()}`);
      } catch (androidError) {
        console.log(`[Test] Android deep link failed: ${(androidError as Error).message}`);
        throw new Error(
          `Failed to open deep link on both iOS and Android.\n` +
          `iOS Error: ${iosError?.message}\n` +
          `Android Error: ${(androidError as Error).message}`
        );
      }

      return {
        step: stepIndex,
        action,
        target,
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
    return {
      step: stepIndex,
      action,
      target,
      status: 'failed',
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
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

  for (let i = 0; i < definition.steps.length; i++) {
    const step = definition.steps[i];
    const result = await executeStep(step, i + 1, fullCtx);
    results.push(result);

    if (result.status === 'failed') {
      // Stop on first failure
      // Mark remaining steps as skipped
      for (let j = i + 1; j < definition.steps.length; j++) {
        results.push({
          step: j + 1,
          action: getStepAction(definition.steps[j]),
          target: getStepTarget(definition.steps[j]),
          status: 'skipped',
          duration: 0,
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

  return {
    status: 'passed',
    duration: Date.now() - startTime,
    steps: results,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
