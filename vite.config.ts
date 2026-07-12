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
  base: '/',
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'react-native-calendars': '/src/stubs/react-native-calendars.tsx',
      'expo-av': '/src/stubs/empty.js',
      'lottie-react-native': '/src/stubs/lottie-react-native.js',
    },
  },
  optimizeDeps: {
    exclude: ['react-native-calendars'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});