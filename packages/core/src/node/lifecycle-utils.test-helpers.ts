/**
 * Shared fixture data for lifecycle-utils test suite.
 * Pure data — no jest.mock() calls (those must stay in each test file for hoisting).
 */

import { Device } from './device-manager';

export const iosDevice: Device = {
  id: 'ABC-123',
  name: 'iPhone 15',
  type: 'ios',
  state: 'booted',
};

export const androidDevice: Device = {
  id: 'emulator-5554',
  name: 'Pixel 5',
  type: 'android',
  state: 'booted',
};

export const desktopDevice: Device = {
  id: 'desktop',
  name: 'Desktop',
  type: 'desktop',
};
