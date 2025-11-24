import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, '../../packages/react/__mocks__/react-native.ts'),
      'expo-linking': path.resolve(__dirname, '../../packages/react/__mocks__/expo-linking.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, '../../packages/react/__mocks__/async-storage.ts'),
    },
  },
})
