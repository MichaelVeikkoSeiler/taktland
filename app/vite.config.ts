import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // relativer Pfad, damit die App auch in einem Unterordner läuft
  base: './',
  plugins: [react(), tailwindcss()],
})
