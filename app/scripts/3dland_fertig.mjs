// Nach dem Bau von 3dland (vite.3dland.config.ts): die Seite heisst index.html, dazu Manifest, Bildmarke und Symbole aus
// public-3dland (Michael, 2026-10-21: «als Platzhalter ein App Logo») und die Lizenztexte der mitgelieferten Bibliotheken
import { cpSync, readdirSync, renameSync } from 'node:fs'

const ziel = process.argv[2] ?? 'dist-3dland'
renameSync(`${ziel}/3dland.html`, `${ziel}/index.html`)
for (const datei of readdirSync('public-3dland')) cpSync(`public-3dland/${datei}`, `${ziel}/${datei}`)
cpSync('public/lizenzen', `${ziel}/lizenzen`, { recursive: true })
