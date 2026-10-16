import { defineConfig } from 'vite'

/** baut scripts/netzpruefung.ts für Node, ohne die Dateien aus public */
export default defineConfig({
  base: './',
  publicDir: false,
  build: { ssr: 'scripts/netzpruefung.ts', outDir: 'node_modules/.netzpruefung', emptyOutDir: true },
})
