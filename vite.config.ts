import { cloudflare } from '@cloudflare/vite-plugin';
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    // App version, surfaced in the UI (e.g. dashboard). Sourced from package.json
    // so it stays in sync with the published version with no manual step.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    // Cloudflare must come before tanstackStart so the SSR build targets workerd.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tsconfigPaths(),
    tanstackStart(),
    lingui(),
    babel({ presets: [linguiTransformerBabelPreset()] }),
    tailwindcss(),
    viteReact(),
  ],
});
