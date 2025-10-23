// agenteract.config.js
export default {
  /**
   * The port for the central Agenteract server.
   * The agent connects to this port.
   */
  port: 8766,

  /**
   * An array of projects to manage.
   */
  projects: [
    {
      // A unique identifier for this app. Used for targeting commands.
      name: 'expo-app',
      // The path to the app's root directory, relative to this config file.
      path: './examples/expo-example',
      // The type of project. Can be 'expo', 'vite', or 'auto'.
      type: 'expo',
      // The port for this app's dev server PTY bridge.
      ptyPort: 8790,
    },
    {
      name: 'react-app',
      path: './examples/react-example',
      type: 'vite',
      ptyPort: 8791,
    },
    {
      name: 'swift-app',
      path: './examples/swift-app',
      type: 'native'
    }
  ],
};
