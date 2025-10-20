// packages/cli/tests/mocks/agenteract.config.js
export default {
  port: 9999,
  projects: [
    {
      name: 'mock-app',
      path: './mock/path',
      type: 'vite',
      ptyPort: 9998,
    },
  ],
};
