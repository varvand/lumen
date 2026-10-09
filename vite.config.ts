import { createReadStream, readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const PDFJS = fileURLToPath(new URL('./node_modules/pdfjs-dist/', import.meta.url));

/**
 * PDF.js loads image decoders (JBIG2, JPEG 2000, ICC colors) and fonts that PDFs name but do
 * not embed from URLs at run time, so they are served at /pdfjs/ and copied into the build.
 */
function pdfjsAssets(): Plugin {
  const files: Record<string, string[]> = {
    wasm: readdirSync(join(PDFJS, 'wasm')).filter((f) => !f.startsWith('quickjs')),
    standard_fonts: readdirSync(join(PDFJS, 'standard_fonts')),
  };
  const types: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript' };
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs/', (req, res, next) => {
        const [folder, file] = decodeURIComponent((req.url || '').split('?')[0])
          .replace(/^\//, '')
          .split('/');
        if (!files[folder]?.includes(file)) return next();
        res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        createReadStream(join(PDFJS, folder, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const [folder, names] of Object.entries(files))
        for (const name of names)
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${folder}/${name}`,
            source: readFileSync(join(PDFJS, folder, name)),
          });
    },
  };
}

export default defineConfig({
  plugins: [svelte(), pdfjsAssets()],
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  clearScreen: false,
  build: { target: 'es2022' },
});
