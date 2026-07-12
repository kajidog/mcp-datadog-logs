import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  bundle: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node20',
})
