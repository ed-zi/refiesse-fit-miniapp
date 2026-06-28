import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project pages under /<repo-name>/.
// Keep relative local development intact while making production assets resolve correctly.
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/refiesse-fit-miniapp/' : '/',
  plugins: [react()],
})
