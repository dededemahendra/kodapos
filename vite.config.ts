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
  environments: {
    // Scoped to the client environment, NOT set at the top level. A top-level
    // `build.sourcemap` applies to every environment, which also emitted maps
    // for the workerd/SSR bundle. Those are never served, so they were not a
    // leak, but they are build output and worker payload that nothing reads,
    // and the documented trade below is specifically about dist/client.
    client: {
      build: {
        // Needed so PostHog exception autocapture can symbolicate minified
        // stack traces: without maps every frame reads as `t.a is not a
        // function` at chunk-abc.js:1:40213.
        //
        // These maps are PUBLISHED, deliberately. Cloudflare serves
        // dist/client verbatim, so shipping them means PostHog can fetch each
        // one over HTTP from the `sourceMappingURL` comment Vite emits, with
        // no API key and no upload step anywhere in the deploy. The accepted
        // trade is that the complete unminified frontend source is
        // downloadable by anyone.
        //
        // If that trade is ever revisited, the alternative is posthog-cli
        // uploading dist/client to PostHog and deleting the maps before
        // deploy, which needs a personal API key (the public phc_ key cannot
        // do it: it is ingestion-only, and symbol set upload is an
        // authenticated management endpoint). See
        // docs/error-tracking-setup.md.
        sourcemap: true,
      },
    },
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
