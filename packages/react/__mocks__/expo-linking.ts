// Mock expo-linking for web builds
export const addEventListener = (type: string, handler: Function) => ({ remove: () => {} });
export const getInitialURL = () => Promise.resolve(null);
export const openURL = (url: string) => Promise.resolve(true);
export const canOpenURL = (url: string) => Promise.resolve(true);

export default {
  addEventListener,
  getInitialURL,
  openURL,
  canOpenURL,
};
