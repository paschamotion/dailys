import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Relative Pfade: läuft unter jeder Adresse, z. B. https://<name>.github.io/dailys/
  base: './',
  // Auch ältere iPhones (iOS 14/15) sollen die App ausführen können
  build: { target: ['es2020', 'safari14'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
