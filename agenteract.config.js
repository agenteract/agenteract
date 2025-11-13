export default {
  "port": 8766,
  "projects": [
    {
      "name": "expo-app",
      "path": "./examples/expo-example",
      "type": "expo",
      "ptyPort": 8790
    },
    {
      "name": "react-app",
      "path": "./examples/react-example",
      "type": "vite",
      "ptyPort": 8791
    },
    {
      "name": "swift-app",
      "path": "./examples/swift-app",
      "type": "native"
    },
    {
      "name": "flutter-app",
      "path": "./examples/flutter_example",
      "type": "flutter",
      "ptyPort": 8792
    },
    {
      "name": "fastapi-app",
      "path": "/tmp/agenteract-e2e-fastapi-app-1763027709259",
      "devServer": {
        "command": "npm run dev",
        "port": 8793
      }
    }
  ]
};