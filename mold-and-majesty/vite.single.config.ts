import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

/** Build en un seul fichier HTML autonome (JS, police et favicon inclus). */
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      viteSingleFile(),
      {
        // Le favicon aussi, en data URI : le fichier HTML ne dépend de rien d'autre.
        name: 'inline-favicon',
        transformIndexHtml: (html) =>
          html.replace(
            './favicon.svg',
            `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`,
          ),
      },
    ],
    // Pas de copie de public/ : tout est déjà dans le HTML.
    publicDir: false,
    build: {
      outDir: 'dist-single',
      assetsInlineLimit: 100_000_000,
      rolldownOptions: { output: { advancedChunks: { groups: [] } } },
    },
  }),
);
