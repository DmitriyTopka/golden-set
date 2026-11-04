import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge serves Custom UI from a sub-path, so asset URLs must be relative.
export default defineConfig({ base: './', plugins: [react()], build: { outDir: 'dist', emptyOutDir: true } });
