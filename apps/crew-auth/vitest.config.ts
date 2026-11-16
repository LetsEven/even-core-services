import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // scrypt es costoso a proposito: con turbo corriendo build/lint en paralelo el margen por defecto (5 s) es justo.
    testTimeout: 20_000,
  },
})
