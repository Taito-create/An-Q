import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
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
      'react-native-svg': '/src/stubs/react-native-svg.tsx',
      'react-native-calendars': '/src/stubs/react-native-calendars.tsx',
      'expo-av': '/src/stubs/empty.js',
      'lottie-react-native': '/src/stubs/lottie-react-native.jsx',
    },
  },
  optimizeDeps: {
    exclude: ['react-native-calendars'],
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: './index.html',
      },
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
}));
