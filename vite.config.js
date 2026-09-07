import { defineConfig } from 'vite';

// `base: './'` — chemins relatifs pour un déploiement GitHub Pages sous
// /astrolab/ sans avoir à hardcoder le nom du repo. `dist/` sera publié
// tel quel par le workflow Actions à venir.
export default defineConfig({
  base: './',
  server: {
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
