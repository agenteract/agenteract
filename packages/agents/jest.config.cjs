/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@agenteract/core$': '<rootDir>/../core/src/index.ts',
    '^@agenteract/core/node$': '<rootDir>/../core/src/node/index.ts',
    '^@agenteract/(.*)$': '<rootDir>/../$1/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!@agenteract)',
  ],
  testMatch: [
    '**/tests/**/*.test.ts',
  ],
};
