import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import esbuild from 'esbuild';

// Native-only modules that would break the web build
const stubAliases: Record<string, string> = {
  'react-native-screens': 'react-native-web/dist/exports/View',
  'react-native-safe-area-context': '',
  'react-native-gesture-handler': '',
  'react-native-reanimated': '',
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'stub-native-modules',
      resolveId(source) {
        for (const mod of Object.keys(stubAliases)) {
          if (source === mod || source.startsWith(mod + '/')) {
            return '\0virtual:stub';
          }
        }
        return null;
      },
      load(id) {
        if (id === '\0virtual:stub') {
          return 'export default {};';
        }
        return null;
      },
    },
    {
      name: 'fix-jsx-in-node-modules',
      transform(code, id) {
        if (!id.includes('node_modules') || !id.endsWith('.js')) return null;
        try {
          const result = esbuild.transformSync(code, {
            loader: 'jsx',
            jsx: 'automatic',
            sourcemap: false,
          });
          return { code: result.code, map: null };
        } catch {
          return null;
        }
      },
    },
    {
      name: 'handle-flow-type-exports',
      transform(code, id) {
        if (!id.endsWith('.js')) return null;
        // Strip export type { ... } syntax that Rollup can't parse
        if (code.includes('export type')) {
          const transformed = code.replace(/export type \{[^}]*\};?/g, '');
          if (transformed !== code) {
            return { code: transformed, map: null };
          }
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@expo/vector-icons': './src/icons.tsx',
      'expo-asset': './src/stubs/empty.js',
      'expo-constants': './src/stubs/empty.js',
      'expo-file-system': './src/stubs/empty.js',
      'expo-font': './src/stubs/empty.js',
      'expo-keep-awake': './src/stubs/empty.js',
      'expo-modules-core': './src/stubs/empty.js',
      'expo-web-browser': './src/stubs/empty.js',
      'expo-av': './src/stubs/empty.js',
      'expo-notifications': './src/stubs/empty.js',
      'expo-status-bar': './src/stubs/empty.js',
      '@react-native/assets-registry': './src/stubs/empty.js',
      '@react-native/assets': './src/stubs/empty.js',
    },
  },
  optimizeDeps: {
    exclude: [
      '@react-native/assets-registry',
      'expo-asset',
      'expo-constants',
      'expo-modules-core',
      'expo-av',
      'expo-notifications',
      'expo-status-bar',
    ],
  },
  build: {
    outDir: 'dist',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      },
    },
  },
});