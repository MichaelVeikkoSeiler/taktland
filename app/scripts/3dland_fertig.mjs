// Nach dem Bau von 3dland (vite.3dland.config.ts): die Seite heisst index.html, dazu Manifest, Bildmarke und Symbole
// (vorerst die von Taktland, Michael, 2026-10-21) und die Lizenztexte der mitgelieferten Bibliotheken
import { cpSync, renameSync } from 'node:fs'

const ziel = process.argv[2] ?? 'dist-3dland'
renameSync(`${ziel}/3dland.html`, `${ziel}/index.html`)
cpSync('public-3dland/manifest.webmanifest', `${ziel}/manifest.webmanifest`)
for (const datei of ['logo.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) {
  cpSync(`public/${datei}`, `${ziel}/${datei}`)
}
cpSync('public/lizenzen', `${ziel}/lizenzen`, { recursive: true })
