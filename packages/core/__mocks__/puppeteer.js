// Manual mock for puppeteer to support dynamic import testing
const mockBrowser = {
  newPage: jest.fn().mockResolvedValue({
    goto: jest.fn().mockResolvedValue(undefined),
  }),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockLaunch = jest.fn().mockResolvedValue(mockBrowser);

module.exports = {
  launch: mockLaunch,
  default: {
    launch: mockLaunch,
  },
  __mockBrowser: mockBrowser,
  __mockLaunch: mockLaunch,
};
