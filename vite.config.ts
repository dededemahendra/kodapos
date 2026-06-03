import { cloudflare } from '@cloudflare/vite-plugin';
import { lingui, linguiTransformerBabelPreset } from '@lingui/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
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
