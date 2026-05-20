import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      include: [
        /\.[jt]sx?$/,
        /node_modules[\\/]@expo[\\/]vector-icons[\\/].*\.js$/,
        /node_modules[\\/]react-native-calendars[\\/].*\.js$/,
      ],
    }),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'react-native-calendars': '/src/stubs/react-native-calendars.tsx',
      'expo-av': '/src/stubs/empty.js',
    },
  },
  optimizeDeps: {
    exclude: ['react-native-calendars'],
  },
  server: {
    port: 5173,
  },
});