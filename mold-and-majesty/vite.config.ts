import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    // Phaser pèse ~1,2 Mo minifié à lui seul : on l'isole dans son propre fichier, mis en cache
    // indépendamment du code du jeu.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        advancedChunks: { groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
