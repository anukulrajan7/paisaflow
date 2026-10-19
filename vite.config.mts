/**
 * Vite config for the PaisaFlow web target (react-native-web).
 *
 * Two HTML entry points live under `web/`:
 *   - `web/index.html`      → the product landing page (static, no React)
 *   - `web/app/index.html`  → the React Native app rendered via react-native-web
 *
 * Output goes to `dist/web`. Platform-specific code lives in `*.web.ts(x)`
 * siblings that shadow their native counterparts — the same convention Metro
 * uses, so the Android bundle never sees them.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import react from '@vitejs/plugin-react';
import type {Plugin} from 'vite';
import {defineConfig} from 'vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/** `.web.*` first so platform shims shadow native modules (Metro semantics). */
const EXTENSIONS = [
  '.web.tsx',
  '.web.ts',
  '.web.mjs',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.mjs',
  '.jsx',
  '.js',
  '.json',
];

const EXPLICIT_EXT = /\.(m?js|jsx|tsx?)$/;

/** `./foo.js` → `./foo.web.js` when the sibling exists (libs built by babel). */
function webSibling(source: string, importerDir: string): string | null {
  if (!source.startsWith('.') || !EXPLICIT_EXT.test(source)) {
    return null;
  }
  if (/\.(web|native|android|ios)\.[^.]+$/.test(source)) {
    return null;
  }
  const candidate = source.replace(EXPLICIT_EXT, '.web.$1');
  return fs.existsSync(path.resolve(importerDir, candidate)) ? candidate : null;
}

/** Resolver plugin (Rolldown-compatible) used for the build and dep pre-bundling. */
function webExtensionsPlugin(): Plugin {
  return {
    name: 'paisaflow:web-extensions',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer) {
        return null;
      }
      const candidate = webSibling(source, path.dirname(importer));
      if (!candidate) {
        return null;
      }
      return this.resolve(candidate, importer, {skipSelf: true});
    },
  };
}

export default defineConfig(({mode}) => {
  const isProd = mode === 'production';
  return {
    root: path.resolve(ROOT, 'web'),
    publicDir: path.resolve(ROOT, 'web/public'),
    base: '/',
    plugins: [webExtensionsPlugin(), react()],
    define: {
      __DEV__: JSON.stringify(!isProd),
      'process.env.NODE_ENV': JSON.stringify(mode),
      global: 'globalThis',
    },
    resolve: {
      alias: [{find: /^react-native$/, replacement: 'react-native-web'}],
      extensions: EXTENSIONS,
      dedupe: ['react', 'react-dom', 'react-native-web'],
    },
    optimizeDeps: {
      include: ['react-native-web', 'sql.js'],
      // Vite 8 pre-bundles with Rolldown; reuse the same resolver there.
      rolldownOptions: {
        resolve: {extensions: EXTENSIONS},
        plugins: [webExtensionsPlugin()],
      },
    },
    server: {
      port: 5180,
      strictPort: true,
      fs: {allow: [ROOT]},
    },
    preview: {
      port: 5181,
      strictPort: true,
    },
    build: {
      outDir: path.resolve(ROOT, 'dist/web'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        input: {
          landing: path.resolve(ROOT, 'web/index.html'),
          app: path.resolve(ROOT, 'web/app/index.html'),
        },
        output: {
          // Cache-friendly split: the SQLite engine and third-party code
          // change rarely, so they live in their own hashed chunks and stay
          // cached across app deploys.
          manualChunks(id) {
            if (id.includes('node_modules/sql.js')) {
              return 'sqljs';
            }
            if (id.includes('node_modules/')) {
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
