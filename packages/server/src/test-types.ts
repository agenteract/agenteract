/**
 * Test Runner Types
 *
 * Type definitions for YAML test definitions and execution results.
 */

// Step types
export interface TapStep {
  tap: string;
  wait?: number;
}

export interface InputStep {
  input: string;
  value: string;
}

export interface WaitForStep {
  waitFor?: string;  // testID - optional if logContains is provided
  timeout?: number;
  text?: string;     // wait for element to contain this text
  logContains?: string;  // wait for console log to contain this string
}

export interface AssertExistsCondition {
  exists: string;
}

export interface AssertNotExistsCondition {
  notExists: string;
}

export interface AssertTextCondition {
  text: {
    testID: string;
    contains?: string;
    equals?: string;
  };
}

export interface AssertLogCondition {
  logContains: string;
}

export type AssertCondition =
  | AssertExistsCondition
  | AssertNotExistsCondition
  | AssertTextCondition
  | AssertLogCondition;

export interface AssertStep {
  assert: AssertCondition;
}

export interface ScrollStep {
  scroll: string;
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface SwipeStep {
  swipe: string;
  direction: 'up' | 'down' | 'left' | 'right';
  velocity?: 'slow' | 'medium' | 'fast';
}

export interface LongPressStep {
  longPress: string;
}

export interface SleepStep {
  sleep: number;
}

export interface LogStep {
  log: string;
}

export interface PhaseStep {
  phase: string;
}

export interface CustomStep {
  custom: string;
  args?: Record<string, unknown>;
}

export interface LaunchStep {
  launch: 'app';
  device?: string;
  timeout?: number;
  waitForReady?: boolean;
}

export interface StopStep {
  stop: 'app' | 'kill';
  timeout?: number;
}

export interface SetupStep {
  setup: 'install' | 'reinstall' | 'clearData';
  platform?: 'ios' | 'android';
}

export interface BuildStep {
  build: 'debug' | 'release' | string;
  platform?: 'ios' | 'android' | 'desktop' | 'web';
}

export interface AgentLinkStep {
  agentLink: string;
  timeout?: number;
}

export interface PairStep {
  pair: 'simulator' | 'emulator' | 'physical';
  platform?: 'ios' | 'android';
  timeout?: number;
}

export type Step =
  | TapStep
  | InputStep
  | WaitForStep
  | AssertStep
  | ScrollStep
  | SwipeStep
  | LongPressStep
  | SleepStep
  | LogStep
  | PhaseStep
  | LaunchStep
  | StopStep
  | SetupStep
  | BuildStep
  | AgentLinkStep
  | PairStep
  | CustomStep;

// Test definition
export interface TestDefinition {
  project: string;
  device?: string;
  timeout?: number;
  extensions?: string | string[];
  steps: Step[];
}

// Step result
export interface StepResult {
  step: number;
  action: string;
  target?: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  condition?: string;
  stepDefinition?: Step; // Include the original step definition for debugging
}

// Test result
export interface TestResult {
  status: 'passed' | 'failed';
  duration: number;
  steps: StepResult[];
  logs?: unknown[];
  failedAt?: number;
  error?: string;
}

// Helper type guards
export function isTapStep(step: Step): step is TapStep {
  return 'tap' in step;
}

export function isInputStep(step: Step): step is InputStep {
  return 'input' in step;
}

export function isWaitForStep(step: Step): step is WaitForStep {
  return 'waitFor' in step && (step as any).waitFor !== undefined;
}

export function isAssertStep(step: Step): step is AssertStep {
  return 'assert' in step;
}

export function isScrollStep(step: Step): step is ScrollStep {
  return 'scroll' in step;
}

export function isSwipeStep(step: Step): step is SwipeStep {
  return 'swipe' in step;
}

export function isLongPressStep(step: Step): step is LongPressStep {
  return 'longPress' in step;
}

export function isSleepStep(step: Step): step is SleepStep {
  return 'sleep' in step;
}

export function isLogStep(step: Step): step is LogStep {
  return 'log' in step;
}

export function isPhaseStep(step: Step): step is PhaseStep {
  return 'phase' in step;
}

export function isCustomStep(step: Step): step is CustomStep {
  return 'custom' in step;
}

export function isLaunchStep(step: Step): step is LaunchStep {
  return 'launch' in step;
}

export function isStopStep(step: Step): step is StopStep {
  return 'stop' in step;
}

export function isSetupStep(step: Step): step is SetupStep {
  return 'setup' in step;
}

export function isBuildStep(step: Step): step is BuildStep {
  return 'build' in step;
}

export function isAgentLinkStep(step: Step): step is AgentLinkStep {
  return 'agentLink' in step;
}

export function isPairStep(step: Step): step is PairStep {
  return 'pair' in step;
}

// Get action name from step
export function getStepAction(step: Step): string {
  if (isTapStep(step)) return 'tap';
  if (isInputStep(step)) return 'input';
  if (isWaitForStep(step)) return 'waitFor';
  if (isAssertStep(step)) return 'assert';
  if (isScrollStep(step)) return 'scroll';
  if (isSwipeStep(step)) return 'swipe';
  if (isLongPressStep(step)) return 'longPress';
  if (isSleepStep(step)) return 'sleep';
  if (isLogStep(step)) return 'log';
  if (isPhaseStep(step)) return 'phase';
  if (isLaunchStep(step)) return 'launch';
  if (isStopStep(step)) return 'stop';
  if (isSetupStep(step)) return 'setup';
  if (isBuildStep(step)) return 'build';
  if (isAgentLinkStep(step)) return 'agentLink';
  if (isPairStep(step)) return 'pair';
  if (isCustomStep(step)) return 'custom';
  return 'unknown';
}

// Get target from step
export function getStepTarget(step: Step): string | undefined {
  if (isTapStep(step)) return step.tap;
  if (isInputStep(step)) return step.input;
  if (isWaitForStep(step)) return step.waitFor;
  if (isScrollStep(step)) return step.scroll;
  if (isSwipeStep(step)) return step.swipe;
  if (isLongPressStep(step)) return step.longPress;
  if (isLaunchStep(step)) return step.launch;
  if (isStopStep(step)) return step.stop;
  if (isSetupStep(step)) return step.setup;
  if (isBuildStep(step)) return step.build;
  if (isAgentLinkStep(step)) return step.agentLink;
  if (isPairStep(step)) return step.pair;
  if (isCustomStep(step)) return step.custom;
  return undefined;
}
