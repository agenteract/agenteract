// agenteract.config.js
export default {
  /**
   * The port for the central Agenteract server.
   * The agent connects to this port.
   */
  port: 8766,

  /**
   * Default wait time in milliseconds before fetching logs after agent commands (tap, input, etc.).
   * Set to -1 for immediate response (recommended for test scripts).
   * Default: 500ms (will change to 0ms in next major version)
   * Can be overridden per-command with --wait flag.
   */
  // waitLogTimeout: 0,

  /**
   * An array of projects to manage.
   */
  projects: [
    {
      // A unique identifier for this app. Used for targeting commands.
      name: 'expo-app',
      // The path to the app's root directory, relative to this config file.
      path: './examples/expo-example',
      // The dev server configuration.
      devServer: {
        command: 'npx expo start --ios --localhost',
        port: 8790
      },
      scheme: 'exp'
    },
    {
      name: 'react-app',
      path: './examples/react-example',
      devServer: {
        command: 'npm run dev',
        port: 8791
      }
    },
    {
      name: 'swift-app',
      path: './examples/swift-app',
      type: 'native'
    },
    {
      name: 'kmp-app',
      path: './examples/kmp-example',
      type: 'native'
    },
    {
      name: 'flutter-app',
      path: './examples/flutter_example',
      devServer: {
        command: 'flutter run',
        port: 8792
      }
    }
  ],
};
