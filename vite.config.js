import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // .venv (rembg) e os originais não fazem parte do site
    watch: { ignored: ['**/.venv/**', '**/assets-src/**', '**/.cache/**'] },
  },
  optimizeDeps: { entries: ['index.html'] },
});
