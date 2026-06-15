import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // roda testes em sequência — evita conflito no banco de teste
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/lib/**',
        'src/plugins/**',
        'src/jobs/**',
        '**/*.schema.ts',
      ],
    },
  },
})