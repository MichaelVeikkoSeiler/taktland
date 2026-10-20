import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * 3dland.ch (Michael, 2026-10-21): nur «3D Schweiz» als eigene Seite, gebaut aus demselben Code wie Taktland. Die Daten holt
 * sie von taktland.ch (Gelände, Luftbild, Orte …) und daten.taktland.ch, beide erlauben den Abruf von anderswo (CORS); so
 * liegt nichts doppelt. Veröffentlicht vom Repository 3dland (sein Workflow baut mit diesem Befehl):
 *
 *     npx vite build -c vite.3dland.config.ts && node scripts/3dland_fertig.mjs
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // ohne public/: dort liegen die Daten von Taktland; die wenigen Dateien kopiert scripts/3dland_fertig.mjs
  publicDir: false,
  define: {
    'import.meta.env.VITE_GEBAUT': JSON.stringify(new Date().toISOString()),
    'import.meta.env.VITE_DATEN_BASIS': JSON.stringify(process.env.VITE_DATEN_BASIS ?? 'https://taktland.ch/app/'),
  },
  build: {
    outDir: 'dist-3dland',
    emptyOutDir: true,
    rollupOptions: { input: '3dland.html' },
  },
})
